// server/src/routes/timelapse.route.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/timelapse.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

// ✅ multer 완전 제거! JSON으로 받으니까 필요 없어요
router.post('/',        ctrl.createTimelapse);
router.get('/:imm_idx', ctrl.getTimelapses);

module.exports = router;
