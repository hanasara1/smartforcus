// server/src/routes/skin.routes.js
const { Router } = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const {
    getSkinList,
    purchaseSkin,
    applySkin,
    getActiveSkin,
} = require('../controllers/skin.controller');

const router = Router();
router.use(authenticate);

router.get('/active', getActiveSkin); // 현재 적용 스킨
router.get('/', getSkinList);   // 전체 스킨 목록
router.post('/purchase', purchaseSkin);  // 스킨 구매
router.patch('/apply', applySkin);     // 스킨 적용

module.exports = router;
