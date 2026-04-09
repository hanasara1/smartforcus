// server/src/controllers/point.controller.js
const { getPool } = require('../config/db.config');

/** GET /api/points — 포인트 내역 */
const getHistory = async (req, res, next) => {
  try {
    const pool = getPool();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT * FROM points
       WHERE user_idx = ?
       ORDER BY earned_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.user_idx, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      'SELECT COALESCE(SUM(reward_point), 0) AS total FROM points WHERE user_idx = ?',
      [req.user.user_idx]
    );
    // ✅ 전체 행 수도 함께 반환
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM points WHERE user_idx = ?',
      [req.user.user_idx]
    );

    res.json({
      success: true,
      data: rows,
      meta: {
        total,
        count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) { next(err); }
};

module.exports = { getHistory };
