// server/src/services/badge.seed.js
// 서버 최초 실행 시 기본 뱃지 데이터 삽입
const { getPool } = require('../config/db.config');
const logger = require('../utils/logger');

const DEFAULT_BADGES = [
  { badge_name: '🌱 첫 걸음', badge_desc: '첫 집중 세션을 완료했습니다.', badge_point: 0 },
  { badge_name: '⭐ 집중왕', badge_desc: '집중 점수 90점 이상 달성', badge_point: 100 },
  { badge_name: '🔥 연속 3일', badge_desc: '3일 연속 집중 세션 완료', badge_point: 150 },
  { badge_name: '💎 포인트 부자', badge_desc: '누적 포인트 500P 달성', badge_point: 200 },
  { badge_name: '🦅 자세 마스터', badge_desc: '자세 오류 없이 30분 집중', badge_point: 300 },
  { badge_name: '🌙 야행성', badge_desc: '오후 10시 이후 집중 세션 완료', badge_point: 50 },
  { badge_name: '🌅 얼리버드', badge_desc: '오전 7시 이전 집중 세션 완료', badge_point: 50 },
  { badge_name: '📚 공부벌레', badge_desc: '하루 총 2시간 이상 집중', badge_point: 250 },
];

const seedBadges = async () => {
  try {
    const pool = getPool();
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM badges');
    if (cnt > 0) return; // ✅ 이미 데이터 있으면 스킵

    // ✅ 한 번의 쿼리로 전체 삽입
    const values = DEFAULT_BADGES.map(b => [b.badge_name, b.badge_desc, b.badge_point]);
    await pool.query(
      'INSERT INTO badges (badge_name, badge_desc, badge_point) VALUES ?',
      [values]
    );

    logger.info(`✅ 기본 뱃지 ${DEFAULT_BADGES.length}개 삽입 완료`);
  } catch (err) {
    logger.error('뱃지 시드 오류:', err.message);
  }
};

module.exports = { seedBadges };
