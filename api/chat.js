import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const keywordExpansions = {
  '입덧': ['입덧', '구토', '메스꺼움', '오심'],
  '태동': ['태동', '태아 움직임', '아기 움직임'],
  '임신초기': ['임신 초기', '임신초기', '1분기'],
  '운동': ['운동', '요가', '스트레칭', '걷기'],
  '영양': ['영양', '음식', '식단', '비타민', '엽산'],
  '출산': ['출산', '분만', '진통'],
};

function expandKeywords(query) {
  let keywords = query.toLowerCase().split(/\s+/);
  let expanded = [...keywords];
  for (const [key, synonyms] of Object.entries(keywordExpansions)) {
    if (keywords.some(k => k.includes(key) || key.includes(k))) {
      expanded.push(...synonyms);
    }
  }
  return [...new Set(expanded)];
}

async function searchRAG(query) {
  try {
    const keywords = expandKeywords(query);
    const searchPromises = keywords.slice(0, 5).map(keyword =>
      supabase
        .from('rag_chunks')
        .select('*')
        .ilike('content', `%${keyword}%`)
        .limit(3)
    );
    const results = await Promise.all(searchPromises);
    const allChunks = [];
    const seenIds = new Set();
    for (const { data } of results) {
      if (data) {
        for (const chunk of data) {
          if (!seenIds.has(chunk.id)) {
            seenIds.add(chunk.id);
            allChunks.push(chunk);
          }
        }
      }
    }
    return allChunks.slice(0, 5);
  } catch (error) {
    console.error('RAG search error:', error);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { model, max_tokens, system, messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'messages required' });
    }

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const userQuery = lastUserMessage?.content || '';

    let ragContext = '';
    if (userQuery) {
      const chunks = await searchRAG(userQuery);
      if (chunks.length > 0) {
        ragContext = '\n\n[참고 정보]\n' + chunks.map(c => c.content).join('\n\n');
      }
    }

    const enhancedSystem = (system || '') + ragContext;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1024,
        system: enhancedSystem,
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
