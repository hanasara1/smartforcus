// server/src/controllers/timelapse.controller.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  getPool : DB 연결 풀을 가져오는 함수입니다.
            풀(pool)이란? DB 연결을 여러 개 미리 만들어두고 재사용하는 방식으로
            매 요청마다 새로운 연결을 생성하는 비용을 줄여 속도를 향상시킵니다.
*/
const { getPool } = require('../config/db.config');


// ────────────────────────────────────────────────
// 🎞️ 타임랩스 저장 컨트롤러
// ────────────────────────────────────────────────

/*
  POST /api/timelapses

  [역할]
  집중 세션 중 촬영된 타임랩스의 파일명을 받아 DB에 저장합니다.
  파일 자체는 별도의 스토리지에 저장되며, 이 컨트롤러는 파일명(참조값)만 기록합니다.
  본인 소유의 세션에만 저장할 수 있도록 소유자 검증을 수행합니다.

  [처리 순서]
    1. 요청 바디에서 세션 ID(imm_idx)와 파일명(file_name)을 꺼냅니다.
    2. 필수 값 누락 여부를 검증합니다.
    3. imm_idx와 user_idx로 세션 소유자를 검증합니다.
    4. timelapses 테이블에 파일명과 현재 시각을 INSERT합니다.
    5. 저장된 파일명을 응답으로 반환합니다.

  ▼ 파일명만 저장하는 이유 ▼
    실제 이미지 파일은 서버 디스크나 외부 스토리지(S3 등)에 저장됩니다.
    DB에는 해당 파일을 찾을 수 있는 파일명(경로 키)만 저장하여
    DB 용량을 절약하고 파일 관리를 분리합니다.

  @param {number} req.body.imm_idx   - 타임랩스가 속한 집중 세션의 고유 ID
  @param {string} req.body.file_name - 저장할 타임랩스 파일명
  @returns 201 : 저장 성공 + file_name
           400 : imm_idx 또는 file_name 누락
           403 : 본인 세션이 아닌 경우
*/
exports.createTimelapse = async (req, res, next) => {
  try {
    const pool = getPool();

    // 요청 바디에서 세션 ID와 파일명을 꺼냅니다
    const { imm_idx, file_name } = req.body;

    // ── 필수 값 검증 ─────────────────────────────────────
    // 두 값 중 하나라도 없으면 저장할 수 없으므로 400을 반환합니다
    if (!imm_idx || !file_name) {
      return res.status(400).json({ message: 'imm_idx와 file_name이 필요합니다.' });
    }

    // ── 세션 소유자 확인 ─────────────────────────────────
    /*
      imm_idx와 user_idx를 동시에 조건으로 걸어 조회합니다.
      두 조건이 모두 일치해야 결과가 반환되므로,
      다른 유저의 세션 ID를 입력해도 타임랩스를 저장할 수 없습니다.
    */
    const [[session]] = await pool.query(
      'SELECT imm_idx FROM immersions WHERE imm_idx = ? AND user_idx = ?',
      [imm_idx, req.user.user_idx]   // JWT 미들웨어가 주입한 현재 유저 ID 사용
    );
    // 세션이 없거나 소유자가 다르면 403 반환
    if (!session) {
      return res.status(403).json({
        success: false,
        message: '본인의 세션에만 타임랩스를 저장할 수 있습니다.',
      });
    }

    // ── 타임랩스 파일명 저장 ─────────────────────────────
    /*
      NOW() : MySQL 함수로 현재 시각을 자동으로 삽입합니다.
              JS에서 날짜를 생성하여 전달하는 대신 DB 서버 시각을 사용하므로
              서버 간 시각 불일치 문제를 방지합니다.
    */
    await pool.query(
      `INSERT INTO timelapses (imm_idx, file_name, created_at) VALUES (?, ?, NOW())`,
      [imm_idx, file_name]
    );

    return res.status(201).json({
      success: true,
      message: '타임랩스 파일명 저장 완료',
      data: { file_name },  // 저장된 파일명을 클라이언트에 확인용으로 반환합니다
    });

  } catch (err) {
    next(err);  // 예상치 못한 오류는 Express 에러 핸들러로 전달
  }
};


// ────────────────────────────────────────────────
// 🔍 타임랩스 목록 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/timelapses/:imm_idx

  [역할]
  특정 집중 세션에 속한 타임랩스 파일명 목록을 조회합니다.
  촬영 시각(created_at) 오름차순으로 정렬하여 반환하므로
  클라이언트에서 촬영 순서대로 타임랩스를 재생할 수 있습니다.

  [처리 순서]
    1. URL 파라미터에서 세션 ID(imm_idx)를 꺼냅니다.
    2. 해당 세션의 타임랩스 전체를 촬영 시각 오름차순으로 조회합니다.
    3. 결과 배열을 반환합니다. (타임랩스가 없으면 빈 배열)

  ▼ createTimelapse와의 차이점 ▼
    createTimelapse : 소유자 검증 후 저장 (쓰기)
    getTimelapses   : 소유자 검증 없이 조회 (읽기)
                      리포트 조회 등 다른 컨트롤러에서도 호출될 수 있어
                      접근 범위를 열어둡니다.

  @param {string} req.params.imm_idx - 타임랩스를 조회할 세션의 고유 ID
  @returns 200 : 타임랩스 목록 배열 (촬영 시각 오름차순, 없으면 빈 배열)
*/
exports.getTimelapses = async (req, res, next) => {
  try {
    const pool = getPool();
    const { imm_idx } = req.params;   // URL 파라미터에서 세션 ID 추출

    /*
      ORDER BY created_at ASC : 촬영된 순서대로 정렬합니다.
      타임랩스는 시간 순서가 중요하므로 오름차순(ASC)을 사용합니다.
      해당 세션의 타임랩스가 없으면 빈 배열([])이 반환됩니다.
    */
    const [rows] = await pool.query(
      `SELECT * FROM timelapses WHERE imm_idx = ? ORDER BY created_at ASC`,
      [imm_idx]
    );

    return res.json({ success: true, data: rows });

  } catch (err) {
    console.error('타임랩스 조회 에러:', err);
    next(err);  // 예상치 못한 오류는 Express 에러 핸들러로 전달
  }
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  이 파일은 module.exports 방식 대신 exports.함수명 방식으로 개별 내보내기를 사용합니다.
  두 방식은 동일하게 동작하며, 다른 파일에서 require()로 불러올 수 있습니다.
    - exports.createTimelapse : 타임랩스 저장 라우터에 연결
    - exports.getTimelapses   : 타임랩스 목록 조회 라우터에 연결
*/
