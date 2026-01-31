// Vercel Serverless Function for AI Chat with Claude
const https = require('https');

// mateType 정규화 함수 (프론트엔드 키 -> API 키)
function normalizeMateType(type) {
    const mapping = {
        'saessak': 'preparing',    // 예비맘곁 (임신준비)
        'yebi': 'pregnant',        // 임신맘곁 (임신중)
        'chobo': 'newborn',        // 초보맘곁 (모유수유)
        'preparing': 'preparing',
        'pregnant': 'pregnant', 
        'newborn': 'newborn'
    };
    return mapping[type] || 'newborn';
}

module.exports = async function handler(req, res) {
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
        const { query, mateType: rawMateType, userInfo } = req.body;
        const mateType = normalizeMateType(rawMateType);
        
        if (!query) {
            return res.status(400).json({ error: 'query required' });
        }
        
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        
        // 1. RAG 검색 (mateType으로 카테고리 필터링)
        let ragContext = [];
        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                ragContext = await searchRAG(query, SUPABASE_URL, SUPABASE_KEY, mateType);
            } catch (e) {
                console.error('RAG search error:', e.message);
            }
        }
        
        // 2. 응답 생성
        let answer = '';
        
        // Claude AI가 있으면 자연스러운 답변 생성 (RAG 결과 유무와 관계없이)
        if (ANTHROPIC_API_KEY) {
            try {
                answer = await generateClaudeResponse(query, ragContext, mateType, userInfo, ANTHROPIC_API_KEY);
            } catch (e) {
                console.error('Claude error:', e.message);
                // Claude 실패시 RAG 결과 직접 사용 또는 기본 메시지
                if (ragContext.length > 0) {
                    const item = ragContext[0];
                    answer = item.title ? `**${item.title}**\n\n${item.content}` : item.content;
                } else {
                    answer = '죄송해요, 지금 답변을 드리기 어려운 상황이에요. 😢\n\n잠시 후 다시 시도해주시거나, 전문가 상담을 이용해 보세요!';
                }
            }
        } else if (ragContext.length > 0) {
            // Claude 없고 RAG 결과 있으면 직접 사용
            const item = ragContext[0];
            answer = item.title ? `**${item.title}**\n\n${item.content}` : item.content;
        } else {
            // Claude도 없고 RAG도 없으면 기본 메시지
            answer = '죄송해요, 관련 정보를 찾지 못했어요. 😢\n\n다른 방식으로 질문해 주시거나, 전문가 상담을 이용해 보세요!';
        }
        
        return res.status(200).json({
            success: true,
            answer: answer,
            ragResults: ragContext.slice(0, 3),
            related: ragContext.slice(1, 4).map(r => r.title)
        });
        
    } catch (error) {
        console.error('Chat error:', error.message);
        return res.status(500).json({ error: 'Chat failed', message: error.message });
    }
};

function httpsRequest(url, options, postData) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };
        
        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: () => JSON.parse(data), status: res.statusCode });
                } catch (e) {
                    resolve({ ok: false, json: () => ({}), status: res.statusCode });
                }
            });
        });
        
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function generateClaudeResponse(query, ragContext, mateType, userInfo, apiKey) {
    // 메이트 타입별 페르소나 (역할과 전문 분야 명확화)
    const personas = {
        'preparing': {
            name: '예비맘곁',
            emoji: '🌱',
            description: '임신을 준비하는 예비 엄마들을 위한 따뜻한 길잡이',
            specialty: '임신 준비, 난임 상담, 배란 체크, 영양제(엽산 등), 기초체온, 병원/시술 정보',
            focus: '임신 준비 과정의 어려움을 공감하고, 정서적 지지와 실질적인 정보를 제공합니다.'
        },
        'pregnant': {
            name: '임신맘곁',
            emoji: '🤰',
            description: '임신 중인 엄마들의 든든한 동반자',
            specialty: '임신 주차별 변화, 입덧, 태동, 태교, 출산 준비, 임신성 당뇨/고혈압',
            focus: '임신 기간 동안의 신체적, 정서적 변화를 함께 하며 건강한 출산을 응원합니다.'
        },
        'newborn': {
            name: '초보맘곁',
            emoji: '👶',
            description: '모유수유와 신생아 케어를 돕는 친근한 도우미',
            specialty: '모유수유, 젖몸살, 유선염, 젖양 조절, 밤수유, 이유식, 신생아 케어',
            focus: '출산 후 모유수유와 육아의 어려움을 함께 해결해나갑니다.'
        }
    };
    
    const persona = personas[mateType] || personas['newborn'];
    
    // RAG 컨텍스트를 문자열로 변환
    let contextStr = '';
    if (ragContext && ragContext.length > 0) {
        contextStr = ragContext.map((item, i) => 
            `[참고자료 ${i + 1}]\n제목: ${item.title}\n내용: ${item.content}`
        ).join('\n\n');
    }
    
    // 사용자 정보 문자열
    let userInfoStr = '';
    if (userInfo) {
        if (userInfo.nickname) userInfoStr += `사용자 닉네임: ${userInfo.nickname}님\n`;
        if (userInfo.babyAge) userInfoStr += `아기 월령: ${userInfo.babyAge}개월\n`;
        if (userInfo.pregnancyWeek) userInfoStr += `임신 주차: ${userInfo.pregnancyWeek}주\n`;
        if (userInfo.answers && userInfo.answers.length > 0) {
            userInfoStr += `온보딩 답변: ${userInfo.answers.join(', ')}\n`;
        }
    }
    
    const systemPrompt = `당신은 "${persona.name}" ${persona.emoji}입니다.
${persona.description}

## 당신의 역할
- 전문 분야: ${persona.specialty}
- 역할 집중: ${persona.focus}

## 중요한 답변 규칙
1. **정체성 유지**: 당신은 오직 "${persona.name}"입니다. 다른 맘곁(예비맘곁, 임신맘곁, 초보맘곁)을 언급하지 마세요.
2. **전문 분야 외 질문**: 당신의 전문 분야가 아닌 질문이라도, 정서적 공감과 위로를 먼저 제공하고, 적절한 전문가(산부인과, 난임전문의, 소아과 등) 상담을 권유하세요.
3. 따뜻하고 공감적인 말투로 답변하세요
4. 존댓말을 사용하세요 (예: ~해요, ~이에요, ~세요)
5. 적절한 이모지를 자연스럽게 사용하세요
6. 답변은 200-400자로 적절하게 해주세요
7. 힘든 상황이라면 먼저 공감하고 위로해주세요

## 답변 포맷 규칙 (필수 준수!)
**[핵심] 소제목 앞에는 반드시 빈 줄을 넣어 문단을 분리하세요!**

✅ 올바른 포맷:
"""
공감 문장이에요.

🌙 수면 패턴 이해하기:
- 신생아는 2-3시간마다 깨는 게 정상이에요
- 낮과 밤 구분이 아직 안 되어 있어요

💡 도움 팁:
- 밤에는 조명을 어둡게 유지하세요
- 수유 후 트림은 꼭 시켜주세요

💪 응원해요:
- 지금이 가장 힘든 시기예요
"""

❌ 잘못된 포맷 (이렇게 하면 안됨):
"""
- 낮과 밤 구분이 안 되어 있어요 도움 팁:
- 밤에는 조명을 어둡게 하세요 응원해요:
"""

소제목과 이전 항목이 같은 줄에 있으면 읽기 어려워요!

${userInfoStr ? `## 사용자 정보\n${userInfoStr}` : ''}

${contextStr ? `## 참고자료 (답변에 활용하세요)\n${contextStr}` : '## 참고자료 없음\n참고자료가 없더라도 공감과 일반적인 조언을 제공해주세요.'}`;

    const postData = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
            { role: 'user', content: query }
        ],
        system: systemPrompt
    });
    
    const response = await httpsRequest('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        }
    }, postData);
    
    if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.content && data.content[0] && data.content[0].text) {
        return data.content[0].text;
    }
    
    throw new Error('Invalid Claude response');
}

async function searchRAG(query, supabaseUrl, supabaseKey, mateType) {
    const searchTerm = query.trim().toLowerCase();
    
    // 메이트 타입별 ID prefix 매핑
    const mateIdPrefixes = {
        'preparing': ['PREP'],  // 예비맘곁 - 임신준비
        'pregnant': ['PREG'],   // 임신맘곁 - 임신중
        'newborn': ['P', 'S', 'M', 'L', 'E', 'B', 'N', 'T', 'C', 'R', 'W']  // 초보맘곁 - 모유수유
    };
    
    // 키워드 확장 매핑
    const keywordMap = {
        // 임신준비 (예비맘곁)
        '엽산': ['엽산', '영양제', '보충제'],
        '배란': ['배란', '배란일', '가임기', '배란테스트'],
        '시험관': ['시험관', 'IVF', '난임', '인공수정'],
        '난임': ['난임', '인공수정', 'IUI', '시험관'],
        '임신준비': ['임신준비', '임신계획', '준비'],
        '체온': ['기초체온', '체온', '배란확인'],
        // 임신중 (임신맘곁)
        '입덧': ['입덧', '구역질', '메스꺼움', '토함'],
        '태동': ['태동', '태아', '움직임'],
        '임신성당뇨': ['임신성당뇨', '당뇨', '혈당'],
        '부종': ['부종', '붓기', '다리'],
        '조산': ['조산', '예방', '배뭉침'],
        '출산': ['출산', '진통', '이슬', '양수'],
        '태교': ['태교', '음악', '동화', '대화'],
        // 모유수유 (초보맘곁)
        '젖몸살': ['젖몸살', '울혈', '유방울혈', '유방'],
        '유선염': ['유선염', '열', '감염', '유방'],
        '젖양': ['젖양', '모유량', '부족', '늘리기'],
        '증가': ['젖양', '늘리기', '모유량', '증가'],
        '부족': ['젖양부족', '모유부족', '늘리기', '젖양'],
        '밤수유': ['밤수유', '야간수유', '수면'],
        '이유식': ['이유식', '고형식', '시작'],
        '모유': ['모유', '수유', '젖양'],
        '아프': ['통증', '아픔', '유두', '젖꼭지']
    };
    
    let expandedKeywords = [searchTerm];
    for (const [key, values] of Object.entries(keywordMap)) {
        if (searchTerm.includes(key)) {
            expandedKeywords = [...expandedKeywords, ...values];
        }
    }
    
    const url = `${supabaseUrl}/rest/v1/knowledge_units?select=*`;
    const response = await httpsRequest(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    
    if (!response.ok) return [];
    
    let results = await response.json();
    
    // 메이트 타입에 따른 필터링
    const allowedPrefixes = mateIdPrefixes[mateType] || [];
    
    results = results.map(item => {
        let score = 0;
        const title = (item.title || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        const id = item.id || '';
        
        // ID prefix로 카테고리 매칭
        let categoryMatch = false;
        if (allowedPrefixes.length > 0) {
            for (const prefix of allowedPrefixes) {
                if (id.startsWith(prefix)) {
                    categoryMatch = true;
                    score += 20; // 카테고리 매칭 보너스
                    break;
                }
            }
        } else {
            // mateType이 없으면 전체 검색
            categoryMatch = true;
        }
        
        // 키워드 매칭
        for (const kw of expandedKeywords) {
            if (title.includes(kw)) score += 10;
            if (content.includes(kw)) score += 5;
        }
        
        // 긴급도 보너스
        if (item.urgency === '즉시대응필요') score += 3;
        
        return { ...item, score, categoryMatch };
    });
    
    // 카테고리 매칭 + 점수 기반 정렬
    return results
        .filter(item => item.score > 0 && item.content && item.categoryMatch)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}
