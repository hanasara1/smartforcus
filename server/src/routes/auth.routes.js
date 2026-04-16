// ─────────────────────────────────────────────────────────
// server/src/routes/auth.routes.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  Router : Express의 미니 애플리케이션으로, 라우트(경로)를 모듈 단위로 분리하여 관리합니다.
           app.js에서 router를 불러와 특정 경로에 마운트하면
           이 파일에서 정의한 모든 라우트가 해당 경로 아래에 등록됩니다.
           (예: app.use('/api/auth', authRouter) → /api/auth/register, /api/auth/login)
*/
const { Router } = require('express');

/*
  body : express-validator의 검증 체인 생성 함수입니다.
         body('필드명')으로 시작하여 .isEmail(), .isLength() 등의 규칙을 체인으로 연결하고,
         .withMessage()로 각 규칙에 실패했을 때 반환할 메시지를 지정합니다.
*/
const { body } = require('express-validator');

// register, login : 실제 비즈니스 로직을 처리하는 컨트롤러 함수들
const { register, login } = require('../controllers/auth.controller');

// validate : express-validator 검증 결과를 수집하여 오류가 있으면 422를 반환하는 미들웨어
const { validate } = require('../middlewares/validate.middleware');

// Router 인스턴스를 생성합니다. 이 객체에 라우트를 등록한 뒤 외부로 내보냅니다
const router = Router();


// ────────────────────────────────────────────────
// 📝 회원가입 라우트
// ────────────────────────────────────────────────

/*
  POST /api/auth/register

  [처리 흐름]
    검증 규칙 배열 → validate 미들웨어 → register 컨트롤러

  ▼ 라우트 미들웨어 실행 순서 ▼
    ① 검증 규칙 배열 내 체인들이 순서대로 실행되어 오류를 req 객체에 누적합니다.
    ② validate 미들웨어가 누적된 오류를 수집하여 하나라도 있으면 422를 반환합니다.
    ③ 모든 검증을 통과하면 register 컨트롤러가 실행됩니다.

  ▼ 각 검증 규칙 설명 ▼

    [email]
      .isEmail() : '@'와 도메인을 포함한 올바른 이메일 형식인지 확인합니다.

    [pwd]
      .isLength({ min: 8 }) : 비밀번호가 최소 8자 이상인지 확인합니다.
      .matches(/^(?=.*[A-Za-z])(?=.*\d)/) : 정규식으로 영문자와 숫자가 모두 포함됐는지 확인합니다.
        (?=.*[A-Za-z]) : 영문자가 하나 이상 포함 여부 (전방 탐색)
        (?=.*\d)        : 숫자가 하나 이상 포함 여부 (전방 탐색)

    [nick]
      .notEmpty()               : 빈 문자열이 아닌지 확인합니다.
      .isLength({ min: 2, max: 12 }) : 닉네임 길이가 2자 이상 12자 이하인지 확인합니다.
      .matches(/^[가-힣a-zA-Z0-9]+$/) : 한글, 영문, 숫자만 허용합니다.
        [가-힣]  : 한글 완성형 문자
        [a-zA-Z] : 영문 대소문자
        [0-9]    : 숫자
        +        : 위 문자들이 1개 이상 있어야 합니다 (공백, 특수문자 불가)
*/
router.post(
  '/register',
  [
    // ── 이메일 검증 ──────────────────────────────
    body('email')
      .isEmail()
      .withMessage('유효한 이메일 형식이 아닙니다.'),

    // ── 비밀번호 검증 (길이 + 영문·숫자 포함) ────
    body('pwd')
      .isLength({ min: 8 })
      .withMessage('비밀번호는 최소 8자 이상이어야 합니다.')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
      .withMessage('비밀번호는 영문자와 숫자를 포함해야 합니다.'),

    // ── 닉네임 검증 (필수 + 길이 + 허용 문자) ────
    body('nick')
      .notEmpty().withMessage('닉네임은 필수입니다.')
      .isLength({ min: 2, max: 12 }).withMessage('닉네임은 2~12자 이내여야 합니다.')
      .matches(/^[가-힣a-zA-Z0-9]+$/).withMessage('닉네임은 한글, 영문, 숫자만 사용 가능합니다.'),
  ],
  validate,    // 검증 오류 일괄 처리 → 오류 있으면 422 반환
  register,    // 검증 통과 시 회원가입 컨트롤러 실행
);


// ────────────────────────────────────────────────
// 🔐 로그인 라우트
// ────────────────────────────────────────────────

/*
  POST /api/auth/login

  [처리 흐름]
    검증 규칙 배열 → validate 미들웨어 → login 컨트롤러

  ▼ 각 검증 규칙 설명 ▼

    [email]
      .isEmail() : 올바른 이메일 형식인지 확인합니다.
                   형식 오류 시 DB 조회 전에 미리 차단합니다.

    [pwd]
      .notEmpty() : 비밀번호 필드가 비어있지 않은지 확인합니다.
                    로그인 시에는 비밀번호 형식(길이, 패턴)을 검증하지 않습니다.
                    DB에 저장된 해시와 비교하는 것은 컨트롤러의 역할이기 때문입니다.
*/
router.post(
  '/login',
  [
    // ── 이메일 검증 ──────────────────────────────
    body('email')
      .isEmail()
      .withMessage('유효한 이메일 형식이 아닙니다.'),

    // ── 비밀번호 필수 입력 확인 (형식 검증 없음) ─
    body('pwd')
      .notEmpty()
      .withMessage('비밀번호를 입력해 주세요.'),
  ],
  validate,   // 검증 오류 일괄 처리 → 오류 있으면 422 반환
  login,      // 검증 통과 시 로그인 컨트롤러 실행
);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 라우터를 app.js 또는 index.js에서 불러와 마운트할 수 있게 합니다.
                   (예: app.use('/api/auth', require('./routes/auth.routes')))
*/
module.exports = router;
