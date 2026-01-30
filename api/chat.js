// Vercel Serverless Function for AI Chat
const fetch = require('node-fetch');

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
        const { query, mateType, userInfo } = req.body;
        
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
        
        // 2. Claude API 또는 폴백
        let answer = '';
        if (ANTHROPIC_API_KEY && ragContext.length > 0) {
            try {
                answer = await callClaude(query, ragContext, mateType, userInfo, ANTHROPIC_API_KEY);
            } catch (e) {
                console.error('Claude error:', e);
                answer = formatRAGResponse(ragContext[0]);
            }
        } else if (ragContext.length > 0) {
            answer = formatRAGResponse(ragContext[0]);
        } else {
            answer = '죄송해요, 관련 정보를 찾지 못했어요. 😢\n\n다른 방식으로 질문해 주시거나, 전문가 상담을 이용해 보세요!';
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
};

async function searchRAG(query, supabaseUrl, supabaseKey) {
    const searchTerm = query.trim().toLowerCase();
    
    const keywordMap = {
        '젖몸살': ['젖몸살', '울혈', '유방울혈'],
        '유선염': ['유선염', '열', '감염'],
        '젖양': ['젖양', '모유량', '부족', '늘리기'],
        '증가': ['젖양', '늘리기', '모유량', '증가'],
        '부족': ['젖양부족', '모유부족', '늘리기', '젖양'],
        '밤수유': ['밤수유', '야간수유', '수면'],
        '이유식': ['이유식', '고형식', '시작'],
        '모유': ['모유', '수유', '젖양']
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

async function callClaude(query, context, mateType, userInfo, apiKey) {
    const systemPrompt = `당신은 '맘곁' 육아 컴패니언 AI입니다. 모유수유, 임신, 출산, 육아 전문 상담을 제공합니다. 공감적이고 따뜻한 태도로, 200-400자 내외의 답변을 해주세요. 이모지를 적절히 사용하고, 심각한 증상은 전문가 상담을 권유해주세요.`;

    const contextText = context.map((item, i) => 
        `[${i + 1}] ${item.title}: ${item.content}`
    ).join('\n\n');
    
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
                content: `참고 정보:\n${contextText}\n\n사용자 질문: ${query}`
            }]
        })
    });
    
    if (!response.ok) throw new Error('Claude API failed');
    
    const data = await response.json();
    return data.content[0].text;
}

function formatRAGResponse(item) {
    if (!item) return '';
    let response = '';
    if (item.title) response += `**${item.title}**\n\n`;
    if (item.content) response += item.content;
    return response;
}
