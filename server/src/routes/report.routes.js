// server/src/routes/report.routes.js
const { Router } = require('express');
const { param } = require('express-validator'); // ✅ param 추가

const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');

const { getReport, getReportList, generateFeedback } = require('../controllers/report.controller');

const router = Router();
router.use(authenticate);

// ✅ imm_idx 숫자 검증 추가
const immIdxValidation = [
    param('imm_idx').isInt({ min: 1 }).withMessage('유효하지 않은 세션 ID입니다.'),
];

router.get('/', getReportList);
router.get('/:imm_idx', immIdxValidation, validate, getReport);
router.post('/:imm_idx/feedback', immIdxValidation, validate, generateFeedback);

module.exports = router;
