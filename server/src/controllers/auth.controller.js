// server/src/controllers/auth.controller.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  bcryptjs : 비밀번호를 안전하게 암호화(해싱)하고 비교하는 라이브러리입니다.
             해싱이란? 원본 문자열을 되돌릴 수 없는 고정 길이의 문자열로 변환하는 것입니다.
             DB에 비밀번호를 평문으로 저장하면 유출 시 위험하므로 반드시 해싱하여 저장합니다.
*/
const bcrypt = require('bcryptjs');

/*
  jsonwebtoken : JWT(JSON Web Token)를 생성하고 검증하는 라이브러리입니다.
                 JWT란? 로그인 성공 시 서버가 발급하는 '디지털 신분증'과 같습니다.
                 클라이언트는 이후 요청마다 이 토큰을 함께 보내 본인임을 증명합니다.
*/
const jwt = require('jsonwebtoken');

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');

// secret : JWT 서명에 사용하는 비밀 키 / expiresIn : 토큰 만료 시간
const { secret, expiresIn } = require('../config/jwt.config');

// processDailyLogin : 로그인 시 출석 체크 및 포인트 지급을 처리하는 서비스 함수
const { processDailyLogin } = require('../services/point.service');


// ────────────────────────────────────────────────
// 📝 회원가입 컨트롤러
// ────────────────────────────────────────────────

/*
  POST /api/auth/register

  [역할]
  클라이언트가 보낸 이메일, 비밀번호, 닉네임으로 새 계정을 생성합니다.

  [처리 순서]
    1. 이메일 · 닉네임 중복 여부를 DB에서 확인합니다.
    2. 비밀번호를 bcrypt로 해싱(암호화)하여 DB에 저장합니다.
    3. 가입 완료 후 웰컴 포인트 30P를 자동 지급합니다.
    4. 생성된 user_idx를 포함한 성공 응답을 반환합니다.

  @param {object} req.body - { email, pwd, nick }
  @returns 201 : 회원가입 성공 / 409 : 이메일 또는 닉네임 중복
*/
const register = async (req, res, next) => {
  try {
    console.log('회원 가입 코드 실행()');

    // 요청 바디에서 이메일, 비밀번호, 닉네임을 꺼냅니다
    const { email, pwd, nick } = req.body;
    const pool = getPool();

    console.log(`이메일:${email}, PW:${pwd}, nick:${nick}`);

    // ── 이메일 · 닉네임 중복 확인 ───────────────────────
    /*
      OR 조건으로 이메일과 닉네임 중 하나라도 같은 유저가 있으면 배열에 담깁니다.
      결과가 1건 이상이면 어떤 필드가 중복인지 특정하여 오류 메시지를 반환합니다.
    */
    const [dup] = await pool.query(
      'SELECT user_idx, email FROM users WHERE email = ? OR nick = ?',
      [email, nick]
    );
    if (dup.length > 0) {
      // DB에서 찾은 레코드의 이메일이 요청 이메일과 같으면 '이메일' 중복, 아니면 '닉네임' 중복
      const field = dup[0].email === email ? '이메일' : '닉네임';
      return res.status(409).json({ success: false, message: `이미 사용 중인 ${field}입니다.` });
    }

    // ── 비밀번호 해싱 및 회원 등록 ──────────────────────
    /*
      bcrypt.hash(비밀번호, saltRounds) :
        saltRounds(12)는 해싱 강도를 나타냅니다.
        숫자가 높을수록 보안이 강해지지만 처리 시간이 늘어납니다. (12가 일반적인 권장값)
    */
    const hashed = await bcrypt.hash(pwd, 12);
    const [result] = await pool.query(
      'INSERT INTO users (email, pwd, nick) VALUES (?, ?, ?)',
      [email, hashed, nick]     // 반드시 해싱된 비밀번호를 저장합니다 (평문 저장 금지)
    );

    // ── 웰컴 포인트 지급 ────────────────────────────────
    /*
      가입 축하 포인트 30P를 points 테이블에 INSERT합니다.
      result.insertId : 방금 생성된 유저의 자동 증가 기본키(user_idx)입니다.
    */
    await pool.query(
      `INSERT INTO points (user_idx, reward_type, reward_point) VALUES (?, 'welcome', 30)`,
      [result.insertId]
    );

    // ── 성공 응답 ────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다. (웰컴 포인트 30P 지급!)',
      data: { user_idx: result.insertId },  // 생성된 유저의 고유 ID를 함께 전달
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 🔐 로그인 컨트롤러
// ────────────────────────────────────────────────

/*
  POST /api/auth/login

  [역할]
  이메일과 비밀번호를 검증한 뒤 JWT 토큰을 발급합니다.
  로그인 성공 시 출석 체크를 수행하고 포인트 지급 결과도 함께 응답합니다.

  [처리 순서]
    1. 이메일로 DB에서 유저를 조회합니다.
    2. bcrypt로 입력 비밀번호와 해시를 비교합니다.
    3. 인증 성공 시 JWT 토큰을 생성하여 발급합니다.
    4. 오늘의 출석 체크가 되지 않은 경우 포인트를 지급합니다.
    5. 토큰, 유저 정보, 출석 결과를 묶어 응답합니다.

  @param {object} req.body - { email, pwd }
  @returns 200 : 로그인 성공 + 토큰 / 401 : 인증 실패
*/
const login = async (req, res, next) => {
  try {
    console.log('로그인() 호출');

    // 요청 바디에서 이메일과 비밀번호를 꺼냅니다
    const { email, pwd } = req.body;
    const pool = getPool();

    console.log(`이메일:${email}, PW:${pwd}`);

    // ── 유저 조회 ────────────────────────────────────────
    /*
      [[user]] : 구조 분해를 두 번 중첩하여 사용합니다.
        - pool.query()는 [rows, fields] 형태를 반환합니다.
        - rows는 배열이므로, 첫 번째 요소만 바로 꺼내기 위해 [[user]]로 한번 더 분해합니다.
      결과가 없으면 user는 undefined가 됩니다.
    */
    const [[user]] = await pool.query(
      'SELECT user_idx, email, pwd, nick FROM users WHERE email = ?',
      [email]
    );
    console.log('✅ DB에서 찾은 유저:', user);

    // 해당 이메일을 가진 유저가 없으면 401 반환 (보안상 이메일·비밀번호 오류를 구분하지 않음)
    if (!user) return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    // ── 비밀번호 검증 ────────────────────────────────────
    /*
      bcrypt.compare(입력값, 해시값) :
        입력된 평문 비밀번호를 내부적으로 해싱하여 DB의 해시와 비교합니다.
        일치하면 true, 아니면 false를 반환합니다.
    */
    const isMatch = await bcrypt.compare(pwd, user.pwd);
    console.log('✅ 비밀번호 일치 여부:', isMatch);

    // 비밀번호가 틀리면 401 반환
    if (!isMatch) return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    // ── JWT 토큰 발급 ────────────────────────────────────
    /*
      payload : 토큰 안에 담을 유저 식별 정보입니다.
                민감한 정보(비밀번호 등)는 절대 포함하지 않습니다.

      jwt.sign(payload, 비밀키, 옵션) :
        서버의 비밀 키로 서명한 토큰을 생성합니다.
        expiresIn 시간이 지나면 토큰은 자동으로 만료됩니다.
    */
    const payload = { user_idx: user.user_idx, email: user.email, nick: user.nick };
    const token = jwt.sign(payload, secret, { expiresIn });

    // ── 출석 체크 및 포인트 처리 ─────────────────────────
    /*
      processDailyLogin(user_idx) :
        오늘 이미 출석했으면 checked: false를 반환합니다.
        처음 출석이면 연속 일수(streak)와 지급된 포인트 목록(earnedPoints)을 반환합니다.
    */
    const dailyResult = await processDailyLogin(user.user_idx);

    if (dailyResult.checked) {
      console.log(`✅ 출석 체크 - ${user.nick} (${dailyResult.streak}일 연속)`);
      console.log(`✅ 지급 포인트 - ${dailyResult.earnedPoints.map(p => `${p.type} +${p.point}P`).join(', ')}`);
    }

    // ── 최종 응답 ────────────────────────────────────────
    /*
      출석 체크 여부(daily_checked)에 따라 메시지를 다르게 구성하고,
      클라이언트에서 출석 결과를 UI에 바로 반영할 수 있도록 상세 정보를 함께 전달합니다.

      ?? 연산자 : 좌측 값이 null 또는 undefined일 때만 우측 기본값을 사용합니다.
    */
    return res.json({
      success: true,
      message: dailyResult.checked
        ? `로그인 성공! 출석 포인트 지급 (${dailyResult.streak}일 연속 🔥)`
        : '로그인 성공',
      data: {
        token,                                       // 인증에 사용할 JWT 토큰
        user: payload,                               // 유저 기본 정보
        daily_checked  : dailyResult.checked,        // 오늘 출석 여부
        daily_streak   : dailyResult.streak ?? 0,    // 연속 출석 일수 (없으면 0)
        earned_points  : dailyResult.earnedPoints ?? [], // 이번 로그인으로 받은 포인트 목록
      },
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - register : 회원가입 라우터에 연결
    - login    : 로그인 라우터에 연결
*/
module.exports = { register, login };
