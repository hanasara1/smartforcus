// server/src/controllers/point.controller.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');


// ────────────────────────────────────────────────
// 💰 포인트 내역 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/points

  [역할]
  현재 로그인한 유저의 포인트 적립·차감 내역을 페이지 단위로 조회합니다.
  내역 목록과 함께 현재 보유 포인트 합계, 전체 내역 수, 총 페이지 수를
  메타 정보로 묶어 반환하여 클라이언트가 페이지네이션 UI를 구성할 수 있게 합니다.

  [처리 순서]
    1. 쿼리 파라미터에서 page와 limit을 꺼내고 유효 범위로 보정합니다.
    2. offset을 계산하여 해당 페이지의 포인트 내역을 조회합니다.
    3. 유저의 현재 포인트 잔액 합계(total)를 조회합니다.
    4. 전체 내역 행 수(count)를 조회합니다.
    5. 내역 목록과 메타 정보를 함께 응답으로 반환합니다.

  ▼ 입력값 보정 설명 ▼
    Math.max(1, ...) :
      page가 0 이하의 값으로 들어오더라도 최솟값 1로 고정합니다.
      (예: page=0 → 1, page=-5 → 1)

    Math.min(50, ...) :
      limit이 너무 크게 들어오면 한 번에 너무 많은 데이터를 조회하게 되므로
      최댓값 50으로 제한합니다. 기본값은 20입니다.
      (예: limit=100 → 50, limit=5 → 5)

    parseInt(...) || 기본값 :
      숫자가 아닌 값이 들어오면 parseInt가 NaN을 반환하고,
      NaN은 falsy이므로 || 뒤의 기본값이 사용됩니다.
      (예: page='abc' → NaN → 1)

  ▼ 포인트 잔액(total) 계산 방식 ▼
    포인트는 차감 시 음수(-)값으로 INSERT됩니다.
    따라서 SUM(reward_point)를 하면 충전 - 차감이 자동으로 계산되어 현재 잔액이 나옵니다.
    내역이 없어 SUM이 NULL을 반환할 경우 COALESCE로 0으로 대체합니다.

  @param {number} req.query.page  - 조회할 페이지 번호 (기본값: 1, 최솟값: 1)
  @param {number} req.query.limit - 한 페이지당 항목 수 (기본값: 20, 최댓값: 50)
  @returns 200 : 포인트 내역 배열 + 메타 { total, count, page, limit, totalPages }
*/
const getHistory = async (req, res, next) => {
  try {
    const pool = getPool();

    // ── 페이지네이션 파라미터 보정 ───────────────────────
    const page   = Math.max(1,  parseInt(req.query.page)  || 1);   // 최솟값 1 보장
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);  // 최댓값 50 제한
    const offset = (page - 1) * limit;  // 건너뛸 행 수 계산 (예: page 2, limit 20 → offset 20)

    // ── 포인트 내역 목록 조회 ────────────────────────────
    // 가장 최근에 적립·차감된 내역이 먼저 오도록 earned_at 기준 내림차순 정렬합니다
    const [rows] = await pool.query(
      `SELECT * FROM points
       WHERE user_idx = ?
       ORDER BY earned_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.user_idx, limit, offset]  // JWT 미들웨어가 주입한 현재 유저 ID 사용
    );

    // ── 현재 포인트 잔액 합계 조회 ──────────────────────
    /*
      SUM(reward_point) : 충전(양수) + 차감(음수)을 모두 합산하여 현재 잔액을 계산합니다.
      COALESCE(..., 0)  : 내역이 없어 SUM이 NULL이면 0으로 대체합니다.
    */
    const [[{ total }]] = await pool.query(
      'SELECT COALESCE(SUM(reward_point), 0) AS total FROM points WHERE user_idx = ?',
      [req.user.user_idx]
    );

    // ── 전체 내역 행 수 조회 ─────────────────────────────
    /*
      총 페이지 수(totalPages) 계산에 필요한 전체 행 수를 별도로 조회합니다.
      total(잔액 합계)과 count(행 수)는 의미가 다르므로 쿼리를 분리합니다.
    */
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM points WHERE user_idx = ?',
      [req.user.user_idx]
    );

    // ── 최종 응답 ────────────────────────────────────────
    /*
      totalPages : 전체 행 수를 페이지 크기로 나눈 올림값입니다.
                   (예: count=45, limit=20 → Math.ceil(45/20) = 3페이지)
                   클라이언트가 이 값으로 페이지네이션 버튼 수를 결정합니다.
    */
    res.json({
      success : true,
      data    : rows,
      meta    : {
        total      : total,               // 현재 보유 포인트 잔액 합계
        count      : count,               // 전체 내역 행 수
        page       : page,                // 현재 페이지 번호
        limit      : limit,               // 한 페이지당 항목 수
        totalPages : Math.ceil(count / limit),  // 전체 페이지 수
      },
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - getHistory : 포인트 내역 조회 라우터에 연결
*/
module.exports = { getHistory };
