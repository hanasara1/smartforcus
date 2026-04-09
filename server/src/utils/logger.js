// ─────────────────────────────────────────────────────────
// src/utils/logger.js  ─  Winston 로거
// ─────────────────────────────────────────────────────────
const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `[${ts}] ${level}: ${stack || message}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat,
  ),
  transports: [
    // 콘솔 출력 (컬러)
    new transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
    // 파일 출력 (error 레벨 이상)
    new transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
    }),
    // 전체 로그 파일
    new transports.File({
      filename: path.join('logs', 'combined.log'),
    }),
  ],
});

module.exports = logger;
