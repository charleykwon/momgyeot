import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { user_id } = req.method === 'GET' ? req.query : req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id required' });
  }

  try {
    if (req.method === 'GET') {
      // 대화 기록 불러오기 (최근 7일)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user_id)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ messages: data || [] });
    }

    if (req.method === 'POST') {
      // 대화 저장
      const { role, content } = req.body;

      const { error } = await supabase
        .from('conversations')
        .insert({ user_id, role, content });

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

  } catch (error) {
    console.error('History API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
