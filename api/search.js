// Vercel Serverless Function for RAG Search
// POST /api/search

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
    const { query, categoryId, limit = 5 } = req.body;

    if (!query && !categoryId) {
      return res.status(400).json({ error: 'query or categoryId required' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const searchTerm = query ? query.trim().toLowerCase() : '';
    
    // 키워드 매핑 - 맘곁 전체 영역
    const keywordMap = {
      // 모유수유
      '안물': ['젖거부', '거부', '물림거부', '유두혼동'],
      '거부': ['젖거부', '물림거부', '유두혼동'],
      '유두': ['유두', '균열', '상처', '갈라짐', '통증'],
      '균열': ['균열', '갈라짐', '유두상처', '출혈'],
      '열': ['유선염', '열', '감염', '병원', '고열'],
      '젖몸살': ['젖몸살', '울혈', '유방울혈', '통증'],
      '유선염': ['유선염', '열', '감염', '항생제'],
      '젖양': ['젖양', '모유량', '부족', '늘리기'],
      '자세': ['자세', '래치', '물림', '포지션'],
      '밤수유': ['밤수유', '야간수유', '수면'],
      '복직': ['복직', '직장', '유축', '워킹맘'],
      '유축': ['유축', '펌프', '저장', '보관'],
      '이유식': ['이유식', '고형식', '시작'],
      '단유': ['단유', '젖떼기', '이유'],
      
      // 임신
      '입덧': ['입덧', '오심', '구토', '메스꺼움'],
      '태동': ['태동', '아기움직임', '태아'],
      '태교': ['태교', '태담', '음악태교'],
      '엽산': ['엽산', '철분', '영양제'],
      '산전검사': ['산전검사', '기형아검사', '초음파'],
      
      // 출산
      '진통': ['진통', '분만', '출산', '수축'],
      '출산준비': ['출산준비', '입원가방', '분만'],
      '무통': ['무통분만', '경막외', '마취'],
      '제왕절개': ['제왕절개', '수술', '회복'],
      
      // 산후
      '산후우울': ['산후우울', '우울증', '베이비블루스'],
      '산후조리': ['산후조리', '조리원', '회복'],
      
      // 신생아
      '황달': ['황달', '빌리루빈', '신생아'],
      '배꼽': ['배꼽', '탯줄', '소독'],
      '목욕': ['목욕', '신생아목욕'],
      '기저귀': ['기저귀', '발진'],
      
      // 발달
      '발달': ['발달', '성장', '이정표'],
      '뒤집기': ['뒤집기', '대근육', '발달'],
      '언어': ['언어발달', '옹알이', '첫말']
    };

    let expandedKeywords = [searchTerm];
    let priorityKeywords = [];
    
    for (const [key, values] of Object.entries(keywordMap)) {
      if (searchTerm.includes(key)) {
        if (priorityKeywords.length === 0) {
          priorityKeywords = values.slice(0, 3);
        }
        expandedKeywords = [...expandedKeywords, ...values];
      }
    }
    expandedKeywords = [...new Set(expandedKeywords)];

    let url = `${SUPABASE_URL}/rest/v1/knowledge_units?select=*`;
    if (categoryId) {
      url += `&category=eq.${categoryId}`;
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
      throw new Error('Supabase search failed');
    }

    let results = await response.json();

    if (searchTerm) {
      results = results.map(item => {
        let score = 0;
        const title = (item.title || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ').toLowerCase() : '';

        if (title.includes(searchTerm)) score += 15;
        if (content.includes(searchTerm)) score += 8;
        if (keywords.includes(searchTerm)) score += 12;

        for (const kw of priorityKeywords) {
          if (title.includes(kw)) score += 10;
          if (content.includes(kw)) score += 6;
          if (keywords.includes(kw)) score += 8;
        }

        for (const kw of expandedKeywords) {
          if (!priorityKeywords.includes(kw)) {
            if (title.includes(kw)) score += 2;
            if (content.includes(kw)) score += 1;
            if (keywords.includes(kw)) score += 2;
          }
        }

        if (item.urgency === '즉시대응필요') score += 3;
        else if (item.urgency === '24시간내확인') score += 2;

        return { ...item, score };
      });

      results = results.filter(item => item.score > 0 && item.content && item.content.length >= 100);
      results.sort((a, b) => b.score - a.score);
    }

    results = results.slice(0, limit);

    return res.status(200).json({
      success: true,
      results: results,
      count: results.length,
      query: searchTerm
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Search failed', message: error.message });
  }
}
