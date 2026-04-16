// ─────────────────────────────────────────────────────────
// server/src/app.js — Express 앱 진입점
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// ⚙️ 환경 변수 로드
// ────────────────────────────────────────────────

/*
  dotenv.config() :
    프로젝트 루트의 .env 파일을 읽어 process.env에 환경 변수를 주입합니다.
    DB 접속 정보, JWT 비밀 키, API 키 등 민감한 정보를 코드에 직접 작성하지 않고
    .env 파일로 분리하여 관리합니다.
    반드시 다른 모듈보다 먼저 호출해야 이후 require()에서 환경 변수를 정상적으로 사용할 수 있습니다.
*/
require('dotenv').config();


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  express  : Node.js 웹 프레임워크입니다. 라우터, 미들웨어, 요청·응답 처리를 담당합니다.
  http     : Node.js 내장 HTTP 서버 모듈입니다.
             Socket.IO는 express 앱이 아닌 HTTP 서버에 직접 연결해야 하므로
             http.createServer(app)으로 서버를 별도로 생성합니다.
  cors     : 다른 도메인(출처)에서 API를 호출할 수 있도록 CORS 헤더를 설정합니다.
  helmet   : HTTP 응답 헤더를 보안에 맞게 설정하는 미들웨어입니다.
             XSS, 클릭재킹 등 일반적인 웹 공격을 방어합니다.
  morgan   : HTTP 요청 로그를 자동으로 기록하는 미들웨어입니다.
  path     : 파일·디렉토리 경로를 OS에 맞게 안전하게 조합합니다.
*/
const express = require('express');
const http    = require('http');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');


// ────────────────────────────────────────────────
// 🔧 설정 및 유틸리티 모듈 불러오기
// ────────────────────────────────────────────────

// corsOptions : 허용할 출처, 메서드 등 CORS 세부 옵션이 정의된 설정 객체
const corsOptions       = require('./config/cors.config');

// connectDB : 서버 시작 시 MySQL 연결 풀을 초기화하는 함수
const { connectDB }     = require('./config/db.config');

// initSocket : HTTP 서버에 Socket.IO를 연결하고 초기화하는 함수
const { initSocket }    = require('./sockets');

// logger : Winston 기반 로거 (console.log 대신 사용)
const logger            = require('./utils/logger');

// seedBadges : 서버 최초 실행 시 기본 뱃지 데이터를 DB에 삽입하는 함수
const { seedBadges }    = require('./services/badge.seed');

// startRankingCron : 랭킹 캐시를 초기화하고 자동 갱신 스케줄러를 등록하는 함수
const { startRankingCron } = require('./cache/ranking.cache');


// ────────────────────────────────────────────────
// 🛣️ 라우터 모듈 불러오기
// ────────────────────────────────────────────────

/*
  각 도메인별로 분리된 라우터 모듈을 불러옵니다.
  라우터는 app.use()로 특정 경로에 마운트되어
  해당 경로의 모든 요청을 처리합니다.
*/
const authRouter      = require('./routes/auth.routes');       // 회원가입 · 로그인
const userRouter      = require('./routes/user.routes');       // 유저 정보 · 통계 · 랭킹
const immersionRouter = require('./routes/immersion.routes'); // 집중 세션 CRUD
const reportRouter    = require('./routes/report.routes');     // 세션 리포트 · AI 피드백
const badgeRouter     = require('./routes/badge.routes');      // 뱃지 목록 · 구매
const pointRouter     = require('./routes/point.routes');      // 포인트 내역
const timelapseRoute  = require('./routes/timelapse.route');   // 타임랩스 저장 · 조회
const skinRouter      = require('./routes/skin.routes');       // 스킨 목록 · 구매 · 적용


// ────────────────────────────────────────────────
// 🏗️ Express 앱 및 HTTP 서버 생성
// ────────────────────────────────────────────────

/*
  express() : Express 애플리케이션 인스턴스를 생성합니다.
  http.createServer(app) :
    Express 앱을 HTTP 서버로 감쌉니다.
    Socket.IO는 HTTP 서버 레벨에서 WebSocket 프로토콜을 처리하므로
    app 대신 httpServer를 Socket.IO에 연결해야 합니다.
*/
const app        = express();
const httpServer = http.createServer(app);

// HTTP 서버에 Socket.IO를 연결하고 이벤트 핸들러를 등록합니다
initSocket(httpServer);


// ────────────────────────────────────────────────
// 🛡️ 글로벌 미들웨어 등록
// ────────────────────────────────────────────────

/*
  helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }) :
    보안 관련 HTTP 헤더를 자동으로 설정합니다.
    crossOriginResourcePolicy를 'cross-origin'으로 설정하여
    /uploads 경로의 이미지 등 정적 파일이 다른 출처에서도 로드될 수 있게 합니다.
    기본값은 'same-origin'으로 다른 도메인에서 리소스 접근이 차단됩니다.
*/
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// corsOptions에 정의된 허용 출처·메서드·헤더 설정으로 CORS를 처리합니다
app.use(cors(corsOptions));

/*
  morgan('combined', { stream: ... }) :
    'combined' 포맷으로 HTTP 요청 로그를 기록합니다.
    stream 옵션으로 morgan의 출력을 winston 로거의 http 레벨로 연결합니다.
    m.trim() : morgan이 추가하는 개행 문자를 제거합니다.
*/
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));

/*
  express.json({ limit: '10mb' }) :
    요청 바디를 JSON으로 파싱합니다.
    limit: '10mb' : 타임랩스 파일명 등 대용량 JSON 전송을 허용합니다.

  express.urlencoded({ extended: true, limit: '10mb' }) :
    HTML 폼 데이터(application/x-www-form-urlencoded)를 파싱합니다.
    extended: true : 중첩 객체 형태의 데이터도 파싱 가능하게 합니다.
*/
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/*
  정적 파일 서비스 :
    /uploads 경로로 요청이 오면 서버의 uploads 폴더에서 파일을 제공합니다.
    __dirname은 현재 파일(app.js)이 있는 src 폴더를 가리키므로
    '..'으로 한 단계 위(server 폴더)로 이동한 뒤 uploads 폴더를 찾습니다.
    (예: GET /uploads/timelapse.jpg → server/uploads/timelapse.jpg 파일 반환)
*/
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));


// ────────────────────────────────────────────────
// 🛣️ API 라우터 마운트
// ────────────────────────────────────────────────

/*
  app.use(경로, 라우터) :
    지정한 경로로 시작하는 모든 요청을 해당 라우터로 전달합니다.
    라우터 내부의 경로는 여기서 지정한 경로 뒤에 붙습니다.
    (예: app.use('/api/auth', authRouter) + router.post('/login') → POST /api/auth/login)
*/
app.use('/api/auth',       authRouter);       // 회원가입, 로그인
app.use('/api/users',      userRouter);       // 내 정보, 통계, 랭킹, 스트릭
app.use('/api/immersions', immersionRouter);  // 세션 시작, 종료, 목록, 단건 조회
app.use('/api/reports',    reportRouter);     // 세션 리포트, AI 피드백
app.use('/api/badges',     badgeRouter);      // 뱃지 목록, 구매, 내 뱃지
app.use('/api/points',     pointRouter);      // 포인트 내역
app.use('/api/timelapses', timelapseRoute);   // 타임랩스 저장, 조회
app.use('/api/skins',      skinRouter);       // 스킨 목록, 구매, 적용


// ────────────────────────────────────────────────
// 🏥 헬스체크 엔드포인트
// ────────────────────────────────────────────────

/*
  GET /health :
    서버가 정상적으로 실행 중인지 확인하는 엔드포인트입니다.
    로드 밸런서, 모니터링 도구, 배포 파이프라인에서 서버 상태를 확인할 때 사용합니다.
    인증 없이 접근 가능하며 현재 서버 시각을 함께 반환합니다.
*/
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));


// ────────────────────────────────────────────────
// ❓ 404 핸들러
// ────────────────────────────────────────────────

/*
  등록된 모든 라우터와 경로에 매칭되지 않은 요청이 여기에 도달합니다.
  미들웨어는 등록 순서대로 실행되므로 라우터 등록 이후에 위치해야 합니다.
*/
app.use((_req, res) =>
  res.status(404).json({ success: false, message: '요청한 경로를 찾을 수 없습니다.' })
);


// ────────────────────────────────────────────────
// 🚨 전역 에러 핸들러
// ────────────────────────────────────────────────

/*
  Express 전역 에러 핸들러 :
    파라미터가 반드시 (err, req, res, next) 4개여야 Express가 에러 핸들러로 인식합니다.
    사용하지 않는 파라미터는 _를 붙여 ESLint의 no-unused-vars 경고를 억제합니다.

  [역할]
  next(err)로 전달된 모든 오류를 최종적으로 처리합니다.
  MySQL 에러 코드를 분기하여 상황에 맞는 HTTP 상태 코드와 메시지를 반환합니다.

  ▼ MySQL 에러 코드 분기 ▼
    ER_DUP_ENTRY          : UNIQUE 제약 조건 위반 (중복 데이터) → 409 Conflict
    ER_NO_REFERENCED_ROW_2 : FOREIGN KEY 제약 조건 위반 (참조 데이터 없음) → 400 Bad Request

  ▼ 기본 응답 ▼
    err.status가 있으면 해당 상태 코드, 없으면 500 Internal Server Error를 반환합니다.
*/
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // 에러 스택 트레이스 또는 메시지를 로거에 기록합니다
  logger.error(err.stack || err.message);

  // ── MySQL UNIQUE 제약 조건 위반 (중복 데이터) ────────
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success : false,
      message : '이미 존재하는 데이터입니다.',
    });
  }

  // ── MySQL FOREIGN KEY 제약 조건 위반 (참조 데이터 없음) ─
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      success : false,
      message : '참조하는 데이터가 존재하지 않습니다.',
    });
  }

  // ── 그 외 모든 오류 ──────────────────────────────────
  res.status(err.status || 500).json({
    success : false,
    message : err.message || '서버 오류가 발생했습니다.',
  });
});


// ────────────────────────────────────────────────
// 🚀 서버 시작 (DB 연결 후 순차 실행)
// ────────────────────────────────────────────────

/*
  즉시 실행 비동기 함수(IIFE) :
    서버 시작에 필요한 비동기 작업들을 순서대로 실행합니다.
    최상위 레벨에서 await를 사용하기 위해 async 함수로 감쌉니다.

  [실행 순서]
    1. connectDB()      : MySQL 연결 풀을 초기화합니다. DB 연결이 성공해야 이후 단계로 진행합니다.
    2. seedBadges()     : badges 테이블이 비어있으면 기본 뱃지 데이터를 삽입합니다.
    3. httpServer.listen() : 지정된 포트에서 HTTP 요청 수신을 시작합니다.
    4. startRankingCron() : 서버가 완전히 시작된 후에 랭킹 캐시를 초기화하고
                            자동 갱신 스케줄러를 등록합니다.
                            listen 콜백 안에서 호출하여 포트 바인딩 이후에 실행되도록 합니다.

  ▼ process.exit(1) ▼
    DB 연결 등 초기화에 실패하면 서버를 강제 종료합니다.
    불완전한 상태로 서버가 실행되면 이후 모든 요청이 실패하므로 즉시 종료하는 것이 안전합니다.
    종료 코드 1은 비정상 종료를 의미합니다. (0은 정상 종료)
*/
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    // 1. DB 연결 풀 초기화
    await connectDB();

    // 2. 기본 뱃지 시드 데이터 삽입 (이미 있으면 스킵)
    await seedBadges();

    // 3. HTTP 서버 포트 바인딩 (요청 수신 시작)
    httpServer.listen(PORT, () => {
      logger.info(`🚀 서버 실행 중 → http://localhost:${PORT}`);

      // 4. 랭킹 캐시 초기화 및 자동 갱신 스케줄러 등록
      //    서버가 완전히 시작된 후에 실행해야 DB 조회가 정상적으로 동작합니다
      startRankingCron();
    });

  } catch (err) {
    // DB 연결 실패 등 초기화 오류 발생 시 로그를 남기고 프로세스를 종료합니다
    logger.error('서버 시작 실패:', err);
    process.exit(1);  // 비정상 종료 (종료 코드 1)
  }
})();


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : app 인스턴스를 내보냅니다.
                   주로 Jest 등 테스트 프레임워크에서 supertest와 함께
                   app을 직접 임포트하여 API 테스트에 활용합니다.
*/
module.exports = app;
