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
