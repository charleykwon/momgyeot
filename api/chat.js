// 맘곁 Chat API (안정화 버전)
// POST /api/chat

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Supabase 클라이언트 (환경변수 없으면 null)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

// 맘곁 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 "맘곁"이라는 이름의 따뜻하고 공감적인 육아 AI 컴패니언입니다.

## 핵심 역할
- 임신 준비부터 육아까지 엄마들의 여정을 함께하는 친근한 동반자
- 모유수유, 수면교육, 이유식, 정서 케어 등 전문 정보 제공
- 공감과 위로를 통한 정서적 지지

## 대화 스타일
- 따뜻하고 친근한 말투 사용
- 공감 먼저, 정보는 그 다음
- 짧고 명확한 문장
- 필요시 이모지 적절히 사용
- 200-400자 내외로 간결하게

## 위기 감지
다음 키워드 감지 시 즉시 전문 상담 연결 안내:
- 자해/자살 관련 표현
- 극심한 우울감 표현
→ 자살예방상담전화 1393 (24시간) 안내

## 주의사항
- 의료적 진단이나 처방은 하지 않음
- 심각한 증상은 반드시 전문의 상담 권유`;

// 대화 저장 함수 (Supabase 있을 때만)
async function saveMessage(user_id, role, content) {
  if (!supabase || !user_id) return;
  
  try {
    await supabase
      .from('conversations')
      .insert([{ user_id, role, content }]);
  } catch (error) {
    console.error('메시지 저장 실패:', error.message);
  }
}

// 이전 대화 불러오기
async function getRecentMessages(user_id, limit = 6) {
  if (!supabase || !user_id) return [];
  
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('role, content')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('대화 불러오기 오류:', error.message);
      return [];
    }
    
    return (data || []).reverse();
  } catch (error) {
    console.error('대화 불러오기 실패:', error.message);
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
    const { message, user_id } = req.body;

    if (!message) {
      return res.status(400).json({ error: '메시지가 필요합니다' });
    }

    // 1. 사용자 메시지 저장
    await saveMessage(user_id, 'user', message);

    // 2. 메시지 히스토리 구성
    let messages = [];
    
    if (user_id) {
      const history = await getRecentMessages(user_id, 6);
      messages = history.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }
    
    // 현재 메시지가 히스토리에 없으면 추가
    const hasCurrentMessage = messages.some(m => 
      m.role === 'user' && m.content === message
    );
    
    if (!hasCurrentMessage) {
      messages.push({ role: 'user', content: message });
    }

    // 메시지가 비어있으면 현재 메시지만
    if (messages.length === 0) {
      messages = [{ role: 'user', content: message }];
    }

    // 3. Claude API 호출
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages
    });

    const assistantMessage = response.content[0].text;

    // 4. AI 응답 저장
    await saveMessage(user_id, 'assistant', assistantMessage);

    return res.status(200).json({
      success: true,
      response: assistantMessage
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({
      error: '응답 생성에 실패했습니다',
      details: error.message
    });
  }
}
