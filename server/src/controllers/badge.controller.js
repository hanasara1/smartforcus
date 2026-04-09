// server/src/controllers/badge.controller.js
const { getPool } = require('../config/db.config');

/** GET /api/badges — 전체 뱃지 목록 (보유 여부 포함) */
const getBadgeList = async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT b.*,
              CASE WHEN ub.ubadge_idx IS NOT NULL THEN 1 ELSE 0 END AS is_owned,
              ub.created_at AS earned_at
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_idx = b.badge_idx AND ub.user_idx = ?
       ORDER BY b.badge_point`,
      [req.user.user_idx]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/** POST /api/badges/:badge_idx/purchase — 뱃지 구매 */
const purchaseBadge = async (req, res, next) => {
  const pool = getPool();
  const conn = await pool.getConnection(); // ✅ 커넥션 획득
  try {
    await conn.beginTransaction(); // ✅ 트랜잭션 시작

    const { badge_idx } = req.params;
    const uid = req.user.user_idx;

    const [[badge]] = await conn.query(
      'SELECT * FROM badges WHERE badge_idx = ?', [badge_idx]
    );
    if (!badge) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: '뱃지를 찾을 수 없습니다.' });
    }

    const [[owned]] = await conn.query(
      'SELECT ubadge_idx FROM user_badges WHERE user_idx = ? AND badge_idx = ?',
      [uid, badge_idx]
    );
    if (owned) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: '이미 보유한 뱃지입니다.' });
    }

    const [[{ total }]] = await conn.query(
      'SELECT COALESCE(SUM(reward_point),0) AS total FROM points WHERE user_idx = ?',
      [uid]
    );
    if (total < badge.badge_point) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `포인트가 부족합니다. (보유: ${total}P, 필요: ${badge.badge_point}P)`,
      });
    }

    // ✅ 포인트 차감
    await conn.query(
      `INSERT INTO points (user_idx, reward_type, reward_point) VALUES (?, ?, ?)`,
      [uid, `badge_purchase:${badge.badge_name}`, -badge.badge_point]
    );

    // ✅ 뱃지 지급
    await conn.query(
      'INSERT INTO user_badges (user_idx, badge_idx) VALUES (?, ?)',
      [uid, badge_idx]
    );

    await conn.commit(); // ✅ 커밋
    res.json({
      success: true,
      message: `'${badge.badge_name}' 뱃지를 획득했습니다!`,
      data: { badge },
    });
  } catch (err) {
    await conn.rollback(); // ✅ 오류 시 롤백
    next(err);
  } finally {
    conn.release(); // ✅ 커넥션 반환
  }
};

/** GET /api/badges/my — 내 뱃지 목록 */
const getMyBadges = async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT b.*, ub.created_at AS earned_at
       FROM user_badges ub JOIN badges b ON b.badge_idx = ub.badge_idx
       WHERE ub.user_idx = ? ORDER BY ub.created_at DESC`,
      [req.user.user_idx]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

module.exports = { getBadgeList, purchaseBadge, getMyBadges };
