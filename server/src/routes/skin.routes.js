// ─────────────────────────────────────────────────────────
// server/src/routes/skin.routes.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  Router : Express의 미니 애플리케이션으로, 라우트(경로)를 모듈 단위로 분리하여 관리합니다.
           app.js에서 이 라우터를 특정 경로에 마운트하면
           아래에 정의된 모든 라우트가 해당 경로 아래에 등록됩니다.
           (예: app.use('/api/skins', skinRouter))
*/
const { Router } = require('express');

// authenticate : Authorization 헤더의 JWT 토큰을 검증하고 req.user를 주입하는 인증 미들웨어
const { authenticate } = require('../middlewares/auth.middleware');

// 스킨 관련 비즈니스 로직을 처리하는 컨트롤러 함수들
const {
    getSkinList,    // 전체 스킨 목록 + 보유 여부 조회
    purchaseSkin,   // 포인트로 스킨 구매
    applySkin,      // 보유한 스킨을 현재 적용 스킨으로 설정
    getActiveSkin,  // 현재 적용 중인 스킨 키 조회
} = require('../controllers/skin.controller');

// Router 인스턴스를 생성합니다. 이 객체에 라우트를 등록한 뒤 외부로 내보냅니다
const router = Router();


// ────────────────────────────────────────────────
// 🔐 인증 미들웨어 전역 등록
// ────────────────────────────────────────────────

/*
  router.use(authenticate) :
    이 라우터에 등록된 모든 라우트에 authenticate 미들웨어를 일괄 적용합니다.
    스킨 관련 API는 전부 로그인한 유저만 접근할 수 있으므로 전역으로 등록합니다.

    실행 흐름 (모든 라우트 공통):
      요청 → authenticate (토큰 검증 + req.user 주입) → 각 컨트롤러
*/
router.use(authenticate);


// ────────────────────────────────────────────────
// 🎨 스킨 라우트 등록
// ────────────────────────────────────────────────

/*
  GET /api/skins/active
  현재 로그인한 유저가 적용 중인 스킨의 skin_key를 반환합니다.
  적용된 스킨이 없으면 기본값 'default'를 반환합니다.

  ⚠️ 주의 : GET '/' 보다 반드시 먼저 등록해야 합니다.
             Express는 라우트를 등록 순서대로 매칭하므로
             '/active'가 아래에 있으면 동적 파라미터 라우트가 있을 경우
             'active'가 파라미터 값으로 잘못 매칭될 수 있습니다.
*/
router.get('/active', getActiveSkin);

/*
  GET /api/skins
  전체 스킨 목록을 조회합니다.
  현재 로그인한 유저의 보유 여부(is_owned)와 현재 적용 여부(is_active)를 함께 반환합니다.
  스킨 가격(skin_price) 오름차순으로 정렬하여 반환합니다.
*/
router.get('/', getSkinList);

/*
  POST /api/skins/purchase
  요청 바디의 skin_idx에 해당하는 스킨을 포인트로 구매합니다.
  포인트 차감과 스킨 지급은 트랜잭션으로 처리하여 데이터 무결성을 보장합니다.
  무료 스킨(skin_price = 0)은 포인트 검증 및 차감 과정을 건너뜁니다.
*/
router.post('/purchase', purchaseSkin);

/*
  PATCH /api/skins/apply
  요청 바디의 skin_idx에 해당하는 스킨을 현재 적용 스킨으로 설정합니다.
  유료 스킨은 반드시 보유해야만 적용할 수 있으며,
  무료 스킨은 미보유 상태라도 자동 등록 후 활성화합니다.
  기존 활성 스킨은 모두 비활성화한 뒤 선택한 스킨만 활성화합니다.
*/
router.patch('/apply', applySkin);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 라우터를 app.js 또는 index.js에서 불러와 마운트할 수 있게 합니다.
                   (예: app.use('/api/skins', require('./routes/skin.routes')))
*/
module.exports = router;
