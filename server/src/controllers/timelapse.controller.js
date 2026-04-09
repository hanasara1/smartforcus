// server/src/controllers/timelapse.controller.js
const { getPool } = require('../config/db.config');

/**
 * POST /api/timelapses
 * 파일명만 받아서 DB에 저장
 */

exports.createTimelapse = async (req, res, next) => {
  try {
    const pool = getPool();
    const { imm_idx, file_name } = req.body;

    if (!imm_idx || !file_name) {
      return res.status(400).json({ message: 'imm_idx와 file_name이 필요합니다.' });
    }

    // ✅ 세션 소유자 확인 추가
    const [[session]] = await pool.query(
      'SELECT imm_idx FROM immersions WHERE imm_idx = ? AND user_idx = ?',
      [imm_idx, req.user.user_idx]
    );
    if (!session) {
      return res.status(403).json({
        success: false,
        message: '본인의 세션에만 타임랩스를 저장할 수 있습니다.',
      });
    }

    await pool.query(
      `INSERT INTO timelapses (imm_idx, file_name, created_at) VALUES (?, ?, NOW())`,
      [imm_idx, file_name]
    );

    return res.status(201).json({
      success: true,
      message: '타임랩스 파일명 저장 완료',
      data: { file_name },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/timelapses/:imm_idx
 * 특정 세션의 타임랩스 목록 조회
 */
exports.getTimelapses = async (req, res, next) => {
  try {
    const pool = getPool();
    const { imm_idx } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM timelapses WHERE imm_idx = ? ORDER BY created_at ASC`,
      [imm_idx]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('타임랩스 조회 에러:', err);
    next(err);
  }
};
