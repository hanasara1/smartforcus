// server/src/controllers/report.controller.js
const { getPool } = require('../config/db.config');
const { generateAIFeedback } = require('../services/feedback.service');
const { toMySQLDatetime } = require('../utils/dateUtil');

/** GET /api/reports/:imm_idx — 세션 상세 리포트 */
const getReport = async (req, res, next) => {
  try {
    const pool = getPool();
    const { imm_idx } = req.params;

    // ── 1. 세션 조회
    const [[immersion]] = await pool.query(
      `SELECT *, TIMESTAMPDIFF(MINUTE,
                  CONCAT(imm_date,' ',start_time),
                  CONCAT(imm_date,' ',end_time)) AS duration_min
       FROM immersions WHERE imm_idx = ? AND user_idx = ?`,
      [imm_idx, req.user.user_idx]
    );
    if (!immersion) return res.status(404).json({ success: false, message: '리포트를 찾을 수 없습니다.' });

    // ── 2. 자세 조회 (자세 유형별 여러 행)
    const [poses] = await pool.query(
      'SELECT * FROM poses WHERE imm_idx = ? ORDER BY count DESC',
      [imm_idx]
    );

    // ── 3. 소음 조회
    // ✅ is_summary 컬럼 대신 obj_name = '세션평균' 으로 구분
    const [allNoises] = await pool.query(
      'SELECT * FROM noises WHERE imm_idx = ? ORDER BY detected_at',
      [imm_idx]
    );
    const noises = allNoises.filter(n => n.obj_name !== '세션평균');
    const noiseSummary = allNoises.find(n => n.obj_name === '세션평균');

    // ── 4. 피드백 조회 (imm_idx 기준으로 변경!)
    const [feedbacks] = await pool.query(
      'SELECT * FROM feedbacks WHERE imm_idx = ? ORDER BY created_at',
      [imm_idx]
    );

    // ── 5. 타임랩스 조회
    const [timelapses] = await pool.query(
      'SELECT * FROM timelapses WHERE imm_idx = ?',
      [imm_idx]
    );

    // ── 6. 통계 요약
    // ✅ count 컬럼 기반으로 합산
    const badPoses = poses
      .filter(p => p.pose_type !== 'NORMAL')
      .reduce((sum, p) => sum + (p.count || 0), 0);

    const goodPoses = poses
      .filter(p => p.pose_type === 'NORMAL')
      .reduce((sum, p) => sum + (p.count || 0), 0);

    // ✅ 평균 데시벨
    const avgDecibel = noiseSummary
      ? Number(noiseSummary.decibel).toFixed(1)
      : noises.length
        ? (noises.reduce((s, n) => s + Number(n.decibel), 0) / noises.length).toFixed(1)
        : 0;

    // ✅ 자세 유형별 집계 (count 컬럼 기반)
    const poseTypeStat = poses.reduce((acc, p) => {
      acc[p.pose_type] = p.count || 0;
      return acc;
    }, {});

    // ✅ 소음 객체별 집계
    const noiseObjStat = noises.reduce((acc, n) => {
      acc[n.obj_name] = (acc[n.obj_name] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        immersion,
        poses,
        noises,
        timelapses,
        feedbacks,
        summary: { badPoses, goodPoses, avgDecibel, poseTypeStat, noiseObjStat },
      }
    });
  } catch (err) { next(err); }
};

/** GET /api/reports — 최근 리포트 목록 */
const getReportList = async (req, res, next) => {
  try {
    const pool = getPool();
    // ✅ 페이지네이션 파라미터 추가
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT i.*,
              TIMESTAMPDIFF(MINUTE,
                CONCAT(i.imm_date,' ',i.start_time),
                CONCAT(i.imm_date,' ',i.end_time)) AS duration_min,
              (SELECT COALESCE(SUM(p.count), 0) FROM poses p
               WHERE p.imm_idx = i.imm_idx
               AND p.pose_type != 'NORMAL') AS bad_pose_count,
              (SELECT COUNT(*) FROM noises n
               WHERE n.imm_idx = i.imm_idx
               AND n.obj_name != '세션평균') AS noise_count
       FROM immersions i
       WHERE i.user_idx = ? AND i.end_time > '00:00:00'
       ORDER BY i.imm_date DESC, i.start_time DESC
       LIMIT ? OFFSET ?`,
      [req.user.user_idx, limit, offset]
    );

    // ✅ 전체 개수도 함께 반환
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM immersions
       WHERE user_idx = ? AND end_time > '00:00:00'`,
      [req.user.user_idx]
    );

    res.json({
      success: true,
      data: rows,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
};

/** POST /api/reports/:imm_idx/feedback — AI 피드백 재생성 */
const generateFeedback = async (req, res, next) => {
  try {
    const pool = getPool();
    const { imm_idx } = req.params;

    // ── 세션 조회
    const [[session]] = await pool.query(
      `SELECT *, TIMESTAMPDIFF(MINUTE,
                  CONCAT(imm_date,' ',start_time),
                  CONCAT(imm_date,' ',end_time)) AS duration_min
       FROM immersions WHERE imm_idx = ? AND user_idx = ?`,
      [imm_idx, req.user.user_idx]
    );
    if (!session) return res.status(404).json({ success: false, message: '세션을 찾을 수 없습니다.' });

    // ── 자세 조회
    const [poses] = await pool.query(
      'SELECT * FROM poses WHERE imm_idx = ?',
      [imm_idx]
    );

    // ── 평균 데시벨 조회
    const [[noiseSummary]] = await pool.query(
      // ✅ is_summary → obj_name = '세션평균' 으로 수정
      `SELECT decibel 
       FROM noises
       WHERE imm_idx = ? AND obj_name = '세션평균'`,
      [imm_idx]
    );

    // ✅ poseCount: count 컬럼 기반으로 변경
    const poseCount = poses.reduce((acc, p) => {
      acc[p.pose_type] = p.count || 0;
      return acc;
    }, {});

    const avgDecibel = noiseSummary?.decibel ?? 0;

    // ── AI 피드백 재생성
    const feedback = await generateAIFeedback(session, poseCount, avgDecibel);

    // ✅ feedbacks: imm_idx 기준으로 변경
    const [[existing]] = await pool.query(
      'SELECT fb_idx FROM feedbacks WHERE imm_idx = ?', [imm_idx]
    );

    if (existing) {
      // ✅ 기존 피드백 업데이트
      await pool.query(
        'UPDATE feedbacks SET fb_content = ?, created_at = ? WHERE imm_idx = ?',
        [feedback, toMySQLDatetime(), imm_idx]
      );
    } else {
      // ✅ 새로 INSERT
      await pool.query(
        'INSERT INTO feedbacks (imm_idx, fb_content, created_at) VALUES (?, ?, ?)',
        [imm_idx, feedback, toMySQLDatetime()]
      );
    }

    res.json({ success: true, data: { feedback } });
  } catch (err) { next(err); }
};

module.exports = { getReport, getReportList, generateFeedback };
