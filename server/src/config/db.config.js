// ─────────────────────────────────────────────────────────
// src/config/db.config.js  ─  MySQL 연결 풀 설정
// ─────────────────────────────────────────────────────────
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

let pool;

/**
 * 연결 풀 생성 및 초기 ping 테스트
 */
const connectDB = async () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gomindokki',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+09:00',   // KST
    charset: 'utf8mb4',
  });

  // 연결 테스트
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  logger.info('✅ MySQL 연결 성공');
};

/**
 * 연결 풀 getter ─ 라우터/서비스에서 사용
 * @returns {mysql.Pool}
 */
const getPool = () => {
  if (!pool) throw new Error('DB 연결 풀이 초기화되지 않았습니다. connectDB()를 먼저 호출하세요.');
  return pool;
};

module.exports = { connectDB, getPool };
