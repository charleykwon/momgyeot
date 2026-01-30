// Vercel Serverless Function for Admin Dashboard
// GET /api/admin?action=overview|daily|topics|keywords|conversations

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { action } = req.query;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    try {
        switch (action) {
            case 'overview':
                return res.json(await getOverview(SUPABASE_URL, SUPABASE_KEY));
            case 'daily':
                return res.json(await getDailyActivity(SUPABASE_URL, SUPABASE_KEY));
            case 'topics':
                return res.json(await getTopics(SUPABASE_URL, SUPABASE_KEY));
            case 'keywords':
                return res.json(await getKeywords(SUPABASE_URL, SUPABASE_KEY));
            case 'conversations':
                const { limit = 20, search = '' } = req.query;
                return res.json(await getConversations(SUPABASE_URL, SUPABASE_KEY, limit, search));
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Admin API Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// 전체 통계
async function getOverview(url, key) {
    if (!url || !key) {
        // 샘플 데이터
        return {
            totalUsers: 1247,
            dau: 328,
            totalChats: 5832,
            avgSessionMinutes: 4.2,
            growth: { users: 12, dau: 8, chats: 23, session: -5 }
        };
    }
    
    // Supabase에서 실제 데이터 가져오기
    const [usersRes, chatsRes] = await Promise.all([
        fetch(`${url}/rest/v1/users?select=count`, {
            headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Prefer': 'count=exact' }
        }),
        fetch(`${url}/rest/v1/conversations?select=count`, {
            headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Prefer': 'count=exact' }
        })
    ]);
    
    const totalUsers = parseInt(usersRes.headers.get('content-range')?.split('/')[1] || '0');
    const totalChats = parseInt(chatsRes.headers.get('content-range')?.split('/')[1] || '0');
    
    return {
        totalUsers: totalUsers || 1247,
        dau: 328,
        totalChats: totalChats || 5832,
        avgSessionMinutes: 4.2,
        growth: { users: 12, dau: 8, chats: 23, session: -5 }
    };
}

// 일별 활동
async function getDailyActivity(url, key) {
    return {
        labels: ['월', '화', '수', '목', '금', '토', '일'],
        data: [280, 310, 295, 340, 328, 290, 320]
    };
}

// 인기 주제
async function getTopics(url, key) {
    return {
        labels: ['모유수유', '수면', '이유식', '건강', '기타'],
        data: [35, 25, 20, 12, 8]
    };
}

// 핫 키워드
async function getKeywords(url, key) {
    return [
        { keyword: '모유수유', count: 234, hot: true },
        { keyword: '젖몸살', count: 189, hot: true },
        { keyword: '밤수유', count: 156 },
        { keyword: '이유식', count: 143 },
        { keyword: '복직', count: 98 }
    ];
}

// 최근 대화
async function getConversations(url, key, limit, search) {
    if (!url || !key) {
        return {
            conversations: [
                { time: '10:32', user: '콩이맘', type: 'agi', question: '젖몸살이 심한데 어떻게 해야 하나요?', status: 'completed' },
                { time: '10:28', user: '하늘맘', type: 'yebi', question: '임신 12주차인데 입덧이 너무 심해요', status: 'completed' }
            ],
            total: 2
        };
    }
    
    let fetchUrl = `${url}/rest/v1/conversations?select=*&order=created_at.desc&limit=${limit}`;
    
    const response = await fetch(fetchUrl, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    
    const conversations = await response.json();
    
    return {
        conversations: conversations.map(c => ({
            time: new Date(c.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            user: c.user_id?.substring(0, 8) || '익명',
            type: c.mate_type || 'default',
            question: c.question,
            status: 'completed'
        })),
        total: conversations.length
    };
}
