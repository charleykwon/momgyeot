// Vercel Serverless Function for 맘곁 AI Chat
// POST /api/chat

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
        // message 또는 query 둘 다 지원
        const { message, query, stage, history, userInfo, conversationId } = req.body;
        const userMessage = message || query;
        
        if (!userMessage) {
            return res.status(400).json({ error: 'message or query required' });
        }
        
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        
        if (!ANTHROPIC_API_KEY) {
            return res.status(500).json({ error: 'AI API not configured' });
        }
        
        // Claude API 호출
        const answer = await callClaude(userMessage, stage, history, ANTHROPIC_API_KEY);
        
        // 다양한 필드명으로 응답 (호환성)
        return res.status(200).json({
            success: true,
            response: answer,
            answer: answer,
            message: answer
        });
        
    } catch (error) {
        console.error('Chat error:', error);
        return res.status(500).json({ 
            error: 'Chat failed',
            message: error.message 
        });
    }
}

// Claude API 호출
async function callClaude(userMessage, stage, history, apiKey) {
    const systemPrompt = getSystemPrompt(stage);
    
    // 대화 히스토리 구성
    const messages = [];
    
    if (history && Array.isArray(history)) {
        for (const h of history.slice(-6)) {
            messages.push({
                role: h.role,
                content: h.content
            });
        }
    }
    
    // 현재 메시지 추가
    messages.push({
        role: 'user',
        content: userMessage
    });
    
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
            messages: messages
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API failed: ${error}`);
    }
    
    const data = await response.json();
    return data.content[0].text;
}

// 맘곁 시스템 프롬프트
function getSystemPrompt(stage) {
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
- 따뜻하고 친근한 말투
- 핵심 정보를 먼저 제공
- 이모지를 적절히 사용 💕
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
- 엄마를 절대 비난하지 않음`;
}
