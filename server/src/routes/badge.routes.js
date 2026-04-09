// server/src/routes/badge.routes.js
const { Router } = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { getBadgeList, purchaseBadge, getMyBadges } = require('../controllers/badge.controller');

const router = Router();
router.use(authenticate);

router.get('/', getBadgeList);
router.get('/my', getMyBadges);
router.post('/:badge_idx/purchase', purchaseBadge);

module.exports = router;
