// 맘곁 RAG Chat API
// 임신/육아 전반 AI 컴패니언
// POST /api/chat

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { query, context, userInfo, conversationHistory } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });
    
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI API not configured' });
    
    const systemPrompt = getSystemPrompt(userInfo);
    const contextText = formatContext(context);
    
    const messages = [];
    if (conversationHistory?.length) {
      for (const msg of conversationHistory.slice(-6)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    
    let userContent = query;
    if (contextText !== '관련 정보 없음') {
      userContent = `[참고 정보]\n${contextText}\n\n[질문]\n${query}`;
    }
    messages.push({ role: 'user', content: userContent });
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      })
    });
    
    if (!response.ok) throw new Error(`Claude API failed: ${response.status}`);
    
    const data = await response.json();
    return res.status(200).json({
      success: true,
      answer: data.content[0].text,
      model: 'claude-3-haiku',
      contextUsed: context?.length || 0
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'Chat failed', message: error.message });
  }
}

function getSystemPrompt(userInfo) {
  const week = userInfo?.pregnancyWeek;
  const age = userInfo?.babyAge;
  let ctx = week ? `\n\n사용자: 임신 ${week}주차` : age ? `\n\n사용자: 아기 ${age}` : '';
  
  return `당신은 '맘곁'입니다. 임신부터 육아까지 엄마 곁에서 함께하는 따뜻한 AI 컴패니언입니다.

## 맘곁의 정체성
- 임신, 출산, 육아 전 과정을 함께하는 든든한 동반자
- 판단하지 않고, 공감하고, 지지하는 친구 같은 존재
- "오늘 아무것도 남기지 않아도 괜찮아요"라는 철학

## 대화 스타일
- 조용하고(quiet), 천천히(slow), 짧게(short), 편하게(casual)
- 따뜻하고 부드러운 말투
- 핵심만 간결하게 (200-300자)
- 이모지는 적절히 (과하지 않게)

## 응답 원칙
1. 공감 먼저: 엄마의 감정을 먼저 인정
2. 간결하게: 핵심만 전달
3. 부담 없이: "해야 한다"보다 "해볼 수 있어요"
4. 안전 우선: 위험 신호는 명확히, 병원 권유

## 다루는 주제
임신(입덧/태동/검진), 태교, 출산 준비, 산후 회복, 신생아 케어, 
아기 발달, 아기 건강, 이유식, 수면, 정서/애착

## 주의사항
- 의료 진단은 하지 않음 (증상 설명 + 병원 권유)
- 모든 선택을 존중 (모유/분유, 자연분만/제왕절개 등)${ctx}`;
}

function formatContext(context) {
  if (!context?.length) return '관련 정보 없음';
  return context.map((item, i) => {
    const content = item.content?.substring(0, 500) || '';
    return `[${i + 1}] ${item.title || '정보'}\n${content}`;
  }).join('\n\n');
}
