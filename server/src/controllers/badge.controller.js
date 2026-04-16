// server/src/controllers/badge.controller.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');


// ────────────────────────────────────────────────
// 🏅 전체 뱃지 목록 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/badges

  [역할]
  badges 테이블의 전체 뱃지 목록을 조회하면서,
  현재 로그인한 유저가 각 뱃지를 보유하고 있는지 여부도 함께 반환합니다.

  [처리 순서]
    1. badges 테이블 전체를 기준으로 user_badges 테이블을 LEFT JOIN합니다.
    2. 각 뱃지에 대해 보유 여부(is_owned)와 획득 시각(earned_at)을 계산합니다.
    3. 뱃지 포인트(badge_point) 오름차순으로 정렬하여 반환합니다.

  ▼ SQL 핵심 설명 ▼
    LEFT JOIN : badges 테이블을 기준으로, 유저가 보유하지 않은 뱃지도 결과에 포함합니다.
                보유하지 않은 경우 user_badges의 컬럼은 NULL로 채워집니다.

    CASE WHEN ub.ubadge_idx IS NOT NULL THEN 1 ELSE 0 END AS is_owned :
      user_badges에서 해당 뱃지를 찾았으면(ubadge_idx가 존재하면) 1(보유),
      찾지 못했으면(NULL이면) 0(미보유)을 반환합니다.

  @returns 200 : 뱃지 목록 배열 (is_owned, earned_at 포함)
*/
const getBadgeList = async (req, res, next) => {
  try {
    const pool = getPool();

    // badges 전체를 기준으로 현재 유저의 보유 내역을 LEFT JOIN하여 조회합니다
    const [rows] = await pool.query(
      `SELECT b.*,
              CASE WHEN ub.ubadge_idx IS NOT NULL THEN 1 ELSE 0 END AS is_owned,
              ub.created_at AS earned_at
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_idx = b.badge_idx AND ub.user_idx = ?
       ORDER BY b.badge_point`,   // 필요 포인트 낮은 뱃지부터 오름차순 정렬
      [req.user.user_idx]         // JWT 미들웨어가 주입한 현재 로그인 유저의 고유 ID
    );

    res.json({ success: true, data: rows });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 🛒 뱃지 구매 컨트롤러
// ────────────────────────────────────────────────

/*
  POST /api/badges/:badge_idx/purchase

  [역할]
  유저가 보유한 포인트로 특정 뱃지를 구매합니다.
  포인트 차감과 뱃지 지급은 반드시 하나의 트랜잭션으로 처리하여
  중간에 오류가 생기더라도 데이터가 불일치한 상태로 남지 않도록 합니다.

  [처리 순서]
    1. 트랜잭션을 시작합니다.
    2. 구매하려는 뱃지가 존재하는지 확인합니다.
    3. 이미 보유한 뱃지인지 확인합니다.
    4. 유저의 현재 포인트 합계가 뱃지 가격 이상인지 확인합니다.
    5. 포인트를 차감합니다 (points 테이블에 음수값 INSERT).
    6. 뱃지를 지급합니다 (user_badges 테이블에 INSERT).
    7. 모두 성공하면 커밋, 하나라도 실패하면 롤백합니다.

  ▼ 트랜잭션(Transaction)이란? ▼
    여러 DB 작업을 하나의 묶음으로 처리하는 방식입니다.
    묶음 내 작업이 모두 성공해야 최종 반영(commit)되고,
    하나라도 실패하면 전체를 되돌립니다(rollback).
    → 포인트는 차감됐는데 뱃지가 지급되지 않는 사고를 방지합니다.

  ▼ pool.getConnection()이란? ▼
    트랜잭션은 단일 DB 연결 위에서만 동작합니다.
    pool.query()는 요청마다 연결을 자동 배정하므로,
    트랜잭션에서는 conn을 직접 꺼내 고정시킨 뒤 사용해야 합니다.

  @param {string} req.params.badge_idx - 구매할 뱃지의 고유 ID
  @returns 200 : 구매 성공 + 뱃지 정보
           400 : 포인트 부족
           404 : 뱃지 없음
           409 : 이미 보유한 뱃지
*/
const purchaseBadge = async (req, res, next) => {
  const pool = getPool();

  // 트랜잭션을 위해 단일 커넥션을 직접 꺼냅니다
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();  // 트랜잭션 시작 (이후 작업들을 하나의 묶음으로 처리)

    const { badge_idx } = req.params;   // URL 파라미터에서 뱃지 ID 추출
    const uid = req.user.user_idx;      // JWT 미들웨어가 주입한 현재 유저 ID

    // ── 뱃지 존재 여부 확인 ──────────────────────────────
    /*
      [[badge]] : pool.query()가 반환하는 [rows, fields] 중 rows를 꺼내고,
                  rows[0](첫 번째 결과)를 badge에 바로 담습니다.
                  결과가 없으면 badge는 undefined가 됩니다.
    */
    const [[badge]] = await conn.query(
      'SELECT * FROM badges WHERE badge_idx = ?', [badge_idx]
    );
    if (!badge) {
      await conn.rollback();  // 뱃지가 없으면 트랜잭션을 취소하고 오류 응답
      return res.status(404).json({ success: false, message: '뱃지를 찾을 수 없습니다.' });
    }

    // ── 보유 여부 확인 ───────────────────────────────────
    // 같은 유저가 같은 뱃지를 중복 구매하지 못하도록 이미 보유한 기록이 있는지 확인합니다
    const [[owned]] = await conn.query(
      'SELECT ubadge_idx FROM user_badges WHERE user_idx = ? AND badge_idx = ?',
      [uid, badge_idx]
    );
    if (owned) {
      await conn.rollback();  // 이미 보유했으면 트랜잭션 취소 후 409 반환
      return res.status(409).json({ success: false, message: '이미 보유한 뱃지입니다.' });
    }

    // ── 포인트 잔액 확인 ─────────────────────────────────
    /*
      COALESCE(SUM(reward_point), 0) :
        points 테이블에서 해당 유저의 모든 포인트 내역을 합산합니다.
        포인트 내역이 없어 SUM 결과가 NULL이면 0으로 대체합니다.
        포인트 차감 내역은 음수(-)로 저장되어 있어 SUM하면 실제 잔액이 계산됩니다.
    */
    const [[{ total }]] = await conn.query(
      'SELECT COALESCE(SUM(reward_point),0) AS total FROM points WHERE user_idx = ?',
      [uid]
    );
    if (total < badge.badge_point) {
      await conn.rollback();  // 잔액 부족 시 트랜잭션 취소 후 400 반환
      return res.status(400).json({
        success: false,
        // 유저가 현재 보유 포인트와 필요 포인트를 한눈에 확인할 수 있도록 메시지에 포함합니다
        message: `포인트가 부족합니다. (보유: ${total}P, 필요: ${badge.badge_point}P)`,
      });
    }

    // ── 포인트 차감 ──────────────────────────────────────
    /*
      포인트를 직접 수정하지 않고 음수값(-badge_point)을 새 행으로 INSERT합니다.
      이렇게 하면 포인트 내역(충전, 차감, 지급)이 모두 기록으로 남아 추적이 가능합니다.
      reward_type에 뱃지 이름을 포함시켜 어떤 뱃지 구매로 차감됐는지 식별합니다.
    */
    await conn.query(
      `INSERT INTO points (user_idx, reward_type, reward_point) VALUES (?, ?, ?)`,
      [uid, `badge_purchase:${badge.badge_name}`, -badge.badge_point]  // 차감이므로 음수
    );

    // ── 뱃지 지급 ────────────────────────────────────────
    // user_badges 테이블에 유저-뱃지 관계를 기록하여 보유 처리합니다
    await conn.query(
      'INSERT INTO user_badges (user_idx, badge_idx) VALUES (?, ?)',
      [uid, badge_idx]
    );

    // ── 커밋 (모든 작업 성공 시 최종 반영) ──────────────
    await conn.commit();

    res.json({
      success: true,
      message: `'${badge.badge_name}' 뱃지를 획득했습니다!`,
      data: { badge },  // 구매한 뱃지의 전체 정보를 함께 반환합니다
    });

  } catch (err) {
    // 예상치 못한 오류 발생 시 트랜잭션 전체를 되돌려 데이터 무결성을 지킵니다
    await conn.rollback();
    next(err);

  } finally {
    /*
      finally 블록 : 성공·실패 여부와 무관하게 반드시 실행됩니다.
      conn.release() : 사용한 커넥션을 풀에 반환합니다.
                       반환하지 않으면 커넥션이 고갈되어 서버 전체가 DB 요청을 처리하지 못합니다.
    */
    conn.release();
  }
};


// ────────────────────────────────────────────────
// 🎖️ 내 뱃지 목록 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/badges/my

  [역할]
  현재 로그인한 유저가 보유한 뱃지 목록만 조회합니다.
  가장 최근에 획득한 뱃지가 먼저 오도록 정렬합니다.

  [처리 순서]
    1. user_badges 테이블을 기준으로 badges 테이블을 INNER JOIN합니다.
    2. 현재 유저의 뱃지만 필터링합니다.
    3. 획득 시각(created_at) 기준 내림차순으로 정렬하여 반환합니다.

  ▼ getBadgeList와의 차이점 ▼
    getBadgeList : badges 기준 LEFT JOIN → 전체 뱃지 목록 (보유·미보유 모두 포함)
    getMyBadges  : user_badges 기준 INNER JOIN → 보유한 뱃지만 포함

  @returns 200 : 보유 뱃지 배열 (earned_at 포함, 최신 획득순 정렬)
*/
const getMyBadges = async (req, res, next) => {
  try {
    const pool = getPool();

    /*
      user_badges(보유 내역)를 기준으로 badges(뱃지 정보)를 JOIN합니다.
      INNER JOIN이므로 user_badges에 존재하는 뱃지, 즉 보유한 뱃지만 결과에 포함됩니다.
      ub.created_at을 earned_at으로 별칭 처리하여 획득 시각임을 명확히 합니다.
    */
    const [rows] = await pool.query(
      `SELECT b.*, ub.created_at AS earned_at
       FROM user_badges ub JOIN badges b ON b.badge_idx = ub.badge_idx
       WHERE ub.user_idx = ? ORDER BY ub.created_at DESC`,  // 최근 획득 뱃지 먼저
      [req.user.user_idx]   // JWT 미들웨어가 주입한 현재 로그인 유저의 고유 ID
    );

    res.json({ success: true, data: rows });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - getBadgeList  : 전체 뱃지 목록 조회 라우터에 연결
    - purchaseBadge : 뱃지 구매 라우터에 연결
    - getMyBadges   : 내 보유 뱃지 목록 조회 라우터에 연결
*/
module.exports = { getBadgeList, purchaseBadge, getMyBadges };
