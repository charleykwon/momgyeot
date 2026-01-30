// 맘곁 RAG 검색 API
// POST /api/search

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// 맘곁용 키워드 매핑 (임신/육아 전반 + 모유수유)
const keywordMap = {
  // === 모유수유 관련 ===
  // 젖 거부/물림 문제
  '안물': ['젖거부', '거부', '물림거부', '유두혼동', '피부접촉'],
  '거부': ['젖거부', '거부', '물림거부', '유두혼동', '피부접촉'],
  '안먹': ['젖거부', '거부', '수유거부', '먹지않음'],
  '유두혼동': ['유두혼동', '젖병거부', '젖거부', '혼동'],
  
  // 유두 관련 - 상처/통증
  '유두상처': ['유두상처', '균열', '갈라짐', '출혈', '통증', '원인', '치료', '대처'],
  '유두': ['유두', '균열', '상처', '갈라짐', '통증', '원인'],
  '균열': ['균열', '갈라짐', '유두상처', '출혈', '치료'],
  '갈라': ['갈라짐', '균열', '유두상처', '통증'],
  '젖꼭지': ['유두', '젖꼭지', '상처', '균열', '통증'],
  
  // 함몰/편평 유두
  '함몰': ['함몰유두', '편평유두', '유두보호기', '교정'],
  '편평': ['편평유두', '함몰유두', '유두보호기'],
  '보호기': ['유두보호기', '실리콘캡', '함몰', '편평'],
  
  // 긴급 상황
  '열': ['유선염', '열', '감염', '병원', '응급', '고열'],
  '아파': ['통증', '아픔', '유선염', '울혈', '열'],
  '가슴': ['유방', '가슴', '울혈', '유선염', '통증'],
  '유선염': ['유선염', '열', '감염', '항생제', '병원'],
  '응급': ['응급', '병원', '즉시', '위험'],
  
  // 모유량
  '모유량': ['젖양', '모유량', '부족', '늘리기', '분비', '증가'],
  '젖양': ['젖양', '모유량', '부족', '늘리기'],
  '늘리': ['늘리기', '증가', '촉진', '분비', '젖양'],
  '부족': ['부족', '젖양', '모유량', '늘리기'],
  
  // 자세/래치
  '자세': ['자세', '래치', '물림', '안기', '포지션'],
  '물림': ['래치', '물림', '자세', '깊은물림', '딥래치'],
  '래치': ['래치', '딥래치', '깊은물림', '자세'],
  
  // 야간/수면
  '밤': ['야간', '밤', '수면', '밤중수유', '야간수유'],
  '야간': ['야간수유', '밤중수유', '수면', '밤'],
  '수면': ['수면', '야간', '밤', '잠'],
  '밤중': ['밤중수유', '야간수유', '수면'],
  
  // 직장/복직
  '직장': ['복직', '직장', '유축', '회사', '워킹맘'],
  '복직': ['복직', '직장', '유축', '펌프', '냉동'],
  '회사': ['회사', '직장', '복직', '유축'],
  
  // 유축/보관
  '유축': ['유축', '펌프', '저장', '보관', '냉동'],
  '펌프': ['펌프', '유축기', '유축'],
  '냉동': ['냉동', '보관', '저장', '해동'],
  '보관': ['보관', '저장', '냉동', '냉장'],
  
  // 이유식/젖떼기
  '이유식': ['이유식', '이유', '고형식', '시작', '먹거리'],
  '젖떼기': ['젖떼기', '단유', '이유', '졸업'],
  '단유': ['단유', '젖떼기', '이유'],
  
  // === 임신 관련 (맘곁 확장) ===
  '입덧': ['입덧', '구토', '메스꺼움', '오심', '구역질'],
  '태동': ['태동', '태아움직임', '배뭉침', '아기움직임'],
  '임신초기': ['임신초기', '1분기', '초기증상', '착상'],
  '임신중기': ['임신중기', '2분기', '안정기'],
  '임신후기': ['임신후기', '3분기', '막달', '만삭'],
  
  // 임신 증상
  '배뭉침': ['배뭉침', '가진통', '브렉스톤힉스', '자궁수축'],
  '태교': ['태교', '음악태교', '책읽기', '명상'],
  '산전검사': ['산전검사', '기형아검사', '초음파', '검진'],
  
  // === 출산 관련 ===
  '진통': ['진통', '분만', '출산', '이슬', '양수'],
  '출산준비': ['출산준비', '분만가방', '준비물', '병원'],
  '무통': ['무통분만', '경막외마취', '분만'],
  '제왕절개': ['제왕절개', '시저리안', '수술분만'],
  '자연분만': ['자연분만', '질식분만', '정상분만'],
  
  // === 산후조리 관련 ===
  '산후조리': ['산후조리', '조리원', '산후', '회복'],
  '산후우울': ['산후우울', '우울증', '베이비블루', '정서'],
  '오로': ['오로', '산후출혈', '자궁수축'],
  '회음부': ['회음부', '회음절개', '봉합', '통증'],
  
  // === 신생아 육아 ===
  '신생아': ['신생아', '생후', '출생', '갓난아기'],
  '황달': ['황달', '빌리루빈', '광선치료'],
  '배꼽': ['배꼽', '탯줄', '소독', '관리'],
  '목욕': ['목욕', '통목욕', '부분목욕', '목욕시키기'],
  '기저귀': ['기저귀', '발진', '갈기', '천기저귀'],
  
  // === 발달 관련 ===
  '발달': ['발달', '성장', '이정표', '발달단계'],
  '대근육': ['대근육', '운동발달', '뒤집기', '앉기'],
  '소근육': ['소근육', '손놀림', '잡기'],
  '언어발달': ['언어발달', '옹알이', '말하기', '첫말'],
  
  // === 건강/질병 ===
  '예방접종': ['예방접종', '백신', '접종일정'],
  '감기': ['감기', '콧물', '기침', '열'],
  '설사': ['설사', '장염', '탈수'],
  '변비': ['변비', '배변', '대변'],
  '아토피': ['아토피', '피부', '가려움', '습진'],
  
  // 특수상황
  '쌍둥이': ['쌍둥이', '다태아', '특수', '동시수유'],
  '미숙아': ['미숙아', '조산', 'NICU', '특수'],
  '조산': ['조산', '미숙아', 'NICU']
};

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

    // 검색어 처리
    const searchTerm = query ? query.trim().toLowerCase() : '';
    
    // 키워드 확장
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

    // Supabase에서 검색
    let queryBuilder = supabase
      .from('knowledge_units')
      .select('*');
    
    if (categoryId) {
      queryBuilder = queryBuilder.eq('category', categoryId);
    }

    const { data: results, error } = await queryBuilder;

    if (error) {
      throw new Error('Supabase search failed: ' + error.message);
    }

    let scoredResults = results || [];

    // 검색어가 있으면 점수 계산
    if (searchTerm) {
      scoredResults = scoredResults.map(item => {
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
        if (item.urgency === '즉시대응필요') score += 3;
        else if (item.urgency === '24시간내확인') score += 2;

        return { ...item, score };
      });

      // 점수가 있고 내용이 충분한 것만 필터링
      scoredResults = scoredResults.filter(item => item.score > 0 && item.content && item.content.length >= 50);
      scoredResults.sort((a, b) => b.score - a.score);
    }

    // 상위 N개 반환
    scoredResults = scoredResults.slice(0, limit);

    return res.status(200).json({
      success: true,
      results: scoredResults,
      count: scoredResults.length,
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
