// Vercel Serverless Function for Conversation History
// GET/POST /api/history

export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase not configured' });
    }

    try {
        if (req.method === 'GET') {
            // 대화 목록 조회
            const { conversationId, userId, limit = 20 } = req.query;
            
            let url = `${SUPABASE_URL}/rest/v1/conversations?select=*&order=created_at.desc&limit=${limit}`;
            
            if (conversationId) {
                url += `&conversation_id=eq.${conversationId}`;
            }
            
            if (userId) {
                url += `&user_id=eq.${userId}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch history');
            }

            const data = await response.json();

            return res.status(200).json({
                success: true,
                conversations: data,
                count: data.length
            });
        }

        if (req.method === 'POST') {
            // 대화 저장
            const { conversationId, userMessage, aiResponse, userInfo, stage } = req.body;

            if (!userMessage || !aiResponse) {
                return res.status(400).json({ error: 'userMessage and aiResponse required' });
            }

            const url = `${SUPABASE_URL}/rest/v1/conversations`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    conversation_id: conversationId || `conv_${Date.now()}`,
                    user_message: userMessage,
                    ai_response: aiResponse,
                    user_info: userInfo || {},
                    stage: stage || null,
                    created_at: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save conversation');
            }

            const data = await response.json();

            return res.status(200).json({
                success: true,
                saved: data[0]
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('History error:', error);
        return res.status(500).json({
            error: 'History operation failed',
            message: error.message
        });
    }
}
