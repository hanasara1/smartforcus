// server/src/controllers/user.controller.js
const bcrypt = require('bcryptjs');
const { getPool } = require('../config/db.config');
const { getRankingFromCache } = require('../cache/ranking.cache');

/** GET /api/users/me */
const getMe = async (req, res, next) => {
  try {
    const pool = getPool();
    const [[user]] = await pool.query(
      `SELECT u.user_idx, u.email, u.nick, u.created_at,
              COALESCE(SUM(p.reward_point), 0) AS total_points
       FROM users u
       LEFT JOIN points p ON p.user_idx = u.user_idx
       WHERE u.user_idx = ?
       GROUP BY u.user_idx`,
      [req.user.user_idx]
    );
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

/** PUT /api/users/me */
const updateMe = async (req, res, next) => {
  try {
    const pool = getPool();
    const { nick, currentPwd, newPwd } = req.body;
    const [[user]] = await pool.query(
      'SELECT pwd, nick FROM users WHERE user_idx = ?',
      [req.user.user_idx]
    );

    // ✅ 비밀번호 변경 처리
    if (newPwd) {
      if (!currentPwd) {
        return res.status(400).json({
          success: false,
          message: '현재 비밀번호를 입력해주세요.',
        });
      }
      const match = await bcrypt.compare(currentPwd, user.pwd);
      if (!match) {
        return res.status(400).json({
          success: false,
          message: '현재 비밀번호가 틀렸습니다.',
        });
      }
      const hashed = await bcrypt.hash(newPwd, 12);
      // ✅ 닉네임이 있을 때만 닉네임도 함께 변경, 없으면 비밀번호만 변경
      if (nick) {
        await pool.query(
          'UPDATE users SET nick = ?, pwd = ? WHERE user_idx = ?',
          [nick, hashed, req.user.user_idx]
        );
      } else {
        await pool.query(
          'UPDATE users SET pwd = ? WHERE user_idx = ?',
          [hashed, req.user.user_idx]
        );
      }
    } else if (nick) {
      // ✅ 닉네임만 변경
      await pool.query(
        'UPDATE users SET nick = ? WHERE user_idx = ?',
        [nick, req.user.user_idx]
      );
    } else {
      // ✅ 변경할 내용이 없는 경우
      return res.status(400).json({
        success: false,
        message: '변경할 내용이 없습니다.',
      });
    }

    res.json({ success: true, message: '회원 정보가 수정되었습니다.' });
  } catch (err) { next(err); }
};

/** GET /api/users/me/stats — 마이페이지 종합 통계 */
const getMyStats = async (req, res, next) => {
  try {
    const pool = getPool();
    const uid = req.user.user_idx;

    // 전체 집중 세션 수
    const [[{ session_count }]] = await pool.query(
      'SELECT COUNT(*) AS session_count FROM immersions WHERE user_idx = ?',
      [uid]
    );

    // 총 집중 시간(분)
    const [[{ total_minutes }]] = await pool.query(
      `SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE,
          CONCAT(imm_date,' ',start_time),
          CONCAT(imm_date,' ',end_time))),0) AS total_minutes
       FROM immersions
       WHERE user_idx = ?
         AND end_time > '00:00:00'`, [uid]
    );

    // 평균 집중 점수
    const [[{ avg_score }]] = await pool.query(
      'SELECT COALESCE(AVG(imm_score),0) AS avg_score FROM immersions WHERE user_idx = ?',
      [uid]
    );

    // 총 포인트
    const [[{ total_points }]] = await pool.query(
      'SELECT COALESCE(SUM(reward_point),0) AS total_points FROM points WHERE user_idx = ?',
      [uid]
    );

    // ✅ 최근 7일 집중 기록
    // DATE_FORMAT으로 문자열 고정 → UTC 변환 문제 방지
    // imm_score > 0 AND end_time > '00:00:00' → 완료된 세션만 집계
    const [weekly] = await pool.query(
      `SELECT
        DATE_FORMAT(imm_date, '%Y-%m-%d') AS imm_date,
        ROUND(AVG(imm_score), 0)          AS avg_score,
        COUNT(*)                           AS cnt
       FROM immersions
       WHERE user_idx = ?
         AND imm_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         AND end_time > '00:00:00'
         AND imm_score > 0
       GROUP BY DATE_FORMAT(imm_date, '%Y-%m-%d')
       ORDER BY imm_date ASC`,
      [uid]
    );

    res.json({
      success: true,
      data: {
        session_count,
        total_minutes,
        avg_score: Math.round(avg_score),
        total_points,
        weekly,
      },
    });
  } catch (err) { next(err); }
};

/** GET /api/users/me/pose-stats — 취약 자세 Top 3 */
const getMyPoseStats = async (req, res, next) => {
  try {
    const pool = getPool();
    const uid = req.user.user_idx;

    const [rows] = await pool.query(
      `SELECT
        pose_type,
        SUM(total_count) AS total_count
       FROM (
         SELECT
           CASE
             WHEN p.pose_type IN ('TURTLE', 'SLUMP', 'TILT', 'CHIN', 'STATIC')
               THEN p.pose_type
             ELSE p.pose_type
           END AS pose_type,
           p.count AS total_count  -- ✅ 1 → p.count 로 수정
         FROM poses p
         JOIN immersions i ON p.imm_idx = i.imm_idx
         WHERE i.user_idx = ?
           AND p.pose_type != 'NORMAL'   -- ✅ NORMAL 제외
           AND p.pose_status != 'GOOD'   -- ✅ GOOD 제외
       ) AS normalized
       GROUP BY pose_type
       ORDER BY total_count DESC
       LIMIT 3`,
      [uid]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};


/** GET /api/users/ranking — 캐시 기반 랭킹 조회 */
const getRanking = async (req, res, next) => {
  try {
    const uid = req.user.user_idx;

    const result = getRankingFromCache(uid);

    if (!result) {
      return res.status(503).json({
        success: false,
        message: '랭킹 데이터를 준비 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

/** GET /api/users/me/streak — 출석 스트릭 조회 */
const getMyStreak = async (req, res, next) => {
  try {
    const pool = getPool();
    const uid = req.user.user_idx;

    // ── ① 최근 12주(84일)간 출석 날짜 목록 조회
    const [attendanceDays] = await pool.query(
      `SELECT DISTINCT DATE_FORMAT(earned_at, '%Y-%m-%d') AS att_date
       FROM points
       WHERE user_idx = ?
         AND reward_type = 'daily_login'
         AND earned_at >= DATE_SUB(CURDATE(), INTERVAL 84 DAY)
       ORDER BY att_date ASC`,
      [uid]
    );

    const attendSet = new Set(attendanceDays.map(r => r.att_date));

    // ── ② 현재 연속 출석일 계산 (출석 기록 없으면 0)
    let currentStreak = 0;
    if (attendSet.size > 0) {
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        // ✅ 로컬 기준 날짜 문자열 생성 (UTC 변환 방지)
        const dateStr = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0'),
        ].join('-');

        if (attendSet.has(dateStr)) {
          currentStreak++;
        } else {
          // 오늘 아직 출석 안 했을 경우 어제부터 체크 허용
          if (i === 0) continue;
          break;
        }
      }
    }

    // ── ③ 최장 연속 출석일 계산 (전체 기간)
    const [allDays] = await pool.query(
      `SELECT DISTINCT DATE_FORMAT(earned_at, '%Y-%m-%d') AS att_date
       FROM points
       WHERE user_idx = ?
         AND reward_type = 'daily_login'
       ORDER BY att_date ASC`,
      [uid]
    );

    let maxStreak = 0;
    let tempStreak = 0;
    let prevDate = null;

    for (const { att_date } of allDays) {
      const curr = new Date(att_date);
      if (prevDate) {
        const diff = (curr - prevDate) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          tempStreak++;
        } else {
          maxStreak = Math.max(maxStreak, tempStreak);
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      prevDate = curr;
    }
    // ✅ 루프 종료 후 마지막 streak 반영
    maxStreak = Math.max(maxStreak, tempStreak);

    // ── ④ 이번 달 출석 횟수
    const [[{ monthly_count }]] = await pool.query(
      `SELECT COUNT(DISTINCT DATE(earned_at)) AS monthly_count
       FROM points
       WHERE user_idx = ?
         AND reward_type = 'daily_login'
         AND YEAR(earned_at) = YEAR(CURDATE())
         AND MONTH(earned_at) = MONTH(CURDATE())`,
      [uid]
    );

    // ── ⑤ 전체 출석 횟수
    const [[{ total_count }]] = await pool.query(
      `SELECT COUNT(DISTINCT DATE(earned_at)) AS total_count
       FROM points
       WHERE user_idx = ?
         AND reward_type = 'daily_login'`,
      [uid]
    );

    // ✅ 항상 정상 응답 반환 (출석 기록 0건이어도 빈 배열로 반환)
    res.json({
      success: true,
      data: {
        current_streak: currentStreak,
        max_streak: maxStreak,
        monthly_count: Number(monthly_count) || 0,
        total_count: Number(total_count) || 0,
        attendance_dates: attendanceDays.map(r => r.att_date),
      },
    });
  } catch (err) { next(err); }
};

module.exports = { getMe, updateMe, getMyStats, getMyPoseStats, getRanking, getMyStreak };
