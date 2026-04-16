// ─────────────────────────────────────────────────────────
// server/src/routes/point.routes.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  Router : Express의 미니 애플리케이션으로, 라우트(경로)를 모듈 단위로 분리하여 관리합니다.
           app.js에서 이 라우터를 특정 경로에 마운트하면
           아래에 정의된 모든 라우트가 해당 경로 아래에 등록됩니다.
           (예: app.use('/api/points', pointRouter))
*/
const { Router } = require('express');

// authenticate : Authorization 헤더의 JWT 토큰을 검증하고 req.user를 주입하는 인증 미들웨어
const { authenticate } = require('../middlewares/auth.middleware');

// getHistory : 포인트 적립·차감 내역을 페이지 단위로 조회하는 컨트롤러 함수
const { getHistory } = require('../controllers/point.controller');

// Router 인스턴스를 생성합니다. 이 객체에 라우트를 등록한 뒤 외부로 내보냅니다
const router = Router();


// ────────────────────────────────────────────────
// 🔐 인증 미들웨어 전역 등록
// ────────────────────────────────────────────────

/*
  router.use(authenticate) :
    이 라우터에 등록된 모든 라우트에 authenticate 미들웨어를 일괄 적용합니다.
    포인트 내역은 본인의 기록만 조회할 수 있으므로 전역으로 등록합니다.

    실행 흐름:
      요청 → authenticate (토큰 검증 + req.user 주입) → getHistory 컨트롤러
*/
router.use(authenticate);


// ────────────────────────────────────────────────
// 💰 포인트 라우트 등록
// ────────────────────────────────────────────────

/*
  GET /api/points
  현재 로그인한 유저의 포인트 적립·차감 내역을 페이지 단위로 조회합니다.
  쿼리 파라미터로 page, limit을 전달할 수 있습니다. (기본값: page=1, limit=20)
  포인트 잔액 합계(total)와 전체 내역 수(count)도 메타 정보로 함께 반환합니다.
*/
router.get('/', getHistory);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 라우터를 app.js 또는 index.js에서 불러와 마운트할 수 있게 합니다.
                   (예: app.use('/api/points', require('./routes/point.routes')))
*/
module.exports = router;
