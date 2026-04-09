// ─────────────────────────────────────────────────────────
// src/middlewares/auth.middleware.js  ─  JWT 인증 미들웨어
// ─────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { secret } = require('../config/jwt.config');

/**
 * Authorization 헤더에서 Bearer 토큰을 검증합니다.
 * 검증 성공 시 req.user 에 디코딩된 페이로드를 주입합니다.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '인증 토큰이 없습니다.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;   // { user_idx, email, nick, iat, exp }
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? '토큰이 만료되었습니다. 다시 로그인해 주세요.'
        : '유효하지 않은 토큰입니다.';
    return res.status(401).json({ success: false, message });
  }
};

module.exports = { authenticate };
