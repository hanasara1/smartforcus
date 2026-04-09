// ─────────────────────────────────────────────────────────
// src/middlewares/validate.middleware.js
// express-validator 결과를 일괄 처리하는 미들웨어
// ─────────────────────────────────────────────────────────
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: '입력값 유효성 검사 실패',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = { validate };
