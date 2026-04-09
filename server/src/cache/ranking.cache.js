// server/src/cache/ranking.cache.js
const cron = require('node-cron');
const { getPool } = require('../config/db.config');

// ✅ 메모리 캐시 저장소
let rankingCache = {
    data: null,        // 랭킹 데이터
    updatedAt: null,   // 마지막 갱신 시간
    lastSuccessAt: null, // ✅ 마지막 성공 시간 별도 관리
    failCount: 0,        // ✅ 연속 실패 횟수
};

// ✅ 랭킹 계산 함수 (DB 쿼리)
const calculateRanking = async () => {
    try {
        const pool = getPool();

        const [allRanking] = await pool.query(`
      SELECT
        u.user_idx,
        u.nick,
        COALESCE(SUM(
          GREATEST(TIMESTAMPDIFF(MINUTE,
            CONCAT(i.imm_date, ' ', i.start_time),
            CONCAT(i.imm_date, ' ', i.end_time)), 0)
        ), 0) AS total_minutes,
        COALESCE(MAX(
          GREATEST(TIMESTAMPDIFF(MINUTE,
            CONCAT(i.imm_date, ' ', i.start_time),
            CONCAT(i.imm_date, ' ', i.end_time)), 0)
        ), 0) AS max_minutes,
        COALESCE(SUM(
          GREATEST(TIMESTAMPDIFF(MINUTE,
            CONCAT(i.imm_date, ' ', i.start_time),
            CONCAT(i.imm_date, ' ', i.end_time)), 0)
        ), 0) + COALESCE(MAX(
          GREATEST(TIMESTAMPDIFF(MINUTE,
            CONCAT(i.imm_date, ' ', i.start_time),
            CONCAT(i.imm_date, ' ', i.end_time)), 0)
        ), 0) AS composite_score
      FROM users u
      LEFT JOIN immersions i
        ON i.user_idx = u.user_idx
        AND i.end_time > '00:00:00'
        AND i.imm_score > 0          -- ✅ 점수 없는 세션 제외
      GROUP BY u.user_idx, u.nick
      ORDER BY composite_score DESC, total_minutes DESC
    `);

        rankingCache = {
            data: allRanking,
            updatedAt: new Date(),
            lastSuccessAt: new Date(), // ✅ 성공 시간 기록
            failCount: 0,              // ✅ 성공 시 초기화
        };

        console.log(`✅ 랭킹 캐시 갱신 완료 - ${new Date().toLocaleString('ko-KR')}`);

    } catch (err) {
        rankingCache.failCount = (rankingCache.failCount || 0) + 1;
        console.error(`❌ 랭킹 캐시 갱신 실패 (${rankingCache.failCount}회):`, err.message);
        // ✅ 3회 이상 실패 시 경고 로그
        if (rankingCache.failCount >= 3) {
            console.error('🚨 랭킹 캐시 갱신 3회 연속 실패! DB 연결 상태를 확인하세요.');
        }
    }
};

// ✅ 캐시에서 랭킹 읽기 (user_idx로 내 순위 계산)
const getRankingFromCache = (uid) => {
    const allRanking = rankingCache.data;

    // 캐시가 없으면 null 반환
    if (!allRanking) return null;

    // Top 10 추출
    const top10 = allRanking.slice(0, 10).map((r, idx) => ({
        rank: idx + 1,
        user_idx: r.user_idx,
        nick: r.nick,
        total_minutes: Number(r.total_minutes),
        max_minutes: Number(r.max_minutes),
        composite_score: Number(r.composite_score),
        is_me: r.user_idx === uid,
    }));

    // 내 순위 찾기
    const myRankIdx = allRanking.findIndex(r => r.user_idx === uid);
    const myRank = myRankIdx + 1;
    const isInTop10 = myRank <= 10 && myRank > 0;

    const myData = myRankIdx >= 0 ? {
        rank: myRank,
        user_idx: allRanking[myRankIdx].user_idx,
        nick: allRanking[myRankIdx].nick,
        total_minutes: Number(allRanking[myRankIdx].total_minutes),
        max_minutes: Number(allRanking[myRankIdx].max_minutes),
        composite_score: Number(allRanking[myRankIdx].composite_score),
        is_me: true,
    } : null;

    return {
        top10,
        myRank,
        myData: isInTop10 ? null : myData,
        isInTop10,
        updatedAt: rankingCache.updatedAt, // ✅ 마지막 갱신 시간도 함께 전달
    };
};

// ✅ cron 스케줄 등록 (매일 자정에 한번 자동 갱신)
// 형식: '분 시 일 월 요일'
// '0 0 * * *' → 매일 자정에 한 번 갱신
const startRankingCron = () => {
    // 서버 시작 시 최초 1회 즉시 계산
    calculateRanking();

    // 매일 자정에 한 번 자동 갱신
    cron.schedule('0 0 * * *', () => {
        calculateRanking();
    });

    console.log('🕐 랭킹 캐시 스케줄러 시작 (매일 자정에 한 번 갱신)');
};

module.exports = { startRankingCron, getRankingFromCache, calculateRanking };
