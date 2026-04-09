// server/src/services/point.service.js
const { getPool } = require('../config/db.config');

/**
 * ✅ 포인트 지급 공통 함수
 * @param {object} pool - DB 커넥션 풀
 * @param {number} user_idx - 유저 ID
 * @param {string} reward_type - 포인트 타입
 * @param {number} reward_point - 포인트 점수
 */

// ✅ 포인트 지급 기준 한 곳에서 관리
const POINT_RULES = {
  WELCOME:          30,   // 회원가입
  DAILY_LOGIN:      10,   // 일일 출석
  STREAK_7:         50,   // 7일 연속
  STREAK_30:        300,  // 30일 연속
  SESSION_COMPLETE: 10,   // 세션 완료
  BEST_RECORD:      10,   // 최고 기록 갱신
};

const givePoint = async (pool, user_idx, reward_type, reward_point) => {
  await pool.query(
    `INSERT INTO points (user_idx, reward_type, reward_point, earned_at)
     VALUES (?, ?, ?, NOW())`,
    [user_idx, reward_type, reward_point]
  );
};

/**
 * ✅ 출석 체크 포인트 처리
 * - 매일 자정 이후 첫 접속 시 +10P
 * - 7일 연속 접속 시 +50P 추가
 * - 30일 연속 접속 시 +300P 추가
 */
const processDailyLogin = async (user_idx) => {
  const pool = getPool();

  // 현재 유저 정보 조회
  const [[user]] = await pool.query(
    `SELECT last_login_date, login_streak FROM users WHERE user_idx = ?`,
    [user_idx]
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0); // 자정 기준

  const lastLogin = user.last_login_date ? new Date(user.last_login_date) : null;
  if (lastLogin) lastLogin.setHours(0, 0, 0, 0);

  // ✅ 오늘 이미 출석 체크 했으면 패스
  if (lastLogin && lastLogin.getTime() === today.getTime()) {
    return { checked: false, message: '오늘 이미 출석 체크 완료' };
  }

  // ✅ 연속 출석 계산
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newStreak;
  if (lastLogin && lastLogin.getTime() === yesterday.getTime()) {
    // 어제 접속했으면 연속 +1
    newStreak = user.login_streak + 1;
  } else {
    // 연속 끊김 → 1로 초기화
    newStreak = 1;
  }

  // ✅ users 테이블 갱신
  await pool.query(
    `UPDATE users SET last_login_date = CURDATE(), login_streak = ? WHERE user_idx = ?`,
    [newStreak, user_idx]
  );

  const earnedPoints = [];

  // 기본 출석 +10P
  await givePoint(pool, user_idx, 'daily_login', POINT_RULES.DAILY_LOGIN);
  earnedPoints.push({ type: 'daily_login', point: POINT_RULES.DAILY_LOGIN });

  // 7일 연속 보너스 +50P
  if (newStreak % 7 === 0) {
    await givePoint(pool, user_idx, 'streak_7', POINT_RULES.STREAK_7);
    earnedPoints.push({ type: 'streak_7', point: POINT_RULES.STREAK_7 });
  }

  // 30일 연속 보너스 +300P
  if (newStreak % 30 === 0) {
    await givePoint(pool, user_idx, 'streak_30', POINT_RULES.STREAK_30);
    earnedPoints.push({ type: 'streak_30', point: POINT_RULES.STREAK_30 });
  }

  return {
    checked: true,
    streak: newStreak,
    earnedPoints,
    message: `출석 체크 완료! (${newStreak}일 연속)`,
  };
};

/**
 * ✅ 집중 세션 종료 포인트 처리
 * - 세션 종료 시 +10P
 * - 본인 최고 기록(imm_score) 갱신 시 +10P 추가
 */
const processSessionComplete = async (user_idx, imm_idx) => {
  const pool = getPool();

  // ✅ 이미 포인트 지급된 세션인지 먼저 확인
  const [[alreadyGiven]] = await pool.query(
    `SELECT point_idx FROM points
     WHERE user_idx = ? AND reward_type = ?`,
    [user_idx, `session_complete:${imm_idx}`]
  );

  if (alreadyGiven) {
    return {
      earnedPoints: [],
      isNewRecord: false,
      message: '이미 포인트가 지급된 세션입니다.',
    };
  }

  // 기존 로직 동일하게 진행...
  const [[currentSession]] = await pool.query(
    `SELECT imm_score FROM immersions WHERE imm_idx = ?`,
    [imm_idx]
  );
  const [[bestRecord]] = await pool.query(
    `SELECT COALESCE(MAX(imm_score), 0) AS best_score
     FROM immersions
     WHERE user_idx = ? AND imm_idx != ?`,
    [user_idx, imm_idx]
  );

  const earnedPoints = [];

  await givePoint(pool, user_idx, `session_complete:${imm_idx}`, POINT_RULES.SESSION_COMPLETE);
  earnedPoints.push({ type: 'session_complete', point: POINT_RULES.SESSION_COMPLETE });

  if (currentSession.imm_score > bestRecord.best_score) {
    await givePoint(pool, user_idx, `best_record:${imm_idx}`, POINT_RULES.BEST_RECORD);
    earnedPoints.push({ type: 'best_record', point: POINT_RULES.BEST_RECORD });
  }

  return {
    earnedPoints,
    isNewRecord: currentSession.imm_score > bestRecord.best_score,
    message: '세션 완료 포인트 지급 완료',
  };
};

module.exports = { processDailyLogin, processSessionComplete, givePoint };
