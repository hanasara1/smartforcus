// ─────────────────────────────────────────────────────────
// server/src/routes/report.routes.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  Router : Express의 미니 애플리케이션으로, 라우트(경로)를 모듈 단위로 분리하여 관리합니다.
           app.js에서 이 라우터를 특정 경로에 마운트하면
           아래에 정의된 모든 라우트가 해당 경로 아래에 등록됩니다.
           (예: app.use('/api/reports', reportRouter))
*/
const { Router } = require('express');

/*
  param : express-validator의 URL 파라미터 검증 체인 생성 함수입니다.
          body()가 요청 바디의 필드를 검증하는 것과 달리,
          param()은 URL의 동적 세그먼트(:imm_idx 등)를 검증합니다.
          (예: GET /api/reports/abc → imm_idx='abc' → 숫자 아님 → 422 반환)
*/
const { param } = require('express-validator');

// authenticate : Authorization 헤더의 JWT 토큰을 검증하고 req.user를 주입하는 인증 미들웨어
const { authenticate } = require('../middlewares/auth.middleware');

// validate : express-validator 검증 결과를 수집하여 오류가 있으면 422를 반환하는 미들웨어
const { validate } = require('../middlewares/validate.middleware');

// 리포트 관련 비즈니스 로직을 처리하는 컨트롤러 함수들
const { getReport, getReportList, generateFeedback } = require('../controllers/report.controller');

// Router 인스턴스를 생성합니다. 이 객체에 라우트를 등록한 뒤 외부로 내보냅니다
const router = Router();


// ────────────────────────────────────────────────
// 🔐 인증 미들웨어 전역 등록
// ────────────────────────────────────────────────

/*
  router.use(authenticate) :
    이 라우터에 등록된 모든 라우트에 authenticate 미들웨어를 일괄 적용합니다.
    리포트 관련 API는 전부 로그인한 유저만 접근할 수 있으므로 전역으로 등록합니다.

    실행 흐름 (모든 라우트 공통):
      요청 → authenticate (토큰 검증 + req.user 주입) → 파라미터 검증 → validate → 컨트롤러
*/
router.use(authenticate);


// ────────────────────────────────────────────────
// 🔢 공통 파라미터 검증 규칙
// ────────────────────────────────────────────────

/*
  immIdxValidation :
    :imm_idx URL 파라미터를 사용하는 라우트에 공통으로 적용하는 검증 규칙 배열입니다.
    동일한 검증 규칙을 각 라우트에 반복 작성하는 대신 변수로 분리하여 재사용합니다.

    .isInt({ min: 1 }) :
      imm_idx가 1 이상의 정수인지 확인합니다.
      문자열('abc'), 소수(1.5), 0 이하의 값은 모두 유효하지 않은 세션 ID로 판단합니다.
      잘못된 값이 컨트롤러까지 전달되어 DB 조회 오류를 일으키는 것을 미리 방지합니다.
*/
const immIdxValidation = [
    param('imm_idx')
        .isInt({ min: 1 })
        .withMessage('유효하지 않은 세션 ID입니다.'),
];


// ────────────────────────────────────────────────
// 📊 리포트 라우트 등록
// ────────────────────────────────────────────────

/*
  GET /api/reports
  현재 로그인한 유저의 완료된 집중 세션 목록을 페이지 단위로 조회합니다.
  각 세션에 집중 시간, 불량 자세 수, 소음 감지 횟수를 함께 반환합니다.
  쿼리 파라미터로 page, limit을 전달할 수 있습니다. (기본값: page=1, limit=10)
*/
router.get('/', getReportList);

/*
  GET /api/reports/:imm_idx
  특정 집중 세션의 상세 리포트를 조회합니다.
  세션 정보, 자세 데이터, 소음 데이터, AI 피드백, 타임랩스, 통계 요약을 한 번에 반환합니다.

  [처리 흐름]
    immIdxValidation (imm_idx 숫자 검증) → validate → getReport 컨트롤러
*/
router.get('/:imm_idx', immIdxValidation, validate, getReport);

/*
  POST /api/reports/:imm_idx/feedback
  특정 집중 세션에 대한 AI 피드백을 생성(또는 재생성)합니다.
  기존 피드백이 있으면 UPDATE, 없으면 INSERT하는 UPSERT 방식으로 처리합니다.

  [처리 흐름]
    immIdxValidation (imm_idx 숫자 검증) → validate → generateFeedback 컨트롤러
*/
router.post('/:imm_idx/feedback', immIdxValidation, validate, generateFeedback);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 라우터를 app.js 또는 index.js에서 불러와 마운트할 수 있게 합니다.
                   (예: app.use('/api/reports', require('./routes/report.routes')))
*/
module.exports = router;
