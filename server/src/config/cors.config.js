// server/src/config/cors.config.js

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''));  // ← 뒤에 붙는 / 제거 추가

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('Origin 없는 요청은 운영 환경에서 허용되지 않습니다.'));
      }
      return callback(null, true);
    }

    // ← origin에서도 trailing slash 제거 후 비교
    const normalizedOrigin = origin.replace(/\/$/, '');

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS 정책 위반: ${origin} 은 허용되지 않는 출처입니다.`));
  },

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
  ],

  credentials: true,
  maxAge: 86400,
};

module.exports = corsOptions;
