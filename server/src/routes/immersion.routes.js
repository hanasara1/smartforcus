// server/src/routes/immersion.routes.js
const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { startSession, endSession, getList, getOne } = require('../controllers/immersion.controller');

const router = Router();
router.use(authenticate);

router.get('/',         getList);
router.get('/:imm_idx', getOne);
router.post('/',
  [
    body('imm_date').isDate().withMessage('올바른 날짜 형식이 아닙니다.'),
    body('start_time').notEmpty().withMessage('시작 시간이 필요합니다.'),
  ],
  validate,
  startSession
);
router.patch('/:imm_idx/end',
  [
    body('end_time').notEmpty().withMessage('종료 시간이 필요합니다.'),
    body('imm_score').isInt({ min: 0, max: 100 }).withMessage('집중 점수는 0~100 사이여야 합니다.'),
  ],
  validate,
  endSession
);

module.exports = router;
