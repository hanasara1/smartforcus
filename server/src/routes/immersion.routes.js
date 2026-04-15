// ─────────────────────────────────────────────────────────
// server/src/routes/immersion.routes.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  Router : Express의 미니 애플리케이션으로, 라우트(경로)를 모듈 단위로 분리하여 관리합니다.
           app.js에서 이 라우터를 특정 경로에 마운트하면
           아래에 정의된 모든 라우트가 해당 경로 아래에 등록됩니다.
           (예: app.use('/api/immersions', immersionRouter))
*/
const { Router } = require('express');

/*
  body : express-validator의 검증 체인 생성 함수입니다.
         body('필드명')으로 시작하여 .isDate(), .isInt() 등의 규칙을 체인으로 연결하고,
         .withMessage()로 각 규칙 실패 시 반환할 메시지를 지정합니다.
*/
const { body } = require('express-validator');

// authenticate : Authorization 헤더의 JWT 토큰을 검증하고 req.user를 주입하는 인증 미들웨어
const { authenticate } = require('../middlewares/auth.middleware');

// validate : express-validator 검증 결과를 수집하여 오류가 있으면 422를 반환하는 미들웨어
const { validate } = require('../middlewares/validate.middleware');

// 집중 세션 관련 비즈니스 로직을 처리하는 컨트롤러 함수들
const { startSession, endSession, getList, getOne } = require('../controllers/immersion.controller');

// Router 인스턴스를 생성합니다. 이 객체에 라우트를 등록한 뒤 외부로 내보냅니다
const router = Router();


// ────────────────────────────────────────────────
// 🔐 인증 미들웨어 전역 등록
// ────────────────────────────────────────────────

/*
  router.use(authenticate) :
    이 라우터에 등록된 모든 라우트에 authenticate 미들웨어를 일괄 적용합니다.
    집중 세션 관련 API는 전부 로그인한 유저만 접근할 수 있으므로 전역으로 등록합니다.

    실행 흐름 (모든 라우트 공통):
      요청 → authenticate (토큰 검증 + req.user 주입) → 검증 규칙 → validate → 컨트롤러
*/
router.use(authenticate);


// ────────────────────────────────────────────────
// ▶️ 집중 세션 라우트 등록
// ────────────────────────────────────────────────

/*
  GET /api/immersions
  현재 로그인한 유저의 집중 세션 기록 목록을 페이지 단위로 조회합니다.
  쿼리 파라미터로 page, limit을 전달할 수 있습니다. (기본값: page=1, limit=10)
*/
router.get('/', getList);

/*
  GET /api/immersions/:imm_idx
  특정 집중 세션 하나의 상세 정보를 조회합니다.
  :imm_idx는 URL에서 동적으로 받는 세션 고유 ID입니다.
  본인 소유의 세션만 조회할 수 있습니다.

  ⚠️ 주의 : 정적 경로('/')보다 아래에, 동적 경로('/:imm_idx/end')보다 위에 등록합니다.
             Express는 라우트를 등록 순서대로 매칭하므로 순서가 중요합니다.
*/
router.get('/:imm_idx', getOne);

/*
  POST /api/immersions
  새 집중 세션을 시작합니다.
  세션 날짜와 시작 시각을 받아 immersions 테이블에 새 행을 생성합니다.

  ▼ 검증 규칙 ▼
    [imm_date]
      .isDate() : 'YYYY-MM-DD' 형식의 유효한 날짜인지 확인합니다.
                  형식이 잘못된 경우 DB에 잘못된 날짜가 저장되는 것을 미리 방지합니다.

    [start_time]
      .notEmpty() : 시작 시각이 비어있지 않은지 확인합니다.
                    시작 시각이 없으면 세션 기록 자체가 의미 없으므로 필수 값으로 검증합니다.
*/
router.post('/',
  [
    // ── 세션 날짜 검증 ────────────────────────────
    body('imm_date')
      .isDate()
      .withMessage('올바른 날짜 형식이 아닙니다.'),

    // ── 시작 시각 필수 입력 확인 ──────────────────
    body('start_time')
      .notEmpty()
      .withMessage('시작 시간이 필요합니다.'),
  ],
  validate,       // 검증 오류 일괄 처리 → 오류 있으면 422 반환
  startSession,   // 검증 통과 시 세션 시작 컨트롤러 실행
);

/*
  PATCH /api/immersions/:imm_idx/end
  진행 중인 집중 세션을 종료합니다.
  종료 시각, 집중 점수, 최고 연속 집중 횟수를 받아 세션 결과를 저장하고 포인트를 지급합니다.
  :imm_idx는 종료할 세션의 고유 ID입니다.

  ▼ 검증 규칙 ▼
    [end_time]
      .notEmpty() : 종료 시각이 비어있지 않은지 확인합니다.
                    종료 시각이 없으면 집중 시간 계산이 불가능하므로 필수 값으로 검증합니다.

    [imm_score]
      .isInt({ min: 0, max: 100 }) : 집중 점수가 0 이상 100 이하의 정수인지 확인합니다.
                                     범위를 벗어난 점수는 통계 집계에 오류를 일으킬 수 있습니다.
*/
router.patch('/:imm_idx/end',
  [
    // ── 종료 시각 필수 입력 확인 ──────────────────
    body('end_time')
      .notEmpty()
      .withMessage('종료 시간이 필요합니다.'),

    // ── 집중 점수 범위 검증 (0 ~ 100 정수) ────────
    body('imm_score')
      .isInt({ min: 0, max: 100 })
      .withMessage('집중 점수는 0~100 사이여야 합니다.'),
  ],
  validate,      // 검증 오류 일괄 처리 → 오류 있으면 422 반환
  endSession,    // 검증 통과 시 세션 종료 컨트롤러 실행
);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 라우터를 app.js 또는 index.js에서 불러와 마운트할 수 있게 합니다.
                   (예: app.use('/api/immersions', require('./routes/immersion.routes')))
*/
module.exports = router;
