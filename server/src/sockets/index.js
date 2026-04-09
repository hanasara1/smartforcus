// ─────────────────────────────────────────────────────────
// src/sockets/index.js  ─  Socket.IO 초기화 & 네임스페이스 등록
// ─────────────────────────────────────────────────────────
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { secret } = require('../config/jwt.config');
const logger = require('../utils/logger');
const poseHandler = require('./pose.socket');

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
        .split(',')
        .map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ── JWT 인증 미들웨어 (소켓 연결 시)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('소켓 인증 토큰이 없습니다.'));

    try {
      socket.user = jwt.verify(token, secret);
      next();
    } catch {
      next(new Error('유효하지 않은 소켓 토큰입니다.'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`🔌 소켓 연결: ${socket.id} (user: ${socket.user?.nick})`);

    // 자세 분석 이벤트 핸들러 등록
    poseHandler(socket, io);

    socket.on('disconnect', () => {
      logger.info(`🔌 소켓 해제: ${socket.id}`);
    });
  });

  logger.info('📡 Socket.IO 초기화 완료');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO 가 초기화되지 않았습니다.');
  return io;
};

module.exports = { initSocket, getIO };
