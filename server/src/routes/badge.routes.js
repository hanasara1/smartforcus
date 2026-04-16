// ─────────────────────────────────────────────────────────
// server/src/routes/badge.routes.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  Router : Express의 미니 애플리케이션으로, 라우트(경로)를 모듈 단위로 분리하여 관리합니다.
           app.js에서 이 라우터를 특정 경로에 마운트하면
           아래에 정의된 모든 라우트가 해당 경로 아래에 등록됩니다.
           (예: app.use('/api/badges', badgeRouter) → /api/badges, /api/badges/my 등)
*/
const { Router } = require('express');

// authenticate : Authorization 헤더의 JWT 토큰을 검증하고 req.user를 주입하는 인증 미들웨어
const { authenticate } = require('../middlewares/auth.middleware');

// 뱃지 관련 비즈니스 로직을 처리하는 컨트롤러 함수들
const { getBadgeList, purchaseBadge, getMyBadges } = require('../controllers/badge.controller');

// Router 인스턴스를 생성합니다. 이 객체에 라우트를 등록한 뒤 외부로 내보냅니다
const router = Router();


// ────────────────────────────────────────────────
// 🔐 인증 미들웨어 전역 등록
// ────────────────────────────────────────────────

/*
  router.use(authenticate) :
    이 라우터에 등록된 모든 라우트에 authenticate 미들웨어를 일괄 적용합니다.
    개별 라우트마다 authenticate를 반복 작성하지 않아도 되므로 코드가 간결해집니다.
    뱃지 관련 API는 전부 로그인한 유저만 접근할 수 있으므로 전역으로 등록합니다.

    실행 흐름 (모든 라우트 공통):
      요청 → authenticate (토큰 검증 + req.user 주입) → 각 컨트롤러
*/
router.use(authenticate);


// ────────────────────────────────────────────────
// 🏅 뱃지 라우트 등록
// ────────────────────────────────────────────────

/*
  GET /api/badges
  전체 뱃지 목록을 조회합니다.
  현재 로그인한 유저의 보유 여부(is_owned)와 획득 시각(earned_at)을 함께 반환합니다.
*/
router.get('/', getBadgeList);

/*
  GET /api/badges/my
  현재 로그인한 유저가 보유한 뱃지 목록만 조회합니다.
  최근 획득한 뱃지가 먼저 오도록 정렬하여 반환합니다.

  ⚠️ 주의 : '/:badge_idx/purchase' 보다 먼저 등록해야 합니다.
             Express는 라우트를 등록 순서대로 매칭하므로
             '/my'가 아래에 있으면 'my'가 badge_idx 파라미터로 잘못 매칭될 수 있습니다.
*/
router.get('/my', getMyBadges);

/*
  POST /api/badges/:badge_idx/purchase
  특정 뱃지를 포인트로 구매합니다.
  :badge_idx는 URL에서 동적으로 받는 뱃지 고유 ID입니다.
  (예: POST /api/badges/3/purchase → badge_idx = 3)
*/
router.post('/:badge_idx/purchase', purchaseBadge);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 라우터를 app.js 또는 index.js에서 불러와 마운트할 수 있게 합니다.
                   (예: app.use('/api/badges', require('./routes/badge.routes')))
*/
module.exports = router;
