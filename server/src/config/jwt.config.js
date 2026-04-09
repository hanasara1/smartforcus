// ─────────────────────────────────────────────────────────
// src/config/jwt.config.js  ─  JWT 설정값 모음
// ─────────────────────────────────────────────────────────

module.exports = {
  /** 액세스 토큰 서명 키 */
  secret: process.env.JWT_SECRET || 'CHANGE_ME_IN_ENV',

  /** 액세스 토큰 만료 시간 */
  expiresIn: process.env.JWT_EXPIRES_IN || '2h',

  /** 리프레시 토큰 서명 키 */
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'CHANGE_REFRESH_ME_IN_ENV',

  /** 리프레시 토큰 만료 시간 */
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};
