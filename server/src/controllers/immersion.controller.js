// server/src/controllers/immersion.controller.js
const { getPool } = require('../config/db.config');
const { processSessionComplete } = require('../services/point.service');

/** POST /api/immersions — 집중 세션 시작 */
const startSession = async (req, res, next) => {
  try {
    const pool = getPool();
    const { imm_date, start_time } = req.body;
    const [result] = await pool.query(
      `INSERT INTO immersions (user_idx, imm_date, start_time, end_time, imm_score)
       VALUES (?, ?, ?, '00:00:00', 0)`,
      [req.user.user_idx, imm_date, start_time]
    );
    res.status(201).json({ success: true, data: { imm_idx: result.insertId } });
  } catch (err) { next(err); }
};

/** PATCH /api/immersions/:imm_idx/end — 집중 세션 종료 */
const endSession = async (req, res, next) => {
  try {
    const pool = getPool();
    const { end_time, imm_score, max_good_streak = 0 } = req.body;
    const { imm_idx } = req.params;

    // ✅ 세션 소유자 확인
    const [[session]] = await pool.query(
      'SELECT * FROM immersions WHERE imm_idx = ? AND user_idx = ?',
      [imm_idx, req.user.user_idx]
    );
    if (!session) return res.status(404).json({ success: false, message: '세션을 찾을 수 없습니다.' });

    // ✅ 세션 종료 정보 저장
    await pool.query(
      'UPDATE immersions SET end_time = ?, imm_score = ?, max_good_streak = ? WHERE imm_idx = ?',
      [end_time, imm_score, max_good_streak, imm_idx]
    );

    // ✅ 포인트 지급 (processSessionComplete 하나만 사용)
    const pointResult = await processSessionComplete(req.user.user_idx, imm_idx);

    console.log(`✅ 세션 포인트 지급 - ${pointResult.earnedPoints.map(p => `${p.type} +${p.point}P`).join(', ')}`);
    if (pointResult.isNewRecord) {
      console.log(`🏆 최고 기록 갱신!`);
    }

    res.json({
      success: true,
      message: '집중 세션이 종료되었습니다.',
      data: {
        // ✅ 지급된 포인트 정보도 프론트로 전달
        earned_points:  pointResult.earnedPoints,
        is_new_record:  pointResult.isNewRecord,
        total_earned:   pointResult.earnedPoints.reduce((sum, p) => sum + p.point, 0),
      },
    });
  } catch (err) { next(err); }
};

/** GET /api/immersions — 내 집중 기록 목록 */
const getList = async (req, res, next) => {
  try {
    const pool = getPool();
    const { page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const [rows] = await pool.query(
      `SELECT i.*,
              TIMESTAMPDIFF(MINUTE,
                CONCAT(i.imm_date,' ',i.start_time),
                CONCAT(i.imm_date,' ',i.end_time)) AS duration_min
       FROM immersions i
       WHERE i.user_idx = ?
       ORDER BY i.imm_date DESC, i.start_time DESC
       LIMIT ? OFFSET ?`,
      [req.user.user_idx, Number(limit), offset]
    );
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM immersions WHERE user_idx = ?', [req.user.user_idx]
    );

    res.json({ success: true, data: rows, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) { next(err); }
};

/** GET /api/immersions/:imm_idx — 단일 세션 조회 */
const getOne = async (req, res, next) => {
  try {
    const pool = getPool();
    const [[session]] = await pool.query(
      `SELECT *, TIMESTAMPDIFF(MINUTE,
                  CONCAT(imm_date,' ',start_time),
                  CONCAT(imm_date,' ',end_time)) AS duration_min
       FROM immersions WHERE imm_idx = ? AND user_idx = ?`,
      [req.params.imm_idx, req.user.user_idx]
    );
    if (!session) return res.status(404).json({ success: false, message: '세션을 찾을 수 없습니다.' });
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
};

module.exports = { startSession, endSession, getList, getOne };
