// ─────────────────────────────────────────────────────────
// server/src/routes/timelapse.routes.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  express.Router() : Express의 미니 애플리케이션으로, 라우트(경로)를 모듈 단위로 분리하여 관리합니다.
                     app.js에서 이 라우터를 특정 경로에 마운트하면
                     아래에 정의된 모든 라우트가 해당 경로 아래에 등록됩니다.
                     (예: app.use('/api/timelapses', timelapseRouter))
*/
const express = require('express');
const router  = express.Router();

/*
  ctrl : timelapse.controller.js에서 exports.함수명 방식으로 내보낸 컨트롤러 함수들을
         하나의 객체로 불러옵니다.
         ctrl.createTimelapse, ctrl.getTimelapses 형태로 접근합니다.
*/
const ctrl = require('../controllers/timelapse.controller');

// authenticate : Authorization 헤더의 JWT 토큰을 검증하고 req.user를 주입하는 인증 미들웨어
const { authenticate } = require('../middlewares/auth.middleware');


// ────────────────────────────────────────────────
// 🔐 인증 미들웨어 전역 등록
// ────────────────────────────────────────────────

/*
  router.use(authenticate) :
    이 라우터에 등록된 모든 라우트에 authenticate 미들웨어를 일괄 적용합니다.
    타임랩스 관련 API는 전부 로그인한 유저만 접근할 수 있으므로 전역으로 등록합니다.

    실행 흐름 (모든 라우트 공통):
      요청 → authenticate (토큰 검증 + req.user 주입) → 각 컨트롤러

  ✅ multer 미사용 안내 :
    이전에는 타임랩스 파일을 multipart/form-data로 직접 업로드했으나,
    현재는 파일 자체가 아닌 파일명(문자열)만 JSON 바디로 전달받습니다.
    따라서 파일 업로드 처리 라이브러리인 multer가 필요 없습니다.
*/
router.use(authenticate);


// ────────────────────────────────────────────────
// 🎞️ 타임랩스 라우트 등록
// ────────────────────────────────────────────────

/*
  POST /api/timelapses
  집중 세션 중 촬영된 타임랩스의 파일명을 DB에 저장합니다.
  요청 바디로 { imm_idx, file_name }을 JSON 형식으로 전달합니다.
  본인 소유의 세션에만 저장할 수 있으며, 소유자 검증은 컨트롤러에서 수행합니다.
*/
router.post('/', ctrl.createTimelapse);

/*
  GET /api/timelapses/:imm_idx
  특정 집중 세션에 속한 타임랩스 파일명 목록을 촬영 시각 오름차순으로 조회합니다.
  :imm_idx는 URL에서 동적으로 받는 세션 고유 ID입니다.
  (예: GET /api/timelapses/5 → imm_idx = 5인 세션의 타임랩스 목록 반환)
*/
router.get('/:imm_idx', ctrl.getTimelapses);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 라우터를 app.js 또는 index.js에서 불러와 마운트할 수 있게 합니다.
                   (예: app.use('/api/timelapses', require('./routes/timelapse.routes')))
*/
module.exports = router;
