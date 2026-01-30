// Vercel Serverless Function for Admin API
// GET /api/admin - 통계 조회
// POST /api/admin - 관리자 로그인

export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'momgyeot2024';

    try {
        if (req.method === 'POST') {
            // 관리자 로그인
            const { password } = req.body;
            
            if (password === ADMIN_PASSWORD) {
                return res.status(200).json({
                    success: true,
                    token: Buffer.from(`admin:${Date.now()}`).toString('base64')
                });
            }
            
            return res.status(401).json({ error: 'Invalid password' });
        }

        if (req.method === 'GET') {
            // 관리자 통계 조회
            const authHeader = req.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            if (!SUPABASE_URL || !SUPABASE_KEY) {
                return res.status(500).json({ error: 'Supabase not configured' });
            }

            // 통계 데이터 수집
            const stats = await getStats(SUPABASE_URL, SUPABASE_KEY);

            return res.status(200).json({
                success: true,
                stats: stats
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Admin error:', error);
        return res.status(500).json({
            error: 'Admin operation failed',
            message: error.message
        });
    }
}

async function getStats(supabaseUrl, supabaseKey) {
    const headers = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
    };

    // 오늘 날짜
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 전체 대화 수
    const totalRes = await fetch(
        `${supabaseUrl}/rest/v1/conversations?select=id`,
        { headers }
    );
    const totalData = await totalRes.json();
    const totalConversations = Array.isArray(totalData) ? totalData.length : 0;

    // 오늘 대화 수
    const todayRes = await fetch(
        `${supabaseUrl}/rest/v1/conversations?select=id&created_at=gte.${today}`,
        { headers }
    );
    const todayData = await todayRes.json();
    const todayConversations = Array.isArray(todayData) ? todayData.length : 0;

    // 이번 주 대화 수
    const weekRes = await fetch(
        `${supabaseUrl}/rest/v1/conversations?select=id&created_at=gte.${weekAgo}`,
        { headers }
    );
    const weekData = await weekRes.json();
    const weekConversations = Array.isArray(weekData) ? weekData.length : 0;

    // 지식 유닛 수
    const knowledgeRes = await fetch(
        `${supabaseUrl}/rest/v1/knowledge_units?select=id`,
        { headers }
    );
    const knowledgeData = await knowledgeRes.json();
    const totalKnowledge = Array.isArray(knowledgeData) ? knowledgeData.length : 0;

    // 최근 대화 5개
    const recentRes = await fetch(
        `${supabaseUrl}/rest/v1/conversations?select=*&order=created_at.desc&limit=5`,
        { headers }
    );
    const recentConversations = await recentRes.json();

    return {
        totalConversations,
        todayConversations,
        weekConversations,
        totalKnowledge,
        recentConversations: Array.isArray(recentConversations) ? recentConversations : []
    };
}
