1. 프로젝트명(팀명:고민중독)
  MediaPipe 기반 실시간 
  소음·자세 분석 집중 환경 케어 플랫폼


2. 서비스소개
  헬스케어 / 집중력 및 생산성 관리 서비스


3. 프로젝트기간
  2026-02-28 ~ 2026-04-08


4. 주요기능
✅ 실시간 자세 분석
  - MediaPipe Pose를 활용해 웹캠으로 사용자의 자세를 실시간 감지
  - 잘못된 자세 감지 시 즉각적인 피드백 메시지 제공 (Socket.IO)

✅ 실시간 소음 분석
  - 마이크를 통해 주변 소음(데시벨) 및 소음 유형 실시간 감지
  - 집중을 방해하는 소음 발생 시 알림 제공

✅ 집중 세션 관리
  - 집중 모드 시작/종료 기능 (세션 기록 저장)
  - 세션 중 자세·소음 데이터를 실시간으로 서버에 전송

✅ 리포트 조회
  - 집중 세션이 끝난 후 자세·소음 분석 결과 리포트 제공
  - Chart.js를 활용한 시각화 데이터 제공

✅ 회원 관리
  - JWT 기반 회원가입 / 로그인 / 내 정보 조회

✅ AI 코칭 (Gemini AI 연동)
  - Google Generative AI(Gemini)를 통한 집중 환경 개선 코칭 메시지 제공

✅ 타임랩스 기록
  - FFmpeg를 활용한 집중 세션 타임랩스 영상 생성

✅ 테마(스킨) 선택
  - 기본(인디고), 오션(청록), 다크 모드 3가지 UI 테마 제공


5. 기술스택

✅ Frontend : React 18, React Router v6, Axios, Socket.IO Client, Chart.js 

✅ Backend : Node.js, Express.js, Socket.IO, JWT, bcryptjs, Winston, Morgan 

✅ AI / 분석 : MediaPipe Pose, MediaPipe Holistic, Google Gemini AI 

✅ Database : MySQL 

✅ 미디어 처리 : FFmpeg (fluent-ffmpeg) 

✅ 보안 : Helmet, CORS 화이트리스트, JWT, bcrypt 

✅ 개발 도구 : Nodemon, ESLint, dotenv 


6. 시스템 아키텍처
  - 프론트엔드
React 18
├── React Router v6       → 페이지 라우팅 (Auth / Home / Camera / Report / MyPage)
├── Axios                 → REST API 통신
├── Socket.IO Client      → 실시간 자세·소음 데이터 전송
├── MediaPipe Pose        → 웹캠 기반 실시간 자세 분석 (브라우저)
├── Chart.js              → 리포트 데이터 시각화
└── Context API           → JWT 인증 전역 상태 관리 (AuthContext)

  - 백엔드 
Node.js + Express.js
├── REST API              → 회원·세션·리포트 CRUD
├── Socket.IO Server      → 실시간 자세(pose:data) / 소음(noise:data) 이벤트 처리
├── JWT Middleware        → 인증/인가 처리
├── express-validator     → 요청 데이터 유효성 검사
├── Winston / Morgan      → 서버 로그 관리
├── Multer               → 타임랩스 파일 업로드
├── FFmpeg (fluent)       → 타임랩스 영상 생성
├── node-cron            → 주기적 작업 스케줄링
└── Google Gemini AI      → AI 코칭 메시지 생성

  - 데이터베이스
MySQL
├── users 테이블          → 회원 정보 (이메일, 비밀번호 해시 등)
├── immersions 테이블     → 집중 세션 기록 (시작시간, 종료시간)
├── pose_logs 테이블      → 자세 분석 로그 (pose_status, pose_type, detected_at)
└── noise_logs 테이블     → 소음 분석 로그 (decibel, obj_name, reliability)

  - 주요 기술 스택
[사용자 브라우저]
     ↓ HTTP REST (Axios)    ↕ WebSocket (Socket.IO)
[Express API 서버 :5000]
     ↓ SQL 쿼리
[MySQL DB]
     ↓ AI 코칭 요청
[Google Gemini API]

 
7. 유스케이스
✅ 회원 관리
  - 사용자는 이메일과 비밀번호로 회원가입할 수 있다
  - 사용자는 로그인 후 JWT 토큰을 발급받는다
  - 사용자는 내 정보(마이페이지)를 조회할 수 있다
  - 로그아웃 시 클라이언트 측 토큰이 삭제된다

✅ 집중 모드
  - 사용자는 집중 모드 시작 버튼을 눌러 세션을 생성한다 (POST /api/immersions)
  - 웹캠과 마이크가 활성화되어 실시간 자세·소음 분석이 시작된다
  - 자세 데이터는 Socket.IO를 통해 서버로 실시간 전송된다 (pose:data)
  - 소음 데이터도 Socket.IO를 통해 서버로 전송된다 (noise:data)
  - 집중 모드 종료 시 세션이 마감된다 (PATCH /api/immersions/:id/end)

✅ AI 코칭
  - 집중 세션 중 또는 종료 후 Google Gemini AI가 분석 결과를 기반으로 코칭 메시지를 생성한다
  - 잘못된 자세가 감지되면 서버가 pose:feedback 이벤트로 즉각 피드백을 전송한다
  - 사용자는 자세 교정 방법 및 집중 환경 개선 팁을 받을 수 있다

✅ 게임화 요소
  - 집중 세션을 완료하면 기록이 누적된다
  - 연속 집중 달성, 자세 유지 시간 등의 통계가 기록된다
  - (확장 가능) 뱃지·레벨 시스템 연동 가능 구조로 설계됨

✅ 리포트 조회
  - 사용자는 집중 세션 종료 후 해당 세션의 리포트를 조회한다 (GET /api/reports/:imm_idx)
  - 자세 분석 결과(정상/불량 비율, 유형별 분포)가 차트로 시각화된다
  - 소음 분석 결과(평균 데시벨, 소음 유형)가 함께 제공된다
  - 타임랩스 영상으로 세션을 되돌아볼 수 있다


8. 서비스 흐름도
[시작]
  │
  ▼
회원가입 / 로그인 (JWT 발급)
  │
  ▼
홈 화면 (대시보드)
  │
  ▼
집중 모드 시작 버튼 클릭
  │
  ├──→ 서버에 세션 생성 요청 (POST /api/immersions)
  │
  ▼
카메라 페이지 진입
  ├──→ 웹캠 활성화 → MediaPipe Pose 자세 분석 시작
  ├──→ 마이크 활성화 → 소음(데시벨) 실시간 감지
  │
  ▼ (Socket.IO 실시간 전송)
  ├──→ pose:data 전송 → 서버 저장 → pose:feedback 수신
  ├──→ noise:data 전송 → 서버 저장
  │
  ▼
집중 모드 종료 버튼 클릭
  ├──→ 세션 마감 (PATCH /api/immersions/:id/end)
  ├──→ FFmpeg 타임랩스 생성
  ├──→ Gemini AI 코칭 메시지 생성
  │
  ▼
리포트 페이지
  ├──→ 자세·소음 분석 차트 시각화
  ├──→ AI 코칭 메시지 출력
  └──→ 타임랩스 영상 재생
  │
  ▼
[종료 또는 재시작]


9. ER 다이어그램
[users]
  ├── usr_idx        INT, PK, AUTO_INCREMENT
  ├── email          VARCHAR, UNIQUE
  ├── password       VARCHAR (bcrypt 해시)
  ├── nickname       VARCHAR
  └── created_at     DATETIME

[immersions] (집중 세션)
  ├── imm_idx        INT, PK, AUTO_INCREMENT
  ├── usr_idx        INT, FK → users.usr_idx
  ├── start_time     DATETIME
  ├── end_time       DATETIME
  └── timelapse_path VARCHAR (타임랩스 파일 경로)

[pose_logs] (자세 로그)
  ├── pose_idx       INT, PK, AUTO_INCREMENT
  ├── imm_idx        INT, FK → immersions.imm_idx
  ├── pose_status    VARCHAR (정상/불량)
  ├── pose_type      VARCHAR (구체적 자세 유형)
  └── detected_at    DATETIME

[noise_logs] (소음 로그)
  ├── noise_idx      INT, PK, AUTO_INCREMENT
  ├── imm_idx        INT, FK → immersions.imm_idx
  ├── decibel        FLOAT
  ├── obj_name       VARCHAR (소음 유형)
  ├── reliability    FLOAT (신뢰도)
  └── detected_at    DATETIME


10. 화면구성
📱 페이지 목록
├── 🔐 Auth 페이지
│     ├── 로그인 화면
│     └── 회원가입 화면
│
├── 🏠 Home 페이지 (대시보드)
│     ├── 집중 모드 시작 버튼
│     └── 최근 집중 세션 요약
│
├── 📷 Camera 페이지 (집중 모드)
│     ├── 실시간 웹캠 피드
│     ├── MediaPipe 자세 분석 오버레이
│     ├── 소음 레벨 표시 (데시벨 미터)
│     └── 자세 피드백 메시지 표시
│
├── 📊 Report 페이지
│     ├── 자세 분석 결과 차트 (Chart.js)
│     ├── 소음 분석 결과 차트 (Chart.js)
│     ├── AI 코칭 메시지 (Gemini)
│     └── 타임랩스 영상 플레이어
│
└── 👤 MyPage 페이지
      ├── 회원 정보 조회
      ├── 집중 세션 히스토리
      └── 테마(스킨) 변경 (기본/오션/다크)

 
11. 팀원역할
  - 주양덕(PM, server, client, DataBase)

12. 트러블슈팅
### 🔧 트러블슈팅

#### 1. CORS 오류 (프론트-백엔드 통신 불가)
- **문제**: React(3000포트) → Express(5000포트) 요청 시 CORS 에러 발생
- **원인**: cors.config.js의 origin 화이트리스트 미설정
- **해결**: .env의 ALLOWED_ORIGINS에 http://localhost:3000 추가

#### 2. Socket.IO 연결 끊김 문제
- **문제**: 집중 모드 중 소켓 연결이 간헐적으로 끊어짐
- **원인**: JWT 토큰 만료 시 소켓 재연결 로직 미처리
- **해결**: 소켓 연결 시 JWT 검증 미들웨어 추가 및 재연결 이벤트 처리

#### 3. MediaPipe 자세 감지 성능 저하
- **문제**: 저사양 환경에서 MediaPipe 프레임 드랍 발생
- **원인**: 매 프레임마다 무거운 holistic 모델 사용
- **해결**: MediaPipe Pose 모델(경량)로 교체하여 성능 개선

#### 4. FFmpeg 타임랩스 생성 오류
- **문제**: 서버 환경에 FFmpeg 미설치로 타임랩스 생성 실패
- **원인**: @ffmpeg-installer/ffmpeg 패키지 경로 인식 실패
- **해결**: fluent-ffmpeg에 installer 경로를 명시적으로 지정


---

## 📁 프로젝트 구조


SMARTFORCUS/
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

---

## ⚠️ 보안 주의사항

- `.env` 파일은 절대 Git에 커밋하지 마세요.
- `.env.example` 파일만 커밋하여 팀원이 템플릿을 참고하게 합니다.
- `JWT_SECRET` 은 `openssl rand -hex 64` 로 생성하세요.
- 운영 환경에서는 `ALLOWED_ORIGINS` 를 실제 도메인으로 제한하세요.
