// Vercel Serverless Function for 맘곁 AI Chat
// POST /api/chat
// RAG 검색 + 대화 히스토리 저장 통합

export default async function handler(req, res) {
    // CORS 설정
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
        const { query, userInfo, conversationId, stage } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'query required' });
        }
        
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
        
        if (!ANTHROPIC_API_KEY) {
            return res.status(500).json({ error: 'AI API not configured' });
        }

        // 1. RAG 검색 실행
        let context = [];
        if (SUPABASE_URL && SUPABASE_KEY) {
            context = await searchKnowledge(query, stage, SUPABASE_URL, SUPABASE_KEY);
        }
        
        // 2. Claude API 호출
        const response = await callClaude(query, context, userInfo, stage, ANTHROPIC_API_KEY);
        
        // 3. 대화 히스토리 저장
        if (SUPABASE_URL && SUPABASE_KEY) {
            await saveConversation(query, response.answer, userInfo, conversationId, SUPABASE_URL, SUPABASE_KEY);
        }
        
        return res.status(200).json({
            success: true,
            answer: response.answer,
            model: response.model,
            contextUsed: context.length,
            conversationId: conversationId
        });
        
    } catch (error) {
        console.error('Chat error:', error);
        return res.status(500).json({ 
            error: 'Chat failed',
            message: error.message 
        });
    }
}

// RAG 검색 함수
async function searchKnowledge(query, stage, supabaseUrl, supabaseKey) {
    try {
        // 키워드 매핑
        const keywordMap = {
            '입덧': ['입덧', '구토', '메스꺼움'],
            '젖양': ['젖양', '모유량', '부족'],
            '산후우울': ['산후우울', '우울', '기분변화'],
            '황달': ['황달', '빌리루빈', '광선치료'],
            '이유식': ['이유식', '고형식', '시작'],
            '밤수유': ['밤수유', '야간수유', '수면'],
            '진통': ['진통', '출산', '분만'],
            '태동': ['태동', '태아움직임'],
            '열': ['열', '발열', '해열제'],
            '수유자세': ['수유자세', '래치', '물림']
        };

        const searchTerm = query.toLowerCase();
        let expandedTerms = [searchTerm];
        
        for (const [key, values] of Object.entries(keywordMap)) {
            if (searchTerm.includes(key)) {
                expandedTerms = [...expandedTerms, ...values];
            }
        }

        // Supabase 검색
        const url = `${supabaseUrl}/rest/v1/knowledge_units?select=*`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        if (!response.ok) return [];

        let results = await response.json();
        
        // 점수 계산 및 필터링
        results = results.map(item => {
            let score = 0;
            const title = (item.title || '').toLowerCase();
            const content = (item.content || '').toLowerCase();
            
            for (const term of expandedTerms) {
                if (title.includes(term)) score += 10;
                if (content.includes(term)) score += 5;
            }
            
            return { ...item, score };
        });

        results = results
            .filter(item => item.score > 0 && item.content)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        return results;
    } catch (error) {
        console.error('RAG search error:', error);
        return [];
    }
}

// Claude API 호출
async function callClaude(query, context, userInfo, stage, apiKey) {
    const systemPrompt = getSystemPrompt(userInfo, stage);
    const contextText = formatContext(context);
    
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
            messages: [
                {
                    role: 'user',
                    content: contextText 
                        ? `참고 정보:\n${contextText}\n\n질문: ${query}`
                        : query
                }
            ]
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API failed: ${error}`);
    }
    
    const data = await response.json();
    
    return {
        answer: data.content[0].text,
        model: 'claude-3-haiku'
    };
}

// 맘곁 시스템 프롬프트
function getSystemPrompt(userInfo, stage) {
    const stagePrompts = {
        'prep': '임신 준비 중인 예비맘을 위한',
        'pregnancy': '임신 중인 예비맘을 위한',
        'infant': '신생아/영아를 키우는 엄마를 위한',
        'toddler': '유아를 키우는 엄마를 위한'
    };

    const stageContext = stagePrompts[stage] || '엄마를 위한';

    return `당신은 '맘곁' AI 컴패니언입니다. ${stageContext} 따뜻하고 전문적인 조언을 제공합니다.

## 역할
- 임신/출산/육아 전문 상담사
- 공감적이고 지지적인 태도
- 과학적 근거 기반 정보 제공
- 엄마의 마음을 헤아리는 친구

## 응답 스타일
- 따뜻하고 친근한 말투 (반말 OK)
- 핵심 정보를 먼저 제공
- 이모지를 적절히 사용
- 200-400자 내외로 간결하게
- 응급 상황은 명확히 경고

## 위기 감지
아래 키워드 발견 시 즉시 위기 대응:
- "죽고싶", "자해", "극단적", "힘들어서 못하겠"
→ 공감 + 전문 상담 권유 + 핫라인 안내 (1393)

## 주의사항
- 의료 진단을 하지 않음
- 심각한 증상은 전문가 상담 권유
- 불확실한 정보는 제공하지 않음
- 엄마를 절대 비난하지 않음

${userInfo ? `## 사용자 정보\n닉네임: ${userInfo.nickname || '엄마'}\n스테이지: ${stage || '일반'}` : ''}`;
}

// 컨텍스트 포맷팅
function formatContext(context) {
    if (!context || !Array.isArray(context) || context.length === 0) return '';
    
    return context.map((item, i) => 
        `[${i + 1}] ${item.title}\n${item.content?.substring(0, 500)}`
    ).join('\n\n');
}

// 대화 히스토리 저장
async function saveConversation(query, answer, userInfo, conversationId, supabaseUrl, supabaseKey) {
    try {
        const url = `${supabaseUrl}/rest/v1/conversations`;
        
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                conversation_id: conversationId || `conv_${Date.now()}`,
                user_message: query,
                ai_response: answer,
                user_info: userInfo || {},
                created_at: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('Save conversation error:', error);
        // 저장 실패해도 응답은 반환
    }
}
