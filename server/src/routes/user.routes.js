// ─────────────────────────────────────────────────────────
// server/src/routes/user.routes.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  Router : Express의 미니 애플리케이션으로, 라우트(경로)를 모듈 단위로 분리하여 관리합니다.
           app.js에서 이 라우터를 특정 경로에 마운트하면
           아래에 정의된 모든 라우트가 해당 경로 아래에 등록됩니다.
           (예: app.use('/api/users', userRouter))
*/
const { Router } = require('express');

/*
  body : express-validator의 요청 바디 검증 체인 생성 함수입니다.
         body('필드명')으로 시작하여 .optional(), .isLength() 등의 규칙을 체인으로 연결하고,
         .withMessage()로 각 규칙 실패 시 반환할 메시지를 지정합니다.
*/
const { body } = require('express-validator');

// authenticate : Authorization 헤더의 JWT 토큰을 검증하고 req.user를 주입하는 인증 미들웨어
const { authenticate } = require('../middlewares/auth.middleware');

// validate : express-validator 검증 결과를 수집하여 오류가 있으면 422를 반환하는 미들웨어
const { validate } = require('../middlewares/validate.middleware');

// 유저 관련 비즈니스 로직을 처리하는 컨트롤러 함수들
const {
  getMe,           // 내 기본 정보 + 보유 포인트 조회
  updateMe,        // 닉네임 또는 비밀번호 수정
  getMyStats,      // 마이페이지 종합 통계 조회
  getMyPoseStats,  // 취약 자세 Top 3 조회
  getRanking,      // 캐시 기반 전체 랭킹 조회
  getMyStreak,     // 출석 스트릭 통계 조회
} = require('../controllers/user.controller');

// Router 인스턴스를 생성합니다. 이 객체에 라우트를 등록한 뒤 외부로 내보냅니다
const router = Router();


// ────────────────────────────────────────────────
// 🔐 인증 미들웨어 전역 등록
// ────────────────────────────────────────────────

/*
  router.use(authenticate) :
    이 라우터에 등록된 모든 라우트에 authenticate 미들웨어를 일괄 적용합니다.
    유저 관련 API는 전부 로그인한 유저만 접근할 수 있으므로 전역으로 등록합니다.

    실행 흐름 (모든 라우트 공통):
      요청 → authenticate (토큰 검증 + req.user 주입) → 검증 규칙 → validate → 컨트롤러
*/
router.use(authenticate);


// ────────────────────────────────────────────────
// 👤 유저 라우트 등록
// ────────────────────────────────────────────────

/*
  GET /api/users/me
  현재 로그인한 유저의 기본 정보(이메일, 닉네임, 가입일)와
  보유 포인트 잔액 합계(total_points)를 함께 반환합니다.
*/
router.get('/me', getMe);

/*
  GET /api/users/me/stats
  현재 로그인한 유저의 마이페이지 종합 통계를 반환합니다.
  전체 세션 수, 총 집중 시간, 평균 점수, 보유 포인트, 최근 7일 일별 기록을 포함합니다.

  ⚠️ 주의 : '/me' 보다 아래에, 다른 정적 경로들보다 위에 등록합니다.
             '/me/stats'가 '/me' 아래에 있어야 '/me'가 먼저 매칭되는 것을 방지합니다.
             Express는 라우트를 등록 순서대로 매칭하므로 정적 경로를 동적 경로보다 먼저 등록합니다.
*/
router.get('/me/stats', getMyStats);

/*
  GET /api/users/me/pose-stats
  현재 로그인한 유저의 전체 세션에서 가장 많이 발생한 불량 자세 유형 상위 3개를 반환합니다.
  클라이언트의 취약 자세 분석 UI에 사용됩니다.
*/
router.get('/me/pose-stats', getMyPoseStats);

/*
  GET /api/users/ranking
  메모리 캐시에서 전체 유저 랭킹을 조회합니다.
  TOP 10 목록과 현재 유저의 순위 정보를 함께 반환합니다.
  캐시가 준비되지 않은 경우 503을 반환합니다.
*/
router.get('/ranking', getRanking);

/*
  GET /api/users/me/streak
  현재 로그인한 유저의 출석 스트릭 관련 통계를 반환합니다.
  현재 연속 출석일, 최장 연속 출석일, 이번 달 출석 횟수, 전체 출석 횟수,
  최근 12주 출석 날짜 목록을 포함합니다.
*/
router.get('/me/streak', getMyStreak);

/*
  PUT /api/users/me
  현재 로그인한 유저의 닉네임 또는 비밀번호를 수정합니다.
  요청 바디에 포함된 필드 조합에 따라 닉네임만, 비밀번호만, 또는 둘 다 변경합니다.

  [처리 흐름]
    검증 규칙 배열 → validate 미들웨어 → updateMe 컨트롤러

  ▼ 각 검증 규칙 설명 ▼

    [nick]
      .optional() : 요청 바디에 nick 필드가 없으면 이 검증 규칙 전체를 건너뜁니다.
                    닉네임 변경은 선택 사항이므로 필수값으로 강제하지 않습니다.
      .notEmpty() : optional이지만 값이 있다면 빈 문자열('')은 허용하지 않습니다.
      .isLength({ min: 2, max: 12 }) : 닉네임 길이가 2자 이상 12자 이하인지 확인합니다.
      .matches(/^[가-힣a-zA-Z0-9]+$/) : 한글, 영문, 숫자만 허용합니다.
                                         공백, 특수문자는 사용할 수 없습니다.

    [newPwd]
      .optional() : 요청 바디에 newPwd 필드가 없으면 이 검증 규칙을 건너뜁니다.
                    비밀번호 변경도 선택 사항이므로 필수값으로 강제하지 않습니다.
      .isLength({ min: 8 }) : 새 비밀번호가 최소 8자 이상인지 확인합니다.
                               현재 비밀번호 검증(currentPwd 일치 여부)은 컨트롤러에서 수행합니다.
*/
router.put('/me',
  [
    // ── 닉네임 검증 (선택 + 길이 + 허용 문자) ────
    body('nick')
      .optional()
      .notEmpty()
      .withMessage('닉네임을 입력해주세요.')
      .isLength({ min: 2, max: 12 })
      .withMessage('닉네임은 2~12자 이내여야 합니다.')
      .matches(/^[가-힣a-zA-Z0-9]+$/)
      .withMessage('닉네임은 한글, 영문, 숫자만 사용 가능합니다.'),

    // ── 새 비밀번호 검증 (선택 + 최소 길이) ──────
    body('newPwd')
      .optional()
      .isLength({ min: 8 })
      .withMessage('새 비밀번호는 8자 이상이어야 합니다.'),
  ],
  validate,   // 검증 오류 일괄 처리 → 오류 있으면 422 반환
  updateMe,   // 검증 통과 시 회원 정보 수정 컨트롤러 실행
);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 라우터를 app.js 또는 index.js에서 불러와 마운트할 수 있게 합니다.
                   (예: app.use('/api/users', require('./routes/user.routes')))
*/
module.exports = router;
