// server/src/routes/user.routes.js
const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { getMe, updateMe, getMyStats, getMyPoseStats, getRanking, getMyStreak } = 
  require('../controllers/user.controller');

const router = Router();
router.use(authenticate);

// ✅ 수정된 라우트 목록 ('/me/stats' 아래에 추가)
router.get('/me', getMe);
router.get('/me/stats', getMyStats);
router.get('/me/pose-stats', getMyPoseStats); // 👈 추가
router.get('/ranking', getRanking);  // 👈 추가
router.get('/me/streak', getMyStreak); // 👈 추가

router.put('/me',
  [
    body('nick')
    .optional()
    .notEmpty()
    .withMessage('닉네임을 입력해주세요.')
    .isLength({ min: 2, max: 12 })
    .withMessage('닉네임은 2~12자 이내여야 합니다.')
    .matches(/^[가-힣a-zA-Z0-9]+$/)
    .withMessage('닉네임은 한글, 영문, 숫자만 사용 가능합니다.'),

    body('newPwd')
    .optional()
    .isLength({ min: 8 })
    .withMessage('새 비밀번호는 8자 이상이어야 합니다.'),
  ],
  validate,
  updateMe
);

module.exports = router;
