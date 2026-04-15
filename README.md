# Smart Forcus

---

> 사용법 
> server> nodemon app.js
> client> npm start



> **MediaPipe 기반 실시간 자세 분석 & 집중 케어 플랫폼**

---

## 📁 프로젝트 구조

```
gomindokki/
├── server/                       # Express API 서버
│   ├── src/
│   │   ├── app.js                # 앱 진입점 (미들웨어, 라우터 등록)
│   │   ├── config/
│   │   │   ├── cors.config.js    # CORS 정책 (origin 화이트리스트)
│   │   │   ├── db.config.js      # MySQL 연결 풀
│   │   │   └── jwt.config.js     # JWT 서명 키/만료 설정
│   │   ├── controllers/          # 비즈니스 로직
│   │   ├── middlewares/          # JWT 인증, 유효성 검사
│   │   ├── models/               # (확장용) DB 모델 헬퍼
│   │   ├── routes/               # auth / user / immersion / report
│   │   ├── services/             # (확장용) 외부 서비스 연동
│   │   ├── sockets/              # Socket.IO 자세·소음 이벤트 핸들러
│   │   └── utils/logger.js       # Winston 로거
│   ├── uploads/                  # 타임랩스 파일 저장 (Git 제외)
│   ├── logs/                     # 런타임 로그 (Git 제외)
│   ├── .env.example              # ✅ 환경 변수 템플릿 (커밋 O)
│   └── package.json
│
└── client/                       # React 프론트엔드
    ├── src/
    │   ├── index.js              # ← 스킨 import 교체 지점
    │   ├── App.jsx               # 라우터 설정
    │   ├── api/                  # axios 인스턴스, socket.io 클라이언트
    │   ├── context/              # AuthContext (JWT 전역 관리)
    │   ├── pages/                # Auth / Home / Camera / Report / MyPage
    │   ├── components/           # layout (MainLayout), common
    │   └── styles/
    │       ├── base/             # reset / variables / typography / global
    │       └── skins/            # ← 디자인 스킨 파일 모음
    │           ├── skin-default.css  (인디고 + 다크 사이드바)
    │           ├── skin-ocean.css    (청록 + 네이비 사이드바)
    │           └── skin-dark.css     (전체 다크 모드)
    ├── .env.example              # ✅ 환경 변수 템플릿 (커밋 O)
    └── package.json
```

---

## 🎨 CSS 스킨 교체 방법

`client/src/index.js` 파일에서 **한 줄**만 바꾸면 전체 디자인 스킨이 변경됩니다.

```js
// 기본 스킨 (인디고)
import './styles/skins/skin-default.css';

// 오션 스킨 (청록)
// import './styles/skins/skin-ocean.css';

// 다크 스킨 (전체 다크)
// import './styles/skins/skin-dark.css';
```

새 스킨 추가 시 `client/src/styles/skins/skin-NEW.css` 파일을 만들어
`:root { --color-primary: ...; }` CSS 변수만 재정의하면 됩니다.

---

## 🚀 시작 가이드

### 1. 환경 변수 설정

```bash
# 서버
cp server/.env.example server/.env
# server/.env 를 열어 실제 DB/JWT 값 입력

# 클라이언트
cp client/.env.example client/.env
```

### 2. 의존성 설치 및 실행

```bash
# 서버
cd server && npm install && npm run dev

# 클라이언트 (별도 터미널)
cd client && npm install && npm start
```

---

## 🔌 주요 API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/auth/register` | 회원가입 | ✗ |
| POST | `/api/auth/login` | 로그인 (JWT 발급) | ✗ |
| GET  | `/api/users/me` | 내 정보 조회 | ✅ |
| POST | `/api/immersions` | 집중 세션 시작 | ✅ |
| PATCH | `/api/immersions/:id/end` | 집중 세션 종료 | ✅ |
| GET  | `/api/reports/:imm_idx` | 세션 리포트 조회 | ✅ |
| GET  | `/health` | 서버 상태 확인 | ✗ |

## 📡 Socket.IO 이벤트

| 방향 | 이벤트명 | 페이로드 |
|------|----------|----------|
| Client → Server | `pose:data` | `{ imm_idx, pose_status, pose_type, detected_at }` |
| Server → Client | `pose:feedback` | `{ message, pose_type }` |
| Client → Server | `noise:data` | `{ imm_idx, decibel, obj_name, reliability }` |

---

## 🛠 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Node.js, Express, Socket.IO, MySQL2, JWT, bcryptjs, Winston |
| 프론트 | React 18, React Router v6, Axios, Socket.IO Client |
| 자세 분석 | MediaPipe Pose (예정) |
| 보안 | Helmet, CORS 화이트리스트, JWT, bcrypt |

---

## ⚠️ 보안 주의사항

- `.env` 파일은 절대 Git에 커밋하지 마세요.
- `.env.example` 파일만 커밋하여 팀원이 템플릿을 참고하게 합니다.
- `JWT_SECRET` 은 `openssl rand -hex 64` 로 생성하세요.
- 운영 환경에서는 `ALLOWED_ORIGINS` 를 실제 도메인으로 제한하세요.
