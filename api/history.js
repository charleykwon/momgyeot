// Vercel Serverless Function for Conversation History
// GET /api/history?userId=xxx

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { userId, mateType, limit = 20, offset = 0 } = req.query;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
        
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).json({ error: 'Supabase not configured' });
        }
        
        let url = `${SUPABASE_URL}/rest/v1/conversations?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&offset=${offset}`;
        
        if (mateType) {
            url += `&mate_type=eq.${mateType}`;
        }
        
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch history');
        }
        
        const conversations = await response.json();
        
        // 날짜별 그룹화
        const grouped = groupByDate(conversations);
        
        return res.status(200).json({
            success: true,
            conversations: conversations,
            grouped: grouped,
            count: conversations.length
        });
        
    } catch (error) {
        console.error('History error:', error);
        return res.status(500).json({ error: 'History failed', message: error.message });
    }
}

// 날짜별 그룹화
function groupByDate(conversations) {
    const groups = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    conversations.forEach(conv => {
        const date = new Date(conv.created_at).toDateString();
        let label;
        
        if (date === today) {
            label = '오늘';
        } else if (date === yesterday) {
            label = '어제';
        } else {
            const d = new Date(conv.created_at);
            label = `${d.getMonth() + 1}월 ${d.getDate()}일`;
        }
        
        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(conv);
    });
    
    return groups;
}
