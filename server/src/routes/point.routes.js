// server/src/routes/point.routes.js
const { Router } = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { getHistory } = require('../controllers/point.controller');

const router = Router();
router.use(authenticate);
router.get('/', getHistory);

module.exports = router;
