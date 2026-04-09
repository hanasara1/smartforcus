// ─────────────────────────────────────────────────────────
// src/routes/auth.routes.js
// ─────────────────────────────────────────────────────────
const { Router } = require('express');
const { body } = require('express-validator');
const { register, login } = require('../controllers/auth.controller');
const { validate } = require('../middlewares/validate.middleware');

const router = Router();

router.post(
  '/register',
  [
    body('email')
      .isEmail()
      .withMessage('유효한 이메일 형식이 아닙니다.'),
    body('pwd')
      .isLength({ min: 8 })
      .withMessage('비밀번호는 최소 8자 이상이어야 합니다.')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
      .withMessage('비밀번호는 영문자와 숫자를 포함해야 합니다.'),
    body('nick')
      .notEmpty().withMessage('닉네임은 필수입니다.')
      .isLength({ min: 2, max: 12 }).withMessage('닉네임은 2~12자 이내여야 합니다.')
      .matches(/^[가-힣a-zA-Z0-9]+$/).withMessage('닉네임은 한글, 영문, 숫자만 사용 가능합니다.'),
  ],
  validate,
  register,
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('유효한 이메일 형식이 아닙니다.'),
    body('pwd').notEmpty().withMessage('비밀번호를 입력해 주세요.'),
  ],
  validate,
  login,
);

module.exports = router;
