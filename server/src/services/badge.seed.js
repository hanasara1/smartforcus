// ─────────────────────────────────────────────────────────
// server/src/services/badge.seed.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');

// logger : console.log 대신 사용하는 로깅 유틸리티 (레벨별 출력 및 파일 저장 등을 지원)
const logger = require('../utils/logger');


// ────────────────────────────────────────────────
// 🏅 기본 뱃지 데이터 정의
// ────────────────────────────────────────────────

/*
  DEFAULT_BADGES :
    서버 최초 실행 시 badges 테이블에 삽입할 기본 뱃지 목록입니다.
    badges 테이블이 비어있을 때만 삽입되며, 이미 데이터가 있으면 건너뜁니다.

  ▼ 각 필드 설명 ▼
    badge_name  : 뱃지 이름 (이모지 포함, 클라이언트 UI에 표시)
    badge_desc  : 뱃지 획득 조건 설명
    badge_point : 뱃지 구매에 필요한 포인트 (0이면 무료 뱃지)
*/
const DEFAULT_BADGES = [
  { badge_name: '🌱 첫 걸음',    badge_desc: '첫 집중 세션을 완료했습니다.',      badge_point: 0   },
  { badge_name: '⭐ 집중왕',     badge_desc: '집중 점수 90점 이상 달성',           badge_point: 100 },
  { badge_name: '🔥 연속 3일',   badge_desc: '3일 연속 집중 세션 완료',            badge_point: 150 },
  { badge_name: '💎 포인트 부자', badge_desc: '누적 포인트 500P 달성',             badge_point: 200 },
  { badge_name: '🦅 자세 마스터', badge_desc: '자세 오류 없이 30분 집중',          badge_point: 300 },
  { badge_name: '🌙 야행성',     badge_desc: '오후 10시 이후 집중 세션 완료',      badge_point: 50  },
  { badge_name: '🌅 얼리버드',   badge_desc: '오전 7시 이전 집중 세션 완료',      badge_point: 50  },
  { badge_name: '📚 공부벌레',   badge_desc: '하루 총 2시간 이상 집중',            badge_point: 250 },
];


// ────────────────────────────────────────────────
// 🌱 뱃지 시드 함수
// ────────────────────────────────────────────────

/*
  seedBadges()

  [역할]
  서버가 처음 실행될 때 badges 테이블에 기본 뱃지 데이터를 삽입합니다.
  이미 데이터가 존재하면 중복 삽입을 방지하기 위해 즉시 종료합니다.
  app.js 또는 서버 초기화 코드에서 1회 호출합니다.

  ▼ 시드(Seed)란? ▼
    애플리케이션이 정상적으로 동작하기 위해 필요한 초기 데이터를
    DB에 미리 삽입하는 작업을 말합니다.
    개발 환경 초기 세팅이나 서버 최초 배포 시 유용합니다.

  [처리 순서]
    1. badges 테이블의 현재 행 수(cnt)를 조회합니다.
    2. 행이 1개 이상이면 이미 시드가 완료된 것으로 판단하고 함수를 종료합니다.
    3. DEFAULT_BADGES 배열을 MySQL의 다중 행 INSERT 형식으로 변환합니다.
    4. 한 번의 쿼리로 전체 뱃지를 일괄 삽입합니다.

  ▼ 다중 행 INSERT 방식 ▼
    VALUES ? 에 2차원 배열을 전달하면 MySQL이 여러 행을 한 번의 쿼리로 삽입합니다.
    개별 INSERT를 반복하는 것보다 DB 왕복 횟수를 줄여 성능이 더 좋습니다.
    (예: [[name1, desc1, point1], [name2, desc2, point2], ...])
*/
const seedBadges = async () => {
  try {
    const pool = getPool();

    // ── 기존 데이터 존재 여부 확인 ──────────────────────
    /*
      COUNT(*) AS cnt : badges 테이블의 전체 행 수를 조회합니다.
      cnt > 0 이면 이미 시드 데이터가 삽입된 것으로 판단하여 함수를 종료합니다.
      중복 실행으로 데이터가 늘어나는 것을 방지합니다.
    */
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM badges');
    if (cnt > 0) return;  // 이미 데이터가 있으면 삽입하지 않고 종료합니다

    // ── 다중 행 INSERT 데이터 준비 ───────────────────────
    /*
      DEFAULT_BADGES 배열을 [badge_name, badge_desc, badge_point] 형태의
      2차원 배열(values)로 변환합니다.
      MySQL의 'INSERT INTO ... VALUES ?' 문법에 2차원 배열을 전달하면
      여러 행을 한 번의 쿼리로 삽입할 수 있습니다.
    */
    const values = DEFAULT_BADGES.map(b => [b.badge_name, b.badge_desc, b.badge_point]);

    // ── 기본 뱃지 일괄 삽입 ─────────────────────────────
    // 한 번의 쿼리로 DEFAULT_BADGES 전체를 badges 테이블에 삽입합니다
    await pool.query(
      'INSERT INTO badges (badge_name, badge_desc, badge_point) VALUES ?',
      [values]  // 2차원 배열을 배열로 한 번 더 감싸야 MySQL 드라이버가 올바르게 처리합니다
    );

    logger.info(`✅ 기본 뱃지 ${DEFAULT_BADGES.length}개 삽입 완료`);

  } catch (err) {
    // 시드 오류는 서버 실행을 중단시키지 않고 로그만 남깁니다
    logger.error('뱃지 시드 오류:', err.message);
  }
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수를 다른 파일에서 require()로 사용할 수 있게 합니다.
    - seedBadges : 서버 초기화 시 1회 호출하여 기본 뱃지 데이터를 삽입
                   (예: app.js에서 서버 시작 전 await seedBadges() 호출)
*/
module.exports = { seedBadges };
