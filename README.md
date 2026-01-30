# 맘곁 (Momgyeot) - 육아 컴패니언 AI

> 아기를 품은 엄마, 그 곁을 지키는 아빠, 그 둘을 받쳐주는 맘곁 💕

## 📁 프로젝트 구조

```
momgyeot/
├── index.html          # 메인 앱 (인트로 + 채팅)
├── intro-bg.png        # 인트로 배경 이미지
├── package.json        # 의존성
├── vercel.json         # Vercel 설정
├── api/
│   ├── chat.js         # RAG + Claude API
│   ├── search.js       # RAG 검색 API
│   ├── history.js      # 대화 히스토리 API
│   └── admin.js        # 관리자 통계 API
└── admin/
    ├── login.html      # 관리자 로그인
    └── dashboard.html  # 행동분석 대시보드
```

## 🚀 배포 방법

### 1. GitHub에 Push

```bash
git add .
git commit -m "맘곁 RAG 통합"
git push origin main
```

### 2. Vercel 환경변수 설정

Vercel 대시보드 → Settings → Environment Variables:

| 변수명 | 값 | 설명 |
|--------|-----|------|
| `SUPABASE_URL` | `https://fzxwqfaddxnhfvnfvnph.supabase.co` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | Supabase 공개 키 |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` | Supabase 서비스 키 (관리자용) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Claude API 키 (선택) |

### 3. 재배포

환경변수 설정 후 Deployments → Redeploy

## 🔐 관리자 로그인

- **URL**: `/admin/login.html`
- **아이디**: `momgyeot_admin`
- **비밀번호**: `mothersbaby2025!`

## 📊 API 엔드포인트

### POST /api/chat
AI 채팅 응답 (RAG + Claude)

```json
{
  "query": "젖몸살이 심해요",
  "mateType": "agi",
  "userInfo": { "nickname": "콩이맘" }
}
```

### POST /api/search
RAG 검색 (키워드 확장 + 점수 계산)

```json
{
  "query": "밤수유",
  "limit": 5
}
```

### GET /api/history
대화 히스토리 조회

```
/api/history?userId=xxx&limit=20
```

### GET /api/admin
관리자 통계

```
/api/admin?action=overview|daily|topics|keywords|conversations
```

## 🗄️ Supabase 테이블

### knowledge_units (RAG 데이터)
- id, title, content, keywords[], chapter, urgency

### conversations (대화 기록)
- id, user_id, mate_type, question, answer, created_at

## 💡 기능

### 메인 앱
- ✅ 3가지 선택형 온보딩 (예비맘/임신맘/초보맘)
- ✅ RAG 기반 지식 검색
- ✅ Claude AI 응답 (옵션)
- ✅ 음성 인식 입력
- ✅ 대화 히스토리 저장

### 관리자
- ✅ 통계 대시보드
- ✅ 시간대별 이용 패턴
- ✅ 사용자 유형 분포
- ✅ 핫 키워드 분석

## 📞 문의

- 개발자: 의철 (Euicheol)
- 전문가 상담: 박보림 IBCLC
- 연락처: 010-7573-2475
