// server/src/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../config/db.config');
const { secret, expiresIn } = require('../config/jwt.config');
const { processDailyLogin } = require('../services/point.service');

/** POST /api/auth/register */
const register = async (req, res, next) => {
  try {
    console.log('회원 가입 코드 실행()');
    const { email, pwd, nick } = req.body;
    const pool = getPool();

    console.log(`이메일:${email}, PW:${pwd}, nick:${nick}`);

    // ✅ 이메일 or 닉네임 중복 확인
    const [dup] = await pool.query(
      'SELECT user_idx, email FROM users WHERE email = ? OR nick = ?',
      [email, nick]
    );
    if (dup.length > 0) {
      const field = dup[0].email === email ? '이메일' : '닉네임';
      return res.status(409).json({ success: false, message: `이미 사용 중인 ${field}입니다.` });
    }

    // ✅ 비밀번호 해싱 후 회원 등록
    const hashed = await bcrypt.hash(pwd, 12);
    const [result] = await pool.query(
      'INSERT INTO users (email, pwd, nick) VALUES (?, ?, ?)',
      [email, hashed, nick]
    );

    // ✅ 가입 축하 웰컴 포인트 +30P
    await pool.query(
      `INSERT INTO points (user_idx, reward_type, reward_point) VALUES (?, 'welcome', 30)`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다. (웰컴 포인트 30P 지급!)',
      data: { user_idx: result.insertId },
    });
  } catch (err) { next(err); }
};

/** POST /api/auth/login */
const login = async (req, res, next) => {
  try {
    console.log('로그인() 호출');
    const { email, pwd } = req.body;
    const pool = getPool();

    console.log(`이메일:${email}, PW:${pwd}`);

    // ✅ 유저 조회
    const [[user]] = await pool.query(
      'SELECT user_idx, email, pwd, nick FROM users WHERE email = ?',
      [email]
    );
    console.log('✅ DB에서 찾은 유저:', user);

    if (!user) return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    // ✅ 비밀번호 확인
    const isMatch = await bcrypt.compare(pwd, user.pwd);
    console.log('✅ 비밀번호 일치 여부:', isMatch);

    if (!isMatch) return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    // ✅ JWT 토큰 발급
    const payload = { user_idx: user.user_idx, email: user.email, nick: user.nick };
    const token = jwt.sign(payload, secret, { expiresIn });

    // ✅ 출석 체크 포인트 처리
    const dailyResult = await processDailyLogin(user.user_idx);

    if (dailyResult.checked) {
      console.log(`✅ 출석 체크 - ${user.nick} (${dailyResult.streak}일 연속)`);
      console.log(`✅ 지급 포인트 - ${dailyResult.earnedPoints.map(p => `${p.type} +${p.point}P`).join(', ')}`);
    }

    // ✅ 응답 - 출석 체크 결과도 함께 전달
    return res.json({
      success: true,
      message: dailyResult.checked
        ? `로그인 성공! 출석 포인트 지급 (${dailyResult.streak}일 연속 🔥)`
        : '로그인 성공',
      data: {
        token,
        user: payload,
        daily_checked: dailyResult.checked,
        daily_streak: dailyResult.streak ?? 0,
        earned_points: dailyResult.earnedPoints ?? [],
      },
    });
  } catch (err) { next(err); }
};

module.exports = { register, login };
