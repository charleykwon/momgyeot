// 맘곁 RAG Search API
// 임신/육아 전반 지식 검색
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
    
    // 맘곁 키워드 매핑 (임신/출산/육아 전반)
    const keywordMap = {
      // ========== 임신 초기 ==========
      '입덧': ['입덧', '구토', '메스꺼움', '임신초기', '오심', '완화'],
      '메스꺼움': ['입덧', '구토', '메스꺼움', '오심'],
      '임신초기': ['임신초기', '입덧', '착상', '초음파', '주의사항'],
      '임테기': ['임신테스트', '임테기', '확인', '양성', '음성'],
      '착상': ['착상', '착상혈', '임신초기', '수정'],
      '임신확인': ['임신확인', '병원', '초음파', '심장박동'],
      
      // ========== 임신 중기/후기 ==========
      '태동': ['태동', '태아움직임', '임신중기', '느낌', '횟수'],
      '배뭉침': ['배뭉침', '브랙스톤힉스', '가진통', '자궁수축'],
      '부종': ['부종', '붓기', '다리부종', '손부종', '임신후기'],
      '튼살': ['튼살', '임신선', '스트레치마크', '예방', '크림'],
      '요통': ['요통', '허리통증', '골반통', '임신중', '자세'],
      '임신성당뇨': ['임신성당뇨', '당뇨', '혈당', '관리', '식이'],
      
      // ========== 태교 ==========
      '태교': ['태교', '태담', '음악태교', '독서태교', '태아'],
      '태담': ['태담', '태교', '대화', '아기와대화', '교감'],
      '음악태교': ['음악태교', '클래식', '태교음악', '모차르트'],
      '태교여행': ['태교여행', '여행', '임신중여행', '주의사항'],
      
      // ========== 출산 준비 ==========
      '출산': ['출산', '분만', '진통', '출산준비', '입원'],
      '진통': ['진통', '출산', '이슬', '양수', '수축', '간격'],
      '이슬': ['이슬', '출산징후', '진통', '분만임박'],
      '양수': ['양수', '양수터짐', '파수', '응급', '병원'],
      '제왕절개': ['제왕절개', '수술', '회복', '흉터', '마취'],
      '무통분만': ['무통분만', '경막외', '진통제', '분만'],
      '출산가방': ['출산가방', '준비물', '입원', '출산준비'],
      
      // ========== 산후 회복 ==========
      '산후조리': ['산후조리', '회복', '산후', '조리원', '산후도우미'],
      '산후우울': ['산후우울', '우울증', '감정', '정서', '심리', '상담'],
      '오로': ['오로', '산후출혈', '분비물', '회복', '기간'],
      '회음부': ['회음부', '회음절개', '통증', '회복', '좌욕'],
      '산후다이어트': ['산후다이어트', '체중', '운동', '회복', '식단'],
      '골반': ['골반', '골반교정', '산후골반', '벌어짐', '운동'],
      
      // ========== 신생아 케어 ==========
      '신생아': ['신생아', '돌보기', '케어', '목욕', '수유'],
      '배꼽': ['배꼽', '탯줄', '소독', '관리', '떨어짐'],
      '황달': ['황달', '신생아황달', '빌리루빈', '광선치료', '수치'],
      '신생아목욕': ['신생아목욕', '목욕', '통목욕', '온도'],
      '영아산통': ['영아산통', '배앓이', '울음', '100일', '달래기'],
      
      // ========== 수유 (기본) ==========
      '모유수유': ['모유수유', '수유', '젖', '모유', '자세'],
      '분유수유': ['분유수유', '분유', '젖병', '양', '온도'],
      '혼합수유': ['혼합수유', '모유', '분유', '병행'],
      '젖병': ['젖병', '소독', '세척', '교체시기'],
      '분유': ['분유', '타는법', '온도', '양', '브랜드'],
      
      // ========== 아기 발달 ==========
      '발달': ['발달', '성장', '이정표', '월령별', '체크'],
      '뒤집기': ['뒤집기', '발달', '3개월', '4개월', '대근육'],
      '앉기': ['앉기', '혼자앉기', '발달', '6개월', '7개월'],
      '기기': ['기기', '배밀이', '발달', '7개월', '8개월'],
      '걷기': ['걷기', '첫걸음', '발달', '12개월', '대근육'],
      '옹알이': ['옹알이', '언어발달', '소리', '말', '쿠잉'],
      '첫말': ['첫말', '언어', '말', '단어', '발달'],
      
      // ========== 아기 건강 ==========
      '열': ['열', '발열', '체온', '해열제', '병원', '응급'],
      '감기': ['감기', '콧물', '기침', '코막힘', '병원'],
      '기침': ['기침', '가래', '감기', '호흡기', '병원'],
      '콧물': ['콧물', '코막힘', '비염', '흡입기', '코세척'],
      '설사': ['설사', '장염', '탈수', '분유', '로타', '병원'],
      '변비': ['변비', '대변', '배변', '마사지', '수분'],
      '구토': ['구토', '토', '분수토', '역류', '원인'],
      '아토피': ['아토피', '피부', '습진', '보습', '가려움'],
      '기저귀발진': ['기저귀발진', '발진', '엉덩이', '연고'],
      
      // ========== 수면 ==========
      '수면': ['수면', '잠', '낮잠', '밤잠', '통잠', '교육'],
      '통잠': ['통잠', '밤잠', '수면교육', '자기', '시기'],
      '수면교육': ['수면교육', '자기수면', '퍼버법', '안아재우기'],
      '낮잠': ['낮잠', '수면', '낮잠시간', '거부', '횟수'],
      '잠투정': ['잠투정', '울음', '수면', '재우기', '달래기'],
      
      // ========== 이유식 ==========
      '이유식': ['이유식', '이유', '고형식', '시작', '초기'],
      '초기이유식': ['초기이유식', '쌀미음', '시작', '4개월', '6개월'],
      '중기이유식': ['중기이유식', '입자', '7개월', '8개월'],
      '후기이유식': ['후기이유식', '무른밥', '9개월', '10개월'],
      '완료기': ['완료기', '유아식', '진밥', '12개월'],
      '알레르기': ['알레르기', '식품알레르기', '반응', '테스트'],
      '철분': ['철분', '빈혈', '고기', '이유식', '영양'],
      
      // ========== 예방접종 ==========
      '예방접종': ['예방접종', '백신', '접종', '스케줄', '시기'],
      '백신': ['백신', '예방접종', '부작용', '열'],
      'BCG': ['BCG', '결핵', '예방접종', '신생아', '흉터'],
      '독감': ['독감', '인플루엔자', '백신', '접종'],
      
      // ========== 정서/애착 ==========
      '애착': ['애착', '유대감', '정서', '안정', '형성'],
      '분리불안': ['분리불안', '낯가림', '엄마찾기', '울음'],
      '낯가림': ['낯가림', '분리불안', '발달', '6개월', '8개월'],
      '울음': ['울음', '달래기', '이유', '영아산통', '해석'],
      '놀이': ['놀이', '발달놀이', '장난감', '상호작용']
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

    // Supabase REST API로 검색
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

    // 검색어 기반 점수 계산
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

        // 긴급도 보너스
        if (item.urgency === '즉시대응필요') score += 5;
        else if (item.urgency === '24시간내확인') score += 3;

        return { ...item, score };
      });

      results = results.filter(item => item.score > 0);
      results.sort((a, b) => b.score - a.score);
    }

    results = results.slice(0, limit);

    return res.status(200).json({
      success: true,
      results: results,
      count: results.length,
      query: searchTerm,
      expandedKeywords: expandedKeywords.slice(0, 10)
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: 'Search failed', 
      message: error.message 
    });
  }
}
