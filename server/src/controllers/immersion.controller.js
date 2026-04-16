// server/src/controllers/immersion.controller.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');

/*
  processSessionComplete : 집중 세션 종료 시 포인트 지급을 처리하는 서비스 함수입니다.
                           세션 시간, 점수, 연속 기록 등을 종합하여
                           지급할 포인트 항목과 최고 기록 갱신 여부를 반환합니다.
*/
const { processSessionComplete } = require('../services/point.service');


// ────────────────────────────────────────────────
// ▶️ 집중 세션 시작 컨트롤러
// ────────────────────────────────────────────────

/*
  POST /api/immersions

  [역할]
  유저가 집중 세션을 시작할 때 호출됩니다.
  시작 날짜와 시작 시각을 받아 immersions 테이블에 새 행을 생성합니다.
  세션이 아직 진행 중이므로 종료 시각(end_time)은 '00:00:00', 점수(imm_score)는 0으로 초기화합니다.

  [처리 순서]
    1. 요청 바디에서 날짜(imm_date)와 시작 시각(start_time)을 꺼냅니다.
    2. immersions 테이블에 새 세션 행을 INSERT합니다.
    3. 생성된 세션의 고유 ID(imm_idx)를 응답으로 반환합니다.

  @param {string} req.body.imm_date    - 집중 세션 날짜 (예: '2024-01-15')
  @param {string} req.body.start_time  - 세션 시작 시각 (예: '09:30:00')
  @returns 201 : 세션 생성 성공 + 생성된 imm_idx
*/
const startSession = async (req, res, next) => {
  try {
    const pool = getPool();

    // 요청 바디에서 날짜와 시작 시각을 꺼냅니다
    const { imm_date, start_time } = req.body;

    /*
      end_time을 '00:00:00'으로, imm_score를 0으로 초기화하여 INSERT합니다.
      세션이 종료될 때 endSession 컨트롤러에서 해당 값들이 업데이트됩니다.
      result.insertId : MySQL이 자동 생성한 이 행의 기본키(imm_idx) 값입니다.
    */
    const [result] = await pool.query(
      `INSERT INTO immersions (user_idx, imm_date, start_time, end_time, imm_score)
       VALUES (?, ?, ?, '00:00:00', 0)`,
      [req.user.user_idx, imm_date, start_time]   // JWT 미들웨어가 주입한 현재 유저 ID 사용
    );

    res.status(201).json({ success: true, data: { imm_idx: result.insertId } });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// ⏹️ 집중 세션 종료 컨트롤러
// ────────────────────────────────────────────────

/*
  PATCH /api/immersions/:imm_idx/end

  [역할]
  진행 중인 집중 세션을 종료하고, 세션 결과를 저장한 뒤 포인트를 지급합니다.
  세션 소유자 검증을 먼저 수행하여 다른 유저의 세션을 조작하지 못하도록 보호합니다.

  [처리 순서]
    1. URL 파라미터에서 세션 ID(imm_idx)를 꺼냅니다.
    2. 해당 세션이 현재 유저의 것인지 DB에서 검증합니다.
    3. 종료 시각, 점수, 최고 연속 집중 횟수를 UPDATE합니다.
    4. processSessionComplete로 포인트를 계산하고 지급합니다.
    5. 지급 결과(포인트 항목, 최고 기록 여부)를 응답으로 반환합니다.

  ▼ max_good_streak이란? ▼
    세션 중 '좋음' 상태가 연속으로 이어진 최대 횟수입니다.
    기본값은 0으로, 클라이언트가 값을 보내지 않아도 오류가 나지 않습니다.

  @param {string} req.params.imm_idx       - 종료할 세션의 고유 ID
  @param {string} req.body.end_time        - 세션 종료 시각 (예: '10:45:00')
  @param {number} req.body.imm_score       - 세션 집중 점수
  @param {number} req.body.max_good_streak - 세션 중 최고 연속 집중 횟수 (기본값: 0)
  @returns 200 : 세션 종료 성공 + 포인트 지급 결과
           404 : 세션 없음 또는 소유자 불일치
*/
const endSession = async (req, res, next) => {
  try {
    const pool = getPool();

    // 기본값(= 0) 설정 : 클라이언트가 max_good_streak을 보내지 않으면 0으로 처리합니다
    const { end_time, imm_score, max_good_streak = 0 } = req.body;
    const { imm_idx } = req.params;   // URL 파라미터에서 세션 ID 추출

    // ── 세션 소유자 확인 ─────────────────────────────────
    /*
      imm_idx와 user_idx를 동시에 조건으로 걸어 조회합니다.
      두 조건이 모두 일치해야 결과가 반환되므로,
      다른 유저의 세션 ID를 입력해도 접근할 수 없습니다.
    */
    const [[session]] = await pool.query(
      'SELECT * FROM immersions WHERE imm_idx = ? AND user_idx = ?',
      [imm_idx, req.user.user_idx]
    );
    // 세션이 없거나 소유자가 다르면 404 반환
    if (!session) return res.status(404).json({ success: false, message: '세션을 찾을 수 없습니다.' });

    // ── 세션 종료 정보 저장 ──────────────────────────────
    // 시작 시 '00:00:00'과 0으로 초기화했던 값들을 실제 결과로 업데이트합니다
    await pool.query(
      'UPDATE immersions SET end_time = ?, imm_score = ?, max_good_streak = ? WHERE imm_idx = ?',
      [end_time, imm_score, max_good_streak, imm_idx]
    );

    // ── 포인트 지급 처리 ─────────────────────────────────
    /*
      processSessionComplete(user_idx, imm_idx) :
        방금 업데이트된 세션 데이터를 기반으로 포인트를 계산하고 DB에 기록합니다.
        반환값 구조:
          - earnedPoints  : 지급된 포인트 항목 배열 (예: [{ type: 'session', point: 10 }])
          - isNewRecord   : 이번 세션이 유저의 최고 기록을 갱신했는지 여부 (true/false)
    */
    const pointResult = await processSessionComplete(req.user.user_idx, imm_idx);

    console.log(`✅ 세션 포인트 지급 - ${pointResult.earnedPoints.map(p => `${p.type} +${p.point}P`).join(', ')}`);
    if (pointResult.isNewRecord) {
      console.log(`🏆 최고 기록 갱신!`);
    }

    // ── 최종 응답 ────────────────────────────────────────
    /*
      클라이언트가 포인트 지급 결과를 즉시 UI에 반영할 수 있도록
      지급 항목, 최고 기록 여부, 총 획득 포인트를 함께 전달합니다.

      reduce((sum, p) => sum + p.point, 0) :
        earnedPoints 배열의 point 값을 모두 더하여 총 획득 포인트를 계산합니다.
        초기값은 0입니다.
    */
    res.json({
      success: true,
      message: '집중 세션이 종료되었습니다.',
      data: {
        earned_points : pointResult.earnedPoints,                                       // 지급된 포인트 항목 목록
        is_new_record : pointResult.isNewRecord,                                        // 최고 기록 갱신 여부
        total_earned  : pointResult.earnedPoints.reduce((sum, p) => sum + p.point, 0),  // 이번 세션 총 획득 포인트
      },
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📋 집중 기록 목록 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/immersions

  [역할]
  현재 로그인한 유저의 집중 세션 기록 전체를 페이지 단위로 조회합니다.
  각 세션에 집중 지속 시간(duration_min)을 계산하여 함께 반환합니다.

  [처리 순서]
    1. 쿼리 파라미터에서 페이지 번호(page)와 페이지 크기(limit)를 꺼냅니다.
    2. offset을 계산하여 해당 페이지의 데이터만 조회합니다.
    3. 전체 레코드 수(total)를 추가로 조회하여 페이지네이션 메타 정보를 구성합니다.
    4. 세션 목록과 메타 정보를 함께 반환합니다.

  ▼ 페이지네이션(Pagination)이란? ▼
    데이터를 한 번에 모두 가져오지 않고 일정 개수씩 나눠 가져오는 방식입니다.
    LIMIT : 한 번에 가져올 최대 행 수
    OFFSET : 앞에서 건너뛸 행 수 (예: page 2, limit 10 → offset 10 → 11번째부터 조회)

  ▼ TIMESTAMPDIFF(MINUTE, 시작, 종료) ▼
    두 시각의 차이를 '분' 단위로 계산합니다.
    CONCAT으로 날짜와 시각을 합쳐 온전한 datetime 형식으로 만든 뒤 비교합니다.

  @param {number} req.query.page  - 조회할 페이지 번호 (기본값: 1)
  @param {number} req.query.limit - 한 페이지당 항목 수 (기본값: 10)
  @returns 200 : 세션 목록 배열 + 페이지네이션 메타 { total, page, limit }
*/
const getList = async (req, res, next) => {
  try {
    const pool = getPool();

    // 기본값 설정 : 쿼리 파라미터가 없으면 1페이지, 10개씩 조회합니다
    const { page = 1, limit = 10 } = req.query;

    // offset 계산 : (페이지 번호 - 1) × 페이지 크기 = 건너뛸 행 수
    const offset = (Number(page) - 1) * Number(limit);

    // 현재 페이지의 세션 목록을 조회하면서 각 세션의 집중 시간(분)을 함께 계산합니다
    const [rows] = await pool.query(
      `SELECT i.*,
              TIMESTAMPDIFF(MINUTE,
                CONCAT(i.imm_date,' ',i.start_time),
                CONCAT(i.imm_date,' ',i.end_time)) AS duration_min
       FROM immersions i
       WHERE i.user_idx = ?
       ORDER BY i.imm_date DESC, i.start_time DESC   -- 최신 날짜, 최근 시작 순으로 정렬
       LIMIT ? OFFSET ?`,
      [req.user.user_idx, Number(limit), offset]
    );

    // 전체 레코드 수를 별도로 조회하여 클라이언트가 총 페이지 수를 계산할 수 있게 합니다
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM immersions WHERE user_idx = ?',
      [req.user.user_idx]
    );

    res.json({
      success : true,
      data    : rows,
      meta    : { total, page: Number(page), limit: Number(limit) },  // 페이지네이션 메타 정보
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 🔍 단일 세션 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/immersions/:imm_idx

  [역할]
  특정 세션 하나의 상세 정보를 조회합니다.
  imm_idx와 user_idx를 동시에 조건으로 걸어, 본인의 세션만 조회할 수 있도록 보호합니다.

  [처리 순서]
    1. URL 파라미터에서 세션 ID(imm_idx)를 꺼냅니다.
    2. 해당 세션이 현재 유저의 것인지 확인하며 조회합니다.
    3. 세션이 없거나 소유자가 다르면 404를 반환합니다.
    4. 세션 상세 정보와 집중 지속 시간(duration_min)을 함께 반환합니다.

  ▼ getList와의 차이점 ▼
    getList  : 목록 조회 (LIMIT, OFFSET 페이지네이션 적용, 여러 건)
    getOne   : 단건 조회 (특정 imm_idx 하나만, 상세 확인 용도)

  @param {string} req.params.imm_idx - 조회할 세션의 고유 ID
  @returns 200 : 세션 상세 정보 (duration_min 포함)
           404 : 세션 없음 또는 소유자 불일치
*/
const getOne = async (req, res, next) => {
  try {
    const pool = getPool();

    /*
      imm_idx와 user_idx를 모두 WHERE 조건에 포함하여
      본인 소유의 세션만 조회되도록 접근을 제한합니다.
      TIMESTAMPDIFF로 시작~종료 시각 차이를 분 단위로 계산하여 duration_min으로 반환합니다.
    */
    const [[session]] = await pool.query(
      `SELECT *, TIMESTAMPDIFF(MINUTE,
                  CONCAT(imm_date,' ',start_time),
                  CONCAT(imm_date,' ',end_time)) AS duration_min
       FROM immersions WHERE imm_idx = ? AND user_idx = ?`,
      [req.params.imm_idx, req.user.user_idx]
    );

    // 세션이 없거나 소유자가 다르면 404 반환
    if (!session) return res.status(404).json({ success: false, message: '세션을 찾을 수 없습니다.' });

    res.json({ success: true, data: session });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - startSession : 세션 시작 라우터에 연결
    - endSession   : 세션 종료 라우터에 연결
    - getList      : 세션 목록 조회 라우터에 연결
    - getOne       : 단일 세션 조회 라우터에 연결
*/
module.exports = { startSession, endSession, getList, getOne };
