// Vercel Serverless Function for 맘곁 RAG Search
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
    const { query, categoryId, stage, limit = 5 } = req.body;

    if (!query && !categoryId) {
      return res.status(400).json({ error: 'query or categoryId required' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // 검색어 처리
    const searchTerm = query ? query.trim().toLowerCase() : '';
    
    // 맘곁 키워드 매핑 (임신/출산/육아 전반 커버)
    const keywordMap = {
      // ====== 임신 준비 (예비맘곁) ======
      '임신준비': ['임신준비', '난임', '배란', '기초체온', '엽산'],
      '난임': ['난임', '불임', '시험관', '인공수정', '배란유도'],
      '배란': ['배란', '배란일', '배란기', '가임기', '기초체온'],
      '엽산': ['엽산', '비타민', '임신준비', '영양제'],
      
      // ====== 임신 초기 ======
      '입덧': ['입덧', '구토', '메스꺼움', '임신초기', '입덧음식'],
      '태아': ['태아', '태동', '태아발달', '초음파'],
      '태동': ['태동', '태아움직임', '태아발달'],
      '임신테스트': ['임신테스트', '임테기', '임신확인', 'hCG'],
      '유산': ['유산', '절박유산', '계류유산', '자연유산'],
      
      // ====== 임신 중기/후기 ======
      '태교': ['태교', '음악태교', '태담', '태아교감'],
      '산전검사': ['산전검사', '기형아검사', '양수검사', '초음파'],
      '임신성당뇨': ['임신성당뇨', '당뇨', '혈당', '식이조절'],
      '임신중독증': ['임신중독증', '자간전증', '부종', '고혈압'],
      '조기진통': ['조기진통', '조산', '자궁수축', '입원'],
      
      // ====== 출산 ======
      '진통': ['진통', '출산', '분만', '이슬', '양수파수'],
      '출산준비': ['출산준비', '출산가방', '입원준비물', '분만'],
      '무통': ['무통분만', '경막외마취', '무통주사'],
      '제왕절개': ['제왕절개', '씨섹션', '수술분만', '회복'],
      '유도분만': ['유도분만', '촉진', '자궁수축'],
      '분만': ['분만', '자연분만', '출산', '진통'],
      
      // ====== 산후조리 ======
      '산후조리': ['산후조리', '산후회복', '산후조리원', '조리원'],
      '산후우울': ['산후우울', '산후우울증', '우울', '기분변화', '베이비블루스'],
      '오로': ['오로', '산후출혈', '악로', '자궁회복'],
      '회음부': ['회음부', '회음절개', '봉합', '좌욕'],
      '산후붓기': ['산후붓기', '부종', '붓기빼기'],
      '산후다이어트': ['산후다이어트', '몸매회복', '체중감량'],
      
      // ====== 모유수유 ======
      '젖양': ['젖양', '모유량', '부족', '늘리기', '분비'],
      '모유량': ['모유량', '젖양', '부족', '늘리기'],
      '젖몸살': ['젖몸살', '울혈', '가슴통증', '열감'],
      '유선염': ['유선염', '열', '감염', '항생제', '병원'],
      '유두상처': ['유두상처', '균열', '갈라짐', '출혈'],
      '젖거부': ['젖거부', '거부', '유두혼동', '피부접촉'],
      '유두혼동': ['유두혼동', '젖병거부', '젖거부'],
      '래치': ['래치', '딥래치', '깊은물림', '자세'],
      '수유자세': ['수유자세', '안기', '요람', '풋볼'],
      '밤수유': ['밤수유', '야간수유', '수면', '밤중수유'],
      '단유': ['단유', '젖떼기', '이유'],
      '유축': ['유축', '펌프', '저장', '보관', '냉동'],
      '모유보관': ['모유보관', '냉동', '해동', '저장'],
      
      // ====== 신생아 ======
      '신생아': ['신생아', '출생', '초보맘'],
      '황달': ['황달', '빌리루빈', '광선치료', '황달수치'],
      '배꼽': ['배꼽', '탯줄', '배꼽관리', '배꼽탈장'],
      '신생아목욕': ['신생아목욕', '목욕', '목욕시키기'],
      '기저귀': ['기저귀', '기저귀발진', '기저귀교체'],
      '신생아수면': ['신생아수면', '수면패턴', '잠', '재우기'],
      '영아산통': ['영아산통', '배앓이', '울음', '콜릭'],
      '아구창': ['아구창', '구강칸디다', '하얀막'],
      
      // ====== 영아 발달 ======
      '뒤집기': ['뒤집기', '대근육', '발달', '운동발달'],
      '이유식': ['이유식', '이유', '고형식', '시작'],
      '분유': ['분유', '혼합수유', '분유량'],
      '예방접종': ['예방접종', '접종', '백신', '예방주사'],
      '성장': ['성장', '체중', '키', '성장곡선', '발달'],
      '대근육': ['대근육', '운동발달', '앉기', '기기'],
      '소근육': ['소근육', '잡기', '손놀림'],
      '언어발달': ['언어발달', '옹알이', '말', '언어'],
      
      // ====== 유아 (우리맘곁) ======
      '어린이집': ['어린이집', '적응', '분리불안', '등원'],
      '훈육': ['훈육', '양육', '떼쓰기', '훈육방법'],
      '편식': ['편식', '밥안먹음', '식습관'],
      '배변훈련': ['배변훈련', '기저귀떼기', '화장실'],
      '수면교육': ['수면교육', '잠', '수면습관', '통잠'],
      
      // ====== 긴급/응급 ======
      '열': ['열', '발열', '고열', '해열제', '응급'],
      '구토': ['구토', '토함', '장염'],
      '설사': ['설사', '장염', '탈수'],
      '응급': ['응급', '병원', '즉시', '위험']
    };

    // 스테이지별 가중치 조정
    const stageKeywords = {
      'prep': ['임신준비', '난임', '배란', '엽산', '기초체온'],
      'pregnancy': ['임신', '태아', '입덧', '태교', '산전검사', '진통', '출산'],
      'infant': ['신생아', '수유', '젖양', '황달', '이유식', '발달'],
      'toddler': ['훈육', '어린이집', '배변훈련', '언어발달', '편식']
    };

    // 검색어에서 관련 키워드 추출
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

    // 스테이지 기반 가중치 키워드 추가
    let stageBoostKeywords = [];
    if (stage && stageKeywords[stage]) {
      stageBoostKeywords = stageKeywords[stage];
    }

    // Supabase REST API로 직접 검색
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

    // 검색어가 있으면 필터링 및 점수 계산
    if (searchTerm) {
      results = results.map(item => {
        let score = 0;
        const title = (item.title || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ').toLowerCase() : '';

        // 정확한 검색어 매칭
        if (title.includes(searchTerm)) score += 15;
        if (content.includes(searchTerm)) score += 8;
        if (keywords.includes(searchTerm)) score += 12;

        // 우선순위 키워드 매칭
        for (const kw of priorityKeywords) {
          if (title.includes(kw)) score += 10;
          if (content.includes(kw)) score += 6;
          if (keywords.includes(kw)) score += 8;
        }

        // 확장 키워드 매칭
        for (const kw of expandedKeywords) {
          if (!priorityKeywords.includes(kw)) {
            if (title.includes(kw)) score += 2;
            if (content.includes(kw)) score += 1;
            if (keywords.includes(kw)) score += 2;
          }
        }

        // 스테이지 기반 가중치
        for (const kw of stageBoostKeywords) {
          if (title.includes(kw) || content.includes(kw)) score += 3;
        }

        // 긴급도 보너스
        if (item.urgency === '즉시대응필요') score += 3;
        else if (item.urgency === '24시간내확인') score += 2;

        return { ...item, score };
      });

      results = results.filter(item => item.score > 0 && item.content && item.content.length >= 50);
      results.sort((a, b) => b.score - a.score);
    }

    results = results.slice(0, limit);

    return res.status(200).json({
      success: true,
      results: results,
      count: results.length,
      query: searchTerm,
      stage: stage || null,
      expandedKeywords: expandedKeywords
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: 'Search failed', 
      message: error.message 
    });
  }
}
