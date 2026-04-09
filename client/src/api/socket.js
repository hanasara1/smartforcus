// ─────────────────────────────────────────────────────────
// src/api/socket.js  ─  Socket.IO 클라이언트 싱글턴
// ─────────────────────────────────────────────────────────
import { io } from 'socket.io-client';

let socket = null;

/**
 * 소켓 연결 초기화
 * @param {string} token  ─  JWT 액세스 토큰
 */
export const connectSocket = (token) => {
  if (socket?.connected) return socket;

  // ✅ 기존 소켓이 있지만 연결이 끊긴 경우 재사용
  if (socket) {
    socket.connect();
    return socket;
  }

  socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  // ✅ once 대신 on을 쓰되 중복 방지를 위해 off 후 on
  socket.off('connect_error').on('connect_error', (err) => {
    console.error('소켓 연결 오류:', err.message);
  });

  return socket;
};

/** 소켓 연결 해제 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/** 현재 소켓 인스턴스 반환 */
export const getSocket = () => socket;
