// Vercel Serverless Function for AI Chat
// POST /api/chat - RAG 검색 + Claude 응답 + 대화 저장

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { query, userId, mateType, userInfo } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'query required' });
        }
        
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        
        // 1. RAG 검색
        let ragContext = [];
        if (SUPABASE_URL && SUPABASE_KEY) {
            ragContext = await searchRAG(query, SUPABASE_URL, SUPABASE_KEY);
        }
        
        // 2. Claude API 호출
        let answer = '';
        if (ANTHROPIC_API_KEY) {
            answer = await callClaude(query, ragContext, mateType, userInfo, ANTHROPIC_API_KEY);
        } else {
            // API 키 없으면 RAG 결과만 반환
            if (ragContext.length > 0) {
                answer = formatRAGResponse(ragContext[0]);
            } else {
                answer = '죄송해요, 관련 정보를 찾지 못했어요. 다른 방식으로 질문해 주시거나, 전문가 상담을 이용해 보세요!';
            }
        }
        
        // 3. 대화 저장 (userId가 있으면)
        if (userId && SUPABASE_URL && SUPABASE_KEY) {
            await saveConversation(userId, mateType, query, answer, SUPABASE_URL, SUPABASE_KEY);
        }
        
        return res.status(200).json({
            success: true,
            answer: answer,
            ragResults: ragContext.slice(0, 3),
            related: ragContext.slice(1, 4).map(r => r.title)
        });
        
    } catch (error) {
        console.error('Chat error:', error);
        return res.status(500).json({ error: 'Chat failed', message: error.message });
    }
}

// RAG 검색 함수
async function searchRAG(query, supabaseUrl, supabaseKey) {
    const searchTerm = query.trim().toLowerCase();
    
    // 키워드 매핑
    const keywordMap = {
        '젖몸살': ['젖몸살', '울혈', '유방울혈'],
        '유선염': ['유선염', '열', '감염'],
        '젖양': ['젖양', '모유량', '부족', '늘리기'],
        '밤수유': ['밤수유', '야간수유', '수면'],
        '이유식': ['이유식', '고형식', '시작'],
        '입덧': ['입덧', '오심', '구토'],
        '태교': ['태교', '태담'],
        '산후우울': ['산후우울', '우울증'],
        '황달': ['황달', '신생아']
    };
    
    let expandedKeywords = [searchTerm];
    for (const [key, values] of Object.entries(keywordMap)) {
        if (searchTerm.includes(key)) {
            expandedKeywords = [...expandedKeywords, ...values];
        }
    }
    
    const response = await fetch(`${supabaseUrl}/rest/v1/knowledge_units?select=*`, {
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    
    if (!response.ok) return [];
    
    let results = await response.json();
    
    results = results.map(item => {
        let score = 0;
        const title = (item.title || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        
        for (const kw of expandedKeywords) {
            if (title.includes(kw)) score += 10;
            if (content.includes(kw)) score += 5;
        }
        
        if (item.urgency === '즉시대응필요') score += 3;
        
        return { ...item, score };
    });
    
    return results
        .filter(item => item.score > 0 && item.content)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}

// Claude API 호출
async function callClaude(query, context, mateType, userInfo, apiKey) {
    const systemPrompt = getSystemPrompt(mateType, userInfo);
    const contextText = context.map((item, i) => 
        `[${i + 1}] ${item.title}\n${item.content}`
    ).join('\n\n') || '관련 정보 없음';
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{
                role: 'user',
                content: `참고 정보:\n${contextText}\n\n질문: ${query}`
            }]
        })
    });
    
    if (!response.ok) {
        throw new Error('Claude API failed');
    }
    
    const data = await response.json();
    return data.content[0].text;
}

// 맘곁 시스템 프롬프트
function getSystemPrompt(mateType, userInfo) {
    const basePrompt = `당신은 '맘곁' 육아 컴패니언 AI입니다.

## 역할
- 모유수유, 임신, 출산, 육아 전문 상담
- 공감적이고 따뜻한 태도
- 과학적 근거 기반 정보

## 응답 스타일
- 친근하고 따뜻한 말투 (반말/존댓말 혼용 가능)
- 핵심 정보 먼저, 200-300자 내외
- 이모지 적절히 사용 💕
- 심각한 증상은 전문가 상담 권유

## 주의사항
- 의료 진단 금지
- 불확실한 정보 제공 금지
- 응급상황은 즉시 병원 안내`;

    const matePrompts = {
        'saessak': '\n\n## 예비맘곁 모드\n임신 준비 중인 분을 위한 맞춤 조언',
        'yebi': '\n\n## 임신맘곁 모드\n임신 중인 분을 위한 맞춤 조언',
        'agi': '\n\n## 초보맘곁 모드\n출산 후 육아 중인 분을 위한 맞춤 조언'
    };
    
    let prompt = basePrompt + (matePrompts[mateType] || '');
    
    if (userInfo) {
        prompt += `\n\n## 사용자 정보\n${JSON.stringify(userInfo)}`;
    }
    
    return prompt;
}

// RAG 결과 포맷팅 (Claude 없을 때)
function formatRAGResponse(item) {
    if (!item) return '';
    
    let response = '';
    if (item.title) response += `**${item.title}**\n\n`;
    if (item.content) response += item.content;
    
    return response;
}

// 대화 저장
async function saveConversation(userId, mateType, query, answer, supabaseUrl, supabaseKey) {
    try {
        await fetch(`${supabaseUrl}/rest/v1/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                user_id: userId,
                mate_type: mateType || 'default',
                question: query,
                answer: answer,
                created_at: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('Save conversation error:', error);
    }
}
