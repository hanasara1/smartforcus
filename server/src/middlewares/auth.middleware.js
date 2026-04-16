// ─────────────────────────────────────────────────────────
// server/src/middlewares/auth.middleware.js — JWT 인증 미들웨어
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  jsonwebtoken : JWT(JSON Web Token)를 생성하고 검증하는 라이브러리입니다.
                 이 미들웨어에서는 클라이언트가 보낸 토큰의 유효성을 검증하는 데 사용합니다.
*/
const jwt = require('jsonwebtoken');

// secret : JWT 서명 및 검증에 사용하는 비밀 키 (토큰 위변조 방지용)
const { secret } = require('../config/jwt.config');


// ────────────────────────────────────────────────
// 🔐 JWT 인증 미들웨어
// ────────────────────────────────────────────────

/*
  authenticate

  [역할]
  클라이언트가 요청 헤더에 담아 보낸 JWT 토큰을 검증합니다.
  토큰이 유효하면 디코딩된 유저 정보를 req.user에 주입하여
  이후 컨트롤러에서 로그인한 유저 정보를 바로 사용할 수 있게 합니다.

  ▼ 미들웨어(Middleware)란? ▼
    Express에서 요청(req)이 컨트롤러에 도달하기 전에 먼저 실행되는 함수입니다.
    next()를 호출하면 다음 미들웨어 또는 컨트롤러로 흐름이 넘어가고,
    next()를 호출하지 않으면 해당 요청은 여기서 종료됩니다.

  ▼ Bearer 토큰 방식이란? ▼
    클라이언트는 HTTP 요청 헤더에 아래 형식으로 토큰을 담아 보냅니다.
      Authorization: Bearer eyJhbGci...
    'Bearer ' 접두어를 잘라내면 순수한 JWT 문자열만 남습니다.

  ▼ jwt.verify() 동작 방식 ▼
    토큰을 secret 키로 서명 검증하고 디코딩하여 페이로드를 반환합니다.
    아래 두 가지 오류를 구분하여 처리합니다.
      - TokenExpiredError : 토큰 유효 기간이 만료된 경우
      - JsonWebTokenError : 토큰 형식이 잘못되었거나 서명이 위변조된 경우

  [처리 순서]
    1. Authorization 헤더가 없거나 'Bearer '로 시작하지 않으면 401을 반환합니다.
    2. 'Bearer ' 뒤의 토큰 문자열을 추출합니다.
    3. jwt.verify()로 토큰의 유효성을 검증합니다.
    4. 검증 성공 시 디코딩된 페이로드를 req.user에 주입하고 next()를 호출합니다.
    5. 검증 실패 시 오류 종류에 따라 적절한 메시지와 함께 401을 반환합니다.

  @param req.headers.authorization - 'Bearer {토큰}' 형식의 인증 헤더
  @sets  req.user - 디코딩된 JWT 페이로드 { user_idx, email, nick, iat, exp }
  @returns 401 : 토큰 없음 / 만료 / 위변조
*/
const authenticate = (req, res, next) => {

  // ── Authorization 헤더 추출 및 형식 검증 ────────────
  const authHeader = req.headers['authorization'];

  /*
    Authorization 헤더가 아예 없거나 'Bearer '로 시작하지 않으면
    인증 토큰이 없는 요청으로 판단하여 401을 반환합니다.
    !authHeader               : 헤더 자체가 없는 경우
    !authHeader.startsWith('Bearer ') : 헤더가 있지만 형식이 다른 경우 (예: 'Basic ...')
  */
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '인증 토큰이 없습니다.' });
  }

  // 'Bearer {토큰}' 에서 공백 기준으로 나눠 인덱스 1 (토큰 부분)만 꺼냅니다
  const token = authHeader.split(' ')[1];

  // ── 토큰 검증 ────────────────────────────────────────
  try {
    /*
      jwt.verify(token, secret) :
        토큰의 서명을 secret 키로 검증하고 성공 시 디코딩된 페이로드를 반환합니다.
        페이로드 구조: { user_idx, email, nick, iat(발급시각), exp(만료시각) }
    */
    const decoded = jwt.verify(token, secret);

    // 디코딩된 유저 정보를 req.user에 주입하여 이후 컨트롤러에서 사용할 수 있게 합니다
    req.user = decoded;   // { user_idx, email, nick, iat, exp }

    next();  // 검증 성공 → 다음 미들웨어 또는 컨트롤러로 흐름 전달

  } catch (err) {
    /*
      토큰 검증 실패 시 오류 종류에 따라 다른 메시지를 반환합니다.
        TokenExpiredError : 토큰 만료 → 재로그인 안내
        그 외 오류         : 토큰 위변조 또는 형식 오류 → 유효하지 않은 토큰 안내
    */
    const message =
      err.name === 'TokenExpiredError'
        ? '토큰이 만료되었습니다. 다시 로그인해 주세요.'
        : '유효하지 않은 토큰입니다.';

    return res.status(401).json({ success: false, message });
  }
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - authenticate : 인증이 필요한 라우터에 미들웨어로 등록
                     (예: router.get('/me', authenticate, getMe))
*/
module.exports = { authenticate };
