// ─────────────────────────────────────────────────────────
// server/src/sockets/index.js — Socket.IO 초기화 & 네임스페이스 등록
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  socket.io : 실시간 양방향 통신을 가능하게 해주는 라이브러리입니다.
              HTTP는 클라이언트가 요청해야만 응답하는 단방향 통신이지만,
              Socket.IO는 서버와 클라이언트가 연결을 유지하며 서로 이벤트를 주고받습니다.
              자세 분석 결과를 실시간으로 클라이언트에 전송하는 데 사용합니다.

  Server : Socket.IO 서버 인스턴스를 생성하는 클래스입니다.
           기존 HTTP 서버(httpServer)에 연결하여 동일한 포트에서 WebSocket을 함께 처리합니다.
*/
const { Server } = require('socket.io');

/*
  jsonwebtoken : HTTP 인증과 동일하게 소켓 연결 시에도 JWT 토큰으로 유저를 검증합니다.
                 클라이언트는 소켓 연결 요청 시 handshake.auth.token에 JWT를 담아 보냅니다.
*/
const jwt = require('jsonwebtoken');

// secret : JWT 서명 및 검증에 사용하는 비밀 키
const { secret } = require('../config/jwt.config');

// logger : 소켓 연결·해제·오류 이벤트를 기록하는 로깅 유틸리티
const logger = require('../utils/logger');

// poseHandler : 자세 분석 관련 소켓 이벤트를 처리하는 핸들러 함수
const poseHandler = require('./pose.socket');


// ────────────────────────────────────────────────
// 🗄️ Socket.IO 인스턴스 저장소
// ────────────────────────────────────────────────

/*
  io : 생성된 Socket.IO 서버 인스턴스를 모듈 스코프에 저장합니다.
       initSocket()에서 초기화되고, getIO()를 통해 다른 파일에서 접근합니다.
       모듈 스코프 변수로 관리하면 인스턴스를 전역으로 공유하면서도
       모듈 외부에서 직접 수정할 수 없어 안전합니다.
*/
let io;


// ────────────────────────────────────────────────
// 🚀 Socket.IO 초기화 함수
// ────────────────────────────────────────────────

/*
  initSocket(httpServer)

  [역할]
  HTTP 서버에 Socket.IO를 연결하고 CORS, JWT 인증 미들웨어, 이벤트 핸들러를 등록합니다.
  서버 시작 시 1회 호출하며, 이후 getIO()로 인스턴스를 참조합니다.

  [처리 순서]
    1. HTTP 서버에 Socket.IO 서버 인스턴스를 생성하고 CORS를 설정합니다.
    2. 소켓 연결 시 JWT를 검증하는 미들웨어를 등록합니다.
    3. 연결 성공 시 자세 분석 이벤트 핸들러를 등록합니다.
    4. 연결 해제 이벤트를 처리합니다.

  ▼ CORS 설정 ▼
    HTTP API와 별도로 Socket.IO도 CORS를 설정해야 합니다.
    ALLOWED_ORIGINS 환경 변수에 쉼표로 구분된 도메인 목록을 지정할 수 있습니다.
    환경 변수가 없으면 로컬 개발 서버(http://localhost:3000)를 기본값으로 사용합니다.
    .split(',').map(trim) : 쉼표 구분 문자열을 배열로 변환하고 앞뒤 공백을 제거합니다.

  @param {http.Server} httpServer - Express와 연결된 Node.js HTTP 서버 인스턴스
  @returns {Server} 초기화된 Socket.IO 서버 인스턴스
*/
const initSocket = (httpServer) => {

  // ── Socket.IO 서버 생성 및 CORS 설정 ────────────────
  io = new Server(httpServer, {
    cors: {
      /*
        ALLOWED_ORIGINS 환경 변수를 쉼표로 분리하여 허용 도메인 배열을 구성합니다.
        (예: 'https://app.example.com,https://www.example.com' → 배열 2개)
        환경 변수가 없으면 로컬 개발 환경 주소를 기본값으로 사용합니다.
      */
      origin      : (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
        .split(',')
        .map((o) => o.trim()),
      methods     : ['GET', 'POST'],  // 소켓 핸드셰이크에 허용할 HTTP 메서드
      credentials : true,             // 쿠키 및 인증 헤더 포함 요청 허용
    },
  });

  // ── 소켓 JWT 인증 미들웨어 등록 ─────────────────────
  /*
    io.use() : 모든 소켓 연결 요청에 미들웨어를 적용합니다.
               HTTP의 express 미들웨어와 동일한 역할을 소켓에서 수행합니다.

    socket.handshake.auth?.token :
      클라이언트가 소켓 연결 시 전달하는 인증 토큰입니다.
      클라이언트에서는 아래와 같이 토큰을 담아 연결합니다.
        io({ auth: { token: 'Bearer eyJhbGci...' } })

    next(new Error(...)) : 오류를 전달하면 연결이 거부되고 클라이언트에 오류가 전달됩니다.
    next()               : 오류 없이 호출하면 다음 단계(연결 수락)로 진행합니다.
  */
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    // 토큰이 없으면 연결을 거부합니다
    if (!token) return next(new Error('소켓 인증 토큰이 없습니다.'));

    try {
      // 토큰 검증 성공 시 디코딩된 유저 정보를 socket.user에 주입합니다
      socket.user = jwt.verify(token, secret);
      next();  // 인증 통과 → 연결 수락
    } catch {
      // 토큰 만료 또는 위변조 시 연결을 거부합니다
      next(new Error('유효하지 않은 소켓 토큰입니다.'));
    }
  });

  // ── 소켓 연결 이벤트 핸들러 등록 ────────────────────
  /*
    'connection' 이벤트 : JWT 인증 미들웨어를 통과한 클라이언트가 연결될 때 발생합니다.
    socket 객체 : 연결된 개별 클라이언트와의 통신 채널입니다.
                  socket.id : 연결마다 자동 생성되는 고유 식별자
                  socket.user : JWT 미들웨어에서 주입된 유저 정보 { user_idx, email, nick }
  */
  io.on('connection', (socket) => {
    logger.info(`🔌 소켓 연결: ${socket.id} (user: ${socket.user?.nick})`);

    // 자세 분석 관련 이벤트 핸들러를 이 소켓에 등록합니다
    // poseHandler(socket, io) : socket은 현재 클라이언트, io는 전체 서버 인스턴스
    poseHandler(socket, io);

    // ── 연결 해제 이벤트 처리 ────────────────────────
    /*
      'disconnect' 이벤트 : 클라이언트가 연결을 끊을 때 발생합니다.
      브라우저 탭 닫기, 네트워크 끊김, 명시적 disconnect 호출 등 모든 경우에 발생합니다.
    */
    socket.on('disconnect', () => {
      logger.info(`🔌 소켓 해제: ${socket.id}`);
    });
  });

  logger.info('📡 Socket.IO 초기화 완료');
  return io;
};


// ────────────────────────────────────────────────
// 🔍 Socket.IO 인스턴스 반환 함수
// ────────────────────────────────────────────────

/*
  getIO()

  [역할]
  다른 파일에서 Socket.IO 인스턴스에 접근할 때 사용합니다.
  initSocket()이 먼저 호출되지 않으면 오류를 발생시켜 잘못된 사용을 방지합니다.

  ▼ 사용 예시 ▼
    const { getIO } = require('../sockets');
    getIO().emit('ranking_update', data);  // 모든 클라이언트에 이벤트 전송
    getIO().to(socketId).emit('pose_result', data);  // 특정 클라이언트에 이벤트 전송

  @throws {Error} initSocket()이 호출되지 않은 상태에서 getIO()를 호출하면 오류 발생
  @returns {Server} 초기화된 Socket.IO 서버 인스턴스
*/
const getIO = () => {
  if (!io) throw new Error('Socket.IO 가 초기화되지 않았습니다.');
  return io;
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - initSocket : 서버 시작 시 1회 호출하여 Socket.IO를 초기화
                   (예: app.js에서 const io = initSocket(httpServer))
    - getIO      : 초기화된 Socket.IO 인스턴스가 필요한 곳에서 호출
                   (예: 컨트롤러나 서비스에서 실시간 이벤트 전송 시)
*/
module.exports = { initSocket, getIO };
