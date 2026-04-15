// server/src/cache/ranking.cache.js

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// node-cron : 특정 시간마다 자동으로 함수를 실행해주는 스케줄러 라이브러리
const cron = require('node-cron');

// getPool : 데이터베이스(DB)와 연결된 풀(pool)을 가져오는 함수
// 풀(pool)이란? DB 연결을 여러 개 미리 만들어두고 재사용하는 방식 (속도 향상 목적)
const { getPool } = require('../config/db.config');


// ────────────────────────────────────────────────
// 🗄️ 메모리 캐시 저장소 초기화
// ────────────────────────────────────────────────

/*
  캐시(Cache)란?
  매번 DB에서 데이터를 가져오면 시간이 오래 걸립니다.
  그래서 한 번 가져온 데이터를 서버 메모리(RAM)에 저장해두고,
  다음 요청 시에는 DB 대신 메모리에서 빠르게 꺼내 쓰는 방식입니다.

  rankingCache 객체는 아래 4가지 정보를 보관합니다.
*/
let rankingCache = {
    data          : null,  // DB에서 가져온 전체 랭킹 데이터 (처음엔 비어있음)
    updatedAt     : null,  // 가장 최근에 캐시가 갱신된 시각
    lastSuccessAt : null,  // 가장 최근에 DB 조회에 성공한 시각
    failCount     : 0,     // DB 조회 연속 실패 횟수 (오류 감지용)
};


// ────────────────────────────────────────────────
// 🔢 랭킹 계산 함수 (DB에서 데이터를 가져와 캐시에 저장)
// ────────────────────────────────────────────────

/*
  async 키워드 : 이 함수 안에서 await를 사용할 수 있게 해줍니다.
  await 키워드 : DB 응답처럼 시간이 걸리는 작업이 끝날 때까지 기다립니다.
*/
const calculateRanking = async () => {
    try {
        // DB 연결 풀을 가져옵니다
        const pool = getPool();

        /*
          ▼ SQL 쿼리 설명 ▼

          [목표] users 테이블의 모든 유저에 대해
                 immersions(몰입 기록) 테이블을 LEFT JOIN하여
                 유저별 통계를 계산합니다.

          LEFT JOIN이란?
            - users 테이블을 기준으로, 몰입 기록이 없는 유저도
              결과에 포함시킵니다. (기록이 없으면 0으로 표시)

          COALESCE(값, 0) : 값이 NULL이면 0으로 대체합니다.

          TIMESTAMPDIFF(MINUTE, 시작시간, 종료시간)
            : 두 시간의 차이를 '분' 단위로 계산합니다.

          GREATEST(값, 0)
            : 음수가 나오지 않도록 0보다 작으면 0으로 고정합니다.
              (예: 잘못된 데이터로 시작시간 > 종료시간이 된 경우 방지)

          ▼ 계산하는 지표 3가지 ▼
            - total_minutes   : 전체 몰입 시간 합계 (분)
            - max_minutes     : 단일 세션 최대 몰입 시간 (분)
            - composite_score : total_minutes + max_minutes
                                (종합 점수 = 꾸준함 + 집중력)

          ▼ 필터 조건 ▼
            - end_time > '00:00:00' : 종료 시간이 기록된 세션만 포함
            - imm_score > 0         : 점수가 있는 유효한 세션만 포함

          ▼ 정렬 기준 ▼
            1순위: composite_score 높은 순
            2순위: (점수가 같을 경우) total_minutes 높은 순
        */
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
                ON  i.user_idx = u.user_idx
                AND i.end_time > '00:00:00'   -- 종료 시간이 기록된 세션만
                AND i.imm_score > 0           -- 유효한 점수가 있는 세션만

            GROUP BY u.user_idx, u.nick       -- 유저별로 묶어서 집계
            ORDER BY composite_score DESC,    -- 종합 점수 높은 순
                     total_minutes DESC       -- 점수 동일 시 총 시간 높은 순
        `);

        // DB 조회 성공 → 캐시를 새로운 데이터로 교체합니다
        rankingCache = {
            data          : allRanking,   // 새로 받아온 랭킹 데이터
            updatedAt     : new Date(),   // 현재 시각을 갱신 시각으로 기록
            lastSuccessAt : new Date(),   // 성공 시각도 기록
            failCount     : 0,            // 성공했으니 실패 횟수를 0으로 초기화
        };

        console.log(`✅ 랭킹 캐시 갱신 완료 - ${new Date().toLocaleString('ko-KR')}`);

    } catch (err) {
        /*
          DB 조회 중 오류가 발생한 경우
          기존 캐시 데이터는 그대로 유지하면서 실패 횟수만 증가시킵니다.
          (오류가 나도 이전 캐시 데이터는 계속 서비스 가능)
        */
        rankingCache.failCount = (rankingCache.failCount || 0) + 1;

        console.error(`❌ 랭킹 캐시 갱신 실패 (${rankingCache.failCount}회):`, err.message);

        // 연속으로 3회 이상 실패하면 심각한 오류로 판단하여 경고를 출력합니다
        if (rankingCache.failCount >= 3) {
            console.error('🚨 랭킹 캐시 갱신 3회 연속 실패! DB 연결 상태를 확인하세요.');
        }
    }
};


// ────────────────────────────────────────────────
// 📖 캐시에서 랭킹 읽기 함수
// ────────────────────────────────────────────────

/*
  매 API 요청마다 DB를 조회하지 않고,
  메모리에 저장된 rankingCache에서 데이터를 꺼내 반환합니다.

  @param {number} uid - 현재 로그인한 유저의 user_idx
  @returns 아래 형태의 객체를 반환합니다:
    {
      top10      : 상위 10명 랭킹 배열,
      myRank     : 내 순위 (숫자),
      myData     : 내가 TOP 10 밖일 때 내 정보 (TOP 10이면 null),
      isInTop10  : 내가 TOP 10 안에 있는지 여부 (true/false),
      updatedAt  : 캐시가 마지막으로 갱신된 시각,
    }
*/
const getRankingFromCache = (uid) => {
    const allRanking = rankingCache.data;

    // 캐시 데이터가 아직 없으면 (서버 막 시작 직후 등) null을 반환합니다
    if (!allRanking) return null;

    // ── TOP 10 추출 ──────────────────────────────
    // allRanking 배열의 앞에서 10개를 잘라내어
    // 각 유저에게 순위(rank)와 본인 여부(is_me)를 붙입니다.
    const top10 = allRanking.slice(0, 10).map((r, idx) => ({
        rank            : idx + 1,              // idx는 0부터 시작하므로 +1
        user_idx        : r.user_idx,
        nick            : r.nick,
        total_minutes   : Number(r.total_minutes),    // DB에서 문자열로 올 수 있어 숫자로 변환
        max_minutes     : Number(r.max_minutes),
        composite_score : Number(r.composite_score),
        is_me           : r.user_idx === uid,         // 현재 유저이면 true
    }));

    // ── 내 순위 계산 ─────────────────────────────
    // findIndex : 조건에 맞는 첫 번째 요소의 인덱스를 반환합니다 (없으면 -1)
    const myRankIdx  = allRanking.findIndex(r => r.user_idx === uid);
    const myRank     = myRankIdx + 1;              // 인덱스는 0부터이므로 +1 (없으면 0이 됨)
    const isInTop10  = myRank <= 10 && myRank > 0; // 1~10위 사이인지 확인

    // ── 내 데이터 구성 ───────────────────────────
    // myRankIdx가 -1이면 랭킹에 없는 유저이므로 null로 처리합니다
    const myData = myRankIdx >= 0 ? {
        rank            : myRank,
        user_idx        : allRanking[myRankIdx].user_idx,
        nick            : allRanking[myRankIdx].nick,
        total_minutes   : Number(allRanking[myRankIdx].total_minutes),
        max_minutes     : Number(allRanking[myRankIdx].max_minutes),
        composite_score : Number(allRanking[myRankIdx].composite_score),
        is_me           : true,
    } : null;

    return {
        top10,
        myRank,
        // 내가 이미 TOP 10 안에 있으면 myData를 따로 보낼 필요가 없으므로 null 처리
        myData    : isInTop10 ? null : myData,
        isInTop10,
        updatedAt : rankingCache.updatedAt, // 클라이언트에게 캐시 갱신 시각도 전달
    };
};


// ────────────────────────────────────────────────
// ⏰ 자동 갱신 스케줄러 등록 함수
// ────────────────────────────────────────────────

/*
  cron 표현식 형식 : '분 시 일 월 요일'
  예시:
    '0 0 * * *'  → 매일 자정(00:00)에 실행
    '0 * * * *'  → 매 시간 정각에 실행
    '* * * * *'  → 매 1분마다 실행

  startRankingCron() 이 호출되면:
    1. 서버 시작 즉시 랭킹을 한 번 계산합니다.
    2. 이후 매일 자정에 자동으로 랭킹을 갱신합니다.
*/
const startRankingCron = () => {
    // 서버가 켜질 때 캐시가 비어있으면 아무것도 서비스할 수 없으므로
    // 스케줄 등록 전에 즉시 1회 실행합니다
    calculateRanking();

    // cron.schedule(표현식, 실행할 함수)
    // '0 0 * * *' → 매일 자정 00:00에 calculateRanking 실행
    cron.schedule('0 0 * * *', () => {
        calculateRanking();
    });

    console.log('🕐 랭킹 캐시 스케줄러 시작 (매일 자정에 한 번 갱신)');
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기 (다른 파일에서 사용할 수 있도록)
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일에서 만든 함수들을 외부에서 require()로 불러올 수 있게 합니다.
    - startRankingCron   : 서버 시작 시 1회 호출하여 스케줄러를 등록
    - getRankingFromCache : 랭킹 API 핸들러에서 호출하여 캐시 데이터를 읽음
    - calculateRanking   : 필요 시 수동으로 캐시를 즉시 갱신할 때 사용
*/
module.exports = { startRankingCron, getRankingFromCache, calculateRanking };
