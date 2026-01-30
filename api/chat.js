// Vercel Serverless Function for AI Chat
const https = require('https');

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
            try {
                ragContext = await searchRAG(query, SUPABASE_URL, SUPABASE_KEY);
            } catch (e) {
                console.error('RAG search error:', e.message);
            }
        }
        
        // 2. 응답 생성
        let answer = '';
        if (ragContext.length > 0) {
            const item = ragContext[0];
            answer = item.title ? `**${item.title}**\n\n${item.content}` : item.content;
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
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: () => JSON.parse(data) });
                } catch (e) {
                    resolve({ ok: false, json: () => ({}) });
                }
            });
        });
        
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function searchRAG(query, supabaseUrl, supabaseKey) {
    const searchTerm = query.trim().toLowerCase();
    
    const keywordMap = {
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
