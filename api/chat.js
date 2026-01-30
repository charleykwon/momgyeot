// 맘곁 RAG 통합 Chat API
// POST /api/chat
// 기능: RAG 검색 + Claude 응답 + 대화 히스토리 저장

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// 맘곁 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 "맘곁"이라는 이름의 따뜻하고 공감적인 육아 AI 컴패니언입니다.

## 핵심 역할
- 임신 준비부터 육아까지 엄마들의 여정을 함께하는 친근한 동반자
- 모유수유, 수면교육, 이유식, 정서 케어 등 전문 정보 제공
- 공감과 위로를 통한 정서적 지지
- 참고 정보가 제공되면 이를 바탕으로 정확한 답변 제공

## 대화 스타일
- 따뜻하고 친근한 말투 사용 (반말과 존댓말 혼용 가능)
- 공감 먼저, 정보는 그 다음
- 짧고 명확한 문장
- 필요시 이모지 적절히 사용
- 200-400자 내외로 간결하게 (너무 길지 않게)

## 위기 감지
다음 키워드 감지 시 즉시 전문 상담 연결 안내:
- 자해/자살 관련 표현
- 극심한 우울감 표현
- 아이에 대한 해로운 생각
→ 자살예방상담전화 1393 (24시간) 안내

## 주의사항
- 의료적 진단이나 처방은 하지 않음
- 심각한 증상은 반드시 전문의 상담 권유
- 참고 정보가 있으면 활용하되, 없으면 일반 지식으로 답변
- 확실하지 않은 정보는 제공하지 않음`;

// 키워드 매핑 (검색용)
const keywordMap = {
  '안물': ['젖거부', '거부', '유두혼동'],
  '거부': ['젖거부', '거부', '유두혼동'],
  '유두': ['유두', '균열', '상처', '통증'],
  '열': ['유선염', '열', '감염', '병원'],
  '아파': ['통증', '유선염', '울혈'],
  '젖양': ['젖양', '모유량', '부족', '늘리기'],
  '자세': ['자세', '래치', '물림', '포지션'],
  '밤': ['야간수유', '수면', '밤중수유'],
  '복직': ['복직', '직장', '유축', '회사'],
  '유축': ['유축', '펌프', '보관'],
  '이유식': ['이유식', '고형식', '시작'],
  '입덧': ['입덧', '구토', '메스꺼움'],
  '태동': ['태동', '태아움직임'],
  '진통': ['진통', '분만', '출산'],
  '산후우울': ['산후우울', '우울증', '정서'],
  '황달': ['황달', '빌리루빈'],
  '예방접종': ['예방접종', '백신'],
};

// 키워드 확장 함수
function expandKeywords(query) {
  const searchTerm = query.toLowerCase();
  let expanded = [searchTerm];
  
  for (const [key, values] of Object.entries(keywordMap)) {
    if (searchTerm.includes(key)) {
      expanded = [...expanded, ...values];
    }
  }
  
  return [...new Set(expanded)];
}

// RAG 검색 함수
async function searchRAG(query, limit = 3) {
  try {
    const keywords = expandKeywords(query);
    
    // knowledge_units 테이블에서 검색
    const { data: results, error } = await supabase
      .from('knowledge_units')
      .select('id, title, content, keywords, urgency');

    if (error || !results) {
      console.error('RAG search error:', error);
      return [];
    }

    // 점수 계산
    const scored = results.map(item => {
      let score = 0;
      const title = (item.title || '').toLowerCase();
      const content = (item.content || '').toLowerCase();
      const itemKeywords = Array.isArray(item.keywords) ? item.keywords.join(' ').toLowerCase() : '';

      for (const kw of keywords) {
        if (title.includes(kw)) score += 10;
        if (content.includes(kw)) score += 5;
        if (itemKeywords.includes(kw)) score += 8;
      }

      if (item.urgency === '즉시대응필요') score += 3;

      return { ...item, score };
    });

    // 점수순 정렬 후 상위 N개 반환
    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

  } catch (error) {
    console.error('RAG search failed:', error);
    return [];
  }
}

// 컨텍스트 포맷팅
function formatContext(ragResults) {
  if (!ragResults || ragResults.length === 0) {
    return '';
  }
  
  return ragResults.map((item, i) => 
    `[참고${i + 1}] ${item.title}\n${item.content}`
  ).join('\n\n');
}

// 대화 저장 함수
async function saveMessage(user_id, role, content) {
  try {
    await supabase
      .from('conversations')
      .insert([{ user_id, role, content }]);
  } catch (error) {
    console.error('메시지 저장 실패:', error);
  }
}

// 이전 대화 불러오기
async function getRecentMessages(user_id, limit = 6) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('role, content')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).reverse();
  } catch (error) {
    console.error('대화 불러오기 실패:', error);
    return [];
  }
}

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 메서드만 허용됩니다' });
  }

  try {
    const { message, user_id, useRAG = true } = req.body;

    if (!message) {
      return res.status(400).json({ error: '메시지가 필요합니다' });
    }

    // 1. RAG 검색 (useRAG가 true일 때)
    let ragContext = '';
    let ragResults = [];
    
    if (useRAG) {
      ragResults = await searchRAG(message, 3);
      ragContext = formatContext(ragResults);
    }

    // 2. 메시지 구성
    let messages = [];
    
    if (user_id) {
      // 사용자 메시지 저장
      await saveMessage(user_id, 'user', message);
      
      // 이전 대화 불러오기 (컨텍스트용)
      const history = await getRecentMessages(user_id, 6);
      messages = history.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }
    
    // 현재 메시지 추가 (RAG 컨텍스트 포함)
    const userMessage = ragContext 
      ? `참고 정보:\n${ragContext}\n\n질문: ${message}`
      : message;
    
    // 히스토리에 현재 메시지가 없으면 추가
    if (!messages.some(m => m.content === message)) {
      messages.push({ role: 'user', content: userMessage });
    } else {
      // 히스토리의 마지막 user 메시지를 RAG 컨텍스트 포함 버전으로 교체
      const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
      if (lastUserIdx >= 0) {
        messages[lastUserIdx].content = userMessage;
      }
    }

    // 3. Claude API 호출
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages
    });

    const assistantMessage = response.content[0].text;

    // 4. AI 응답도 저장
    if (user_id) {
      await saveMessage(user_id, 'assistant', assistantMessage);
    }

    return res.status(200).json({
      success: true,
      response: assistantMessage,
      ragUsed: ragResults.length > 0,
      ragCount: ragResults.length
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({
      error: '응답 생성에 실패했습니다',
      details: error.message
    });
  }
}
