// ─────────────────────────────────────────────────────────
// server/src/services/point.service.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');


// ────────────────────────────────────────────────
// 📋 포인트 지급 기준 상수 정의
// ────────────────────────────────────────────────

/*
  POINT_RULES :
    포인트 지급 금액을 한 곳에서 관리하는 상수 객체입니다.
    포인트 값을 변경해야 할 때 이 객체만 수정하면 되므로 유지보수가 편리합니다.
    각 서비스 함수에서 직접 숫자를 하드코딩하지 않고 이 상수를 참조합니다.

  ▼ 지급 항목별 설명 ▼
    WELCOME          : 회원가입 시 웰컴 포인트 (auth.controller에서 직접 지급)
    DAILY_LOGIN      : 매일 첫 번째 로그인 시 출석 포인트
    STREAK_7         : 7일 연속 출석 달성 시 보너스 포인트 (7의 배수마다 지급)
    STREAK_30        : 30일 연속 출석 달성 시 보너스 포인트 (30의 배수마다 지급)
    SESSION_COMPLETE : 집중 세션 정상 종료 시 기본 포인트
    BEST_RECORD      : 이전 최고 집중 점수를 갱신했을 때 추가 보너스 포인트
*/
const POINT_RULES = {
  WELCOME          : 30,   // 회원가입
  DAILY_LOGIN      : 10,   // 일일 출석
  STREAK_7         : 50,   // 7일 연속 출석 보너스
  STREAK_30        : 300,  // 30일 연속 출석 보너스
  SESSION_COMPLETE : 10,   // 세션 완료
  BEST_RECORD      : 10,   // 최고 기록 갱신
};


// ────────────────────────────────────────────────
// 💰 포인트 지급 공통 함수
// ────────────────────────────────────────────────

/*
  givePoint(pool, user_idx, reward_type, reward_point)

  [역할]
  points 테이블에 포인트 지급 내역을 INSERT하는 공통 함수입니다.
  모든 포인트 지급은 직접 잔액을 수정하지 않고 새 행을 추가하는 방식으로 처리합니다.
  이렇게 하면 모든 지급·차감 내역이 기록으로 남아 추적과 합산이 가능합니다.

  ▼ 포인트 내역 기록 방식 ▼
    충전·지급 : 양수(+) 값으로 INSERT
    차감      : 음수(-) 값으로 INSERT
    잔액 조회 : SUM(reward_point)로 전체 합산하면 현재 잔액이 계산됨

  @param {object} pool         - DB 커넥션 풀 (트랜잭션 지원을 위해 외부에서 주입)
  @param {number} user_idx     - 포인트를 지급할 유저의 고유 ID
  @param {string} reward_type  - 포인트 지급 사유 식별자 (예: 'daily_login', 'session_complete:5')
  @param {number} reward_point - 지급할 포인트 금액 (차감 시 음수)
*/
const givePoint = async (pool, user_idx, reward_type, reward_point) => {
  // NOW() : MySQL 서버 현재 시각을 earned_at으로 저장하여 지급 시각을 정확하게 기록합니다
  await pool.query(
    `INSERT INTO points (user_idx, reward_type, reward_point, earned_at)
     VALUES (?, ?, ?, NOW())`,
    [user_idx, reward_type, reward_point]
  );
};


// ────────────────────────────────────────────────
// 📅 출석 체크 포인트 처리 함수
// ────────────────────────────────────────────────

/*
  processDailyLogin(user_idx)

  [역할]
  로그인 시 호출되어 오늘의 출석 체크를 처리하고 포인트를 지급합니다.
  오늘 이미 출석 체크가 완료된 경우 중복 지급 없이 즉시 반환합니다.

  [처리 순서]
    1. users 테이블에서 마지막 로그인 날짜(last_login_date)와 연속 출석일(login_streak)을 조회합니다.
    2. 오늘 이미 출석 체크를 했으면 즉시 { checked: false }를 반환합니다.
    3. 어제 출석했으면 연속 출석일(login_streak)을 +1, 아니면 1로 초기화합니다.
    4. users 테이블의 last_login_date와 login_streak을 업데이트합니다.
    5. 기본 출석 포인트(+10P)를 지급합니다.
    6. 연속 출석일이 7의 배수이면 streak_7 보너스(+50P)를 추가 지급합니다.
    7. 연속 출석일이 30의 배수이면 streak_30 보너스(+300P)를 추가 지급합니다.
    8. 지급된 포인트 목록과 연속 출석일을 반환합니다.

  ▼ 날짜 비교 방식 ▼
    JS의 Date 객체를 자정(00:00:00)으로 정규화하여 시간 차이 없이 날짜만 비교합니다.
    setHours(0, 0, 0, 0) : 시·분·초·밀리초를 0으로 설정합니다.
    getTime()으로 밀리초 타임스탬프를 비교하면 날짜가 같은지 정확히 판단할 수 있습니다.

  @param {number} user_idx - 출석 체크를 처리할 유저의 고유 ID
  @returns {object} {
    checked      : 오늘 출석 체크 완료 여부 (false면 이미 했음),
    streak       : 현재 연속 출석일 (checked가 true일 때만),
    earnedPoints : 이번 출석으로 지급된 포인트 항목 배열,
    message      : 처리 결과 메시지
  }
*/
const processDailyLogin = async (user_idx) => {
  const pool = getPool();

  // 현재 유저의 마지막 로그인 날짜와 연속 출석일을 조회합니다
  const [[user]] = await pool.query(
    `SELECT last_login_date, login_streak FROM users WHERE user_idx = ?`,
    [user_idx]
  );

  // ── 오늘 날짜 기준 설정 ──────────────────────────────
  // 시간 정보를 제거하고 날짜만 비교하기 위해 자정(00:00:00)으로 정규화합니다
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastLogin = user.last_login_date ? new Date(user.last_login_date) : null;
  if (lastLogin) lastLogin.setHours(0, 0, 0, 0);

  // ── 중복 출석 체크 방지 ──────────────────────────────
  // 마지막 로그인 날짜가 오늘과 같으면 이미 출석 처리된 것으로 판단합니다
  if (lastLogin && lastLogin.getTime() === today.getTime()) {
    return { checked: false, message: '오늘 이미 출석 체크 완료' };
  }

  // ── 연속 출석일 계산 ─────────────────────────────────
  /*
    yesterday : 오늘 날짜에서 하루를 뺀 날짜입니다.
    마지막 로그인이 어제이면 연속 출석이 이어진 것이므로 +1,
    아니면(하루 이상 공백) 연속이 끊긴 것이므로 1로 초기화합니다.
  */
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newStreak;
  if (lastLogin && lastLogin.getTime() === yesterday.getTime()) {
    newStreak = user.login_streak + 1;  // 어제 출석 → 연속 +1
  } else {
    newStreak = 1;  // 연속 끊김 → 1로 초기화
  }

  // ── users 테이블 갱신 ────────────────────────────────
  // 오늘 날짜와 새 연속 출석일로 유저 정보를 업데이트합니다
  await pool.query(
    `UPDATE users SET last_login_date = CURDATE(), login_streak = ? WHERE user_idx = ?`,
    [newStreak, user_idx]
  );

  const earnedPoints = [];

  // ── 기본 출석 포인트 지급 (+10P) ────────────────────
  await givePoint(pool, user_idx, 'daily_login', POINT_RULES.DAILY_LOGIN);
  earnedPoints.push({ type: 'daily_login', point: POINT_RULES.DAILY_LOGIN });

  // ── 7일 연속 보너스 지급 (+50P) ─────────────────────
  // newStreak가 7의 배수일 때마다 보너스를 지급합니다 (7일, 14일, 21일 ...)
  if (newStreak % 7 === 0) {
    await givePoint(pool, user_idx, 'streak_7', POINT_RULES.STREAK_7);
    earnedPoints.push({ type: 'streak_7', point: POINT_RULES.STREAK_7 });
  }

  // ── 30일 연속 보너스 지급 (+300P) ───────────────────
  // newStreak가 30의 배수일 때마다 보너스를 지급합니다 (30일, 60일, 90일 ...)
  // 30은 7의 배수가 아니므로 streak_7과 중복 지급되지 않습니다
  if (newStreak % 30 === 0) {
    await givePoint(pool, user_idx, 'streak_30', POINT_RULES.STREAK_30);
    earnedPoints.push({ type: 'streak_30', point: POINT_RULES.STREAK_30 });
  }

  return {
    checked      : true,
    streak       : newStreak,
    earnedPoints,
    message      : `출석 체크 완료! (${newStreak}일 연속)`,
  };
};


// ────────────────────────────────────────────────
// 🎯 세션 완료 포인트 처리 함수
// ────────────────────────────────────────────────

/*
  processSessionComplete(user_idx, imm_idx)

  [역할]
  집중 세션 종료 시 호출되어 세션 완료 포인트와 최고 기록 갱신 보너스를 지급합니다.
  세션당 포인트는 1회만 지급되어야 하므로 중복 지급 여부를 먼저 확인합니다.

  [처리 순서]
    1. 해당 세션에 대해 이미 포인트가 지급된 기록이 있는지 확인합니다.
    2. 이미 지급된 세션이면 빈 earnedPoints와 함께 즉시 반환합니다.
    3. 현재 세션의 집중 점수(imm_score)를 조회합니다.
    4. 현재 세션을 제외한 유저의 역대 최고 점수(best_score)를 조회합니다.
    5. 세션 완료 기본 포인트(+10P)를 지급합니다.
    6. 현재 점수가 역대 최고 점수보다 높으면 최고 기록 갱신 보너스(+10P)를 추가 지급합니다.
    7. 지급된 포인트 목록과 최고 기록 갱신 여부를 반환합니다.

  ▼ 중복 지급 방지 방식 ▼
    reward_type을 'session_complete:{imm_idx}' 형식으로 저장합니다.
    세션 ID가 포함된 고유한 타입 문자열을 조회하면 해당 세션의 포인트 지급 여부를 즉시 확인할 수 있습니다.
    (예: 'session_complete:5' → imm_idx=5 세션의 완료 포인트)

  ▼ 최고 기록 조회 방식 ▼
    imm_idx != ? 조건으로 현재 세션을 제외한 이전 세션들의 최고 점수만 비교합니다.
    현재 세션을 포함하면 항상 최고 기록이 갱신되는 오류가 발생하기 때문입니다.
    COALESCE(MAX(imm_score), 0) : 이전 세션이 없으면 0을 기준으로 비교합니다.

  @param {number} user_idx - 포인트를 지급할 유저의 고유 ID
  @param {number} imm_idx  - 종료된 집중 세션의 고유 ID
  @returns {object} {
    earnedPoints : 지급된 포인트 항목 배열,
    isNewRecord  : 최고 기록 갱신 여부 (true/false),
    message      : 처리 결과 메시지
  }
*/
const processSessionComplete = async (user_idx, imm_idx) => {
  const pool = getPool();

  // ── 중복 지급 여부 확인 ──────────────────────────────
  /*
    세션별 고유 reward_type('session_complete:{imm_idx}')으로 조회합니다.
    이미 지급된 기록이 있으면 포인트 지급 없이 즉시 반환합니다.
  */
  const [[alreadyGiven]] = await pool.query(
    `SELECT point_idx FROM points
     WHERE user_idx = ? AND reward_type = ?`,
    [user_idx, `session_complete:${imm_idx}`]
  );

  if (alreadyGiven) {
    return {
      earnedPoints : [],
      isNewRecord  : false,
      message      : '이미 포인트가 지급된 세션입니다.',
    };
  }

  // ── 현재 세션 집중 점수 조회 ─────────────────────────
  const [[currentSession]] = await pool.query(
    `SELECT imm_score FROM immersions WHERE imm_idx = ?`,
    [imm_idx]
  );

  // ── 역대 최고 점수 조회 (현재 세션 제외) ────────────
  /*
    imm_idx != ? 조건으로 현재 세션을 제외합니다.
    현재 세션을 포함하면 항상 자기 자신이 최고 기록이 되어 갱신 판단이 불가능합니다.
    COALESCE(MAX, 0) : 이전 세션이 없는 신규 유저는 0점을 기준으로 비교합니다.
  */
  const [[bestRecord]] = await pool.query(
    `SELECT COALESCE(MAX(imm_score), 0) AS best_score
     FROM immersions
     WHERE user_idx = ? AND imm_idx != ?`,
    [user_idx, imm_idx]
  );

  const earnedPoints = [];

  // ── 세션 완료 기본 포인트 지급 (+10P) ───────────────
  // reward_type에 imm_idx를 포함하여 중복 지급 방지에 활용합니다
  await givePoint(pool, user_idx, `session_complete:${imm_idx}`, POINT_RULES.SESSION_COMPLETE);
  earnedPoints.push({ type: 'session_complete', point: POINT_RULES.SESSION_COMPLETE });

  // ── 최고 기록 갱신 보너스 지급 (+10P) ───────────────
  // 현재 세션 점수가 이전 최고 점수를 초과할 때만 보너스를 지급합니다
  if (currentSession.imm_score > bestRecord.best_score) {
    await givePoint(pool, user_idx, `best_record:${imm_idx}`, POINT_RULES.BEST_RECORD);
    earnedPoints.push({ type: 'best_record', point: POINT_RULES.BEST_RECORD });
  }

  return {
    earnedPoints,
    isNewRecord : currentSession.imm_score > bestRecord.best_score,
    message     : '세션 완료 포인트 지급 완료',
  };
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - processDailyLogin      : 로그인 컨트롤러에서 출석 체크 시 호출
    - processSessionComplete : 세션 종료 컨트롤러에서 포인트 지급 시 호출
    - givePoint              : 다른 서비스에서 포인트를 직접 지급할 때 사용 (예: badge, skin)
*/
module.exports = { processDailyLogin, processSessionComplete, givePoint };
