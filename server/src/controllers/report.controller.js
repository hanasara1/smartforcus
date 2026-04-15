// server/src/controllers/report.controller.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');

/*
  generateAIFeedback : 세션 데이터를 기반으로 AI 피드백 텍스트를 생성하는 서비스 함수입니다.
                       세션 정보, 자세 통계, 평균 데시벨을 입력받아
                       AI가 분석한 집중도 피드백 문자열을 반환합니다.
*/
const { generateAIFeedback } = require('../services/feedback.service');

/*
  toMySQLDatetime : 현재 시각을 MySQL의 DATETIME 형식('YYYY-MM-DD HH:MM:SS')으로
                    변환하여 반환하는 유틸리티 함수입니다.
                    JS의 Date 객체는 MySQL이 직접 인식하지 못하므로 변환이 필요합니다.
*/
const { toMySQLDatetime } = require('../utils/dateUtil');


// ────────────────────────────────────────────────
// 📊 세션 상세 리포트 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/reports/:imm_idx

  [역할]
  특정 집중 세션의 상세 리포트를 조회합니다.
  세션 기본 정보, 자세 데이터, 소음 데이터, AI 피드백, 타임랩스를 한 번에 조합하고
  통계 요약(summary)을 계산하여 함께 반환합니다.

  [처리 순서]
    1. 세션(immersions) 조회 - 소유자 검증 포함
    2. 자세(poses) 조회 - 유형별 여러 행, count 높은 순 정렬
    3. 소음(noises) 조회 - 일반 소음 내역과 세션 평균을 분리
    4. 피드백(feedbacks) 조회
    5. 타임랩스(timelapses) 조회
    6. 통계 요약 계산 (불량 자세 수, 정상 자세 수, 평균 데시벨, 유형별 집계)

  ▼ 소음 데이터 분리 방식 ▼
    noises 테이블에서 obj_name = '세션평균'인 행은 세션 전체의 평균 소음 요약 데이터입니다.
    나머지 행은 실시간으로 감지된 개별 소음 이벤트입니다.
    filter와 find로 두 종류를 분리하여 각각 별도 필드로 반환합니다.

  ▼ 통계 계산 방식 ▼
    badPoses      : pose_type이 'NORMAL'이 아닌 행들의 count 합산 (불량 자세 총 횟수)
    goodPoses     : pose_type이 'NORMAL'인 행들의 count 합산 (정상 자세 총 횟수)
    avgDecibel    : noiseSummary가 있으면 해당 값 사용, 없으면 개별 소음의 평균 직접 계산
    poseTypeStat  : { 'NORMAL': 30, 'FORWARD_HEAD': 5, ... } 형태의 유형별 집계 객체
    noiseObjStat  : { '사람': 3, '음악': 2, ... } 형태의 소음 객체별 감지 횟수 집계

  @param {string} req.params.imm_idx - 조회할 세션의 고유 ID
  @returns 200 : 세션 상세 + 자세/소음/피드백/타임랩스 + 통계 요약
           404 : 세션 없음 또는 소유자 불일치
*/
const getReport = async (req, res, next) => {
  try {
    const pool = getPool();
    const { imm_idx } = req.params;   // URL 파라미터에서 세션 ID 추출

    // ── 1. 세션 조회 ─────────────────────────────────────
    /*
      imm_idx와 user_idx를 동시에 조건으로 걸어 본인 세션만 조회합니다.
      TIMESTAMPDIFF로 시작~종료 시각 차이를 분 단위로 계산하여 duration_min으로 반환합니다.
    */
    const [[immersion]] = await pool.query(
      `SELECT *, TIMESTAMPDIFF(MINUTE,
                  CONCAT(imm_date,' ',start_time),
                  CONCAT(imm_date,' ',end_time)) AS duration_min
       FROM immersions WHERE imm_idx = ? AND user_idx = ?`,
      [imm_idx, req.user.user_idx]
    );
    // 세션이 없거나 소유자가 다르면 404 반환
    if (!immersion) return res.status(404).json({ success: false, message: '리포트를 찾을 수 없습니다.' });

    // ── 2. 자세 조회 ─────────────────────────────────────
    // 자세 유형(pose_type)별로 여러 행이 존재하며, count가 높은 유형 순으로 정렬합니다
    const [poses] = await pool.query(
      'SELECT * FROM poses WHERE imm_idx = ? ORDER BY count DESC',
      [imm_idx]
    );

    // ── 3. 소음 조회 ─────────────────────────────────────
    /*
      noises 테이블에는 두 종류의 데이터가 혼재합니다.
        - 일반 행 : 실시간으로 감지된 개별 소음 이벤트
        - 요약 행 : obj_name = '세션평균'인 행 (세션 전체 평균 데시벨)
      filter로 일반 소음 내역만 추출하고, find로 세션 평균 요약 행을 별도로 꺼냅니다.
    */
    const [allNoises] = await pool.query(
      'SELECT * FROM noises WHERE imm_idx = ? ORDER BY detected_at',
      [imm_idx]
    );
    const noises       = allNoises.filter(n => n.obj_name !== '세션평균');  // 개별 소음 이벤트
    const noiseSummary = allNoises.find(n => n.obj_name === '세션평균');    // 세션 평균 요약

    // ── 4. 피드백 조회 ───────────────────────────────────
    // imm_idx 기준으로 해당 세션의 AI 피드백을 생성 시각 오름차순으로 조회합니다
    const [feedbacks] = await pool.query(
      'SELECT * FROM feedbacks WHERE imm_idx = ? ORDER BY created_at',
      [imm_idx]
    );

    // ── 5. 타임랩스 조회 ─────────────────────────────────
    // 세션 중 촬영된 타임랩스 이미지 목록을 조회합니다
    const [timelapses] = await pool.query(
      'SELECT * FROM timelapses WHERE imm_idx = ?',
      [imm_idx]
    );

    // ── 6. 통계 요약 계산 ────────────────────────────────

    /*
      불량 자세 횟수 합산 : pose_type이 'NORMAL'이 아닌 모든 행의 count를 더합니다.
      p.count || 0 : count가 NULL인 경우를 0으로 처리합니다.
    */
    const badPoses = poses
      .filter(p => p.pose_type !== 'NORMAL')
      .reduce((sum, p) => sum + (p.count || 0), 0);

    // 정상 자세 횟수 합산 : pose_type이 'NORMAL'인 행의 count를 더합니다
    const goodPoses = poses
      .filter(p => p.pose_type === 'NORMAL')
      .reduce((sum, p) => sum + (p.count || 0), 0);

    /*
      평균 데시벨 계산 (우선순위 순서):
        1순위 : noiseSummary가 있으면 해당 행의 decibel 값을 그대로 사용합니다.
        2순위 : noiseSummary가 없고 개별 소음 내역이 있으면 평균을 직접 계산합니다.
        3순위 : 소음 데이터가 전혀 없으면 0으로 처리합니다.
      .toFixed(1) : 소수점 첫째 자리까지 표시합니다. (예: 42.3)
    */
    const avgDecibel = noiseSummary
      ? Number(noiseSummary.decibel).toFixed(1)
      : noises.length
        ? (noises.reduce((s, n) => s + Number(n.decibel), 0) / noises.length).toFixed(1)
        : 0;

    /*
      자세 유형별 집계 객체 생성 :
        poses 배열을 순회하며 { pose_type: count } 형태의 객체로 변환합니다.
        (예: { 'NORMAL': 30, 'FORWARD_HEAD': 5, 'ROUNDED_BACK': 3 })
    */
    const poseTypeStat = poses.reduce((acc, p) => {
      acc[p.pose_type] = p.count || 0;
      return acc;
    }, {});

    /*
      소음 객체별 감지 횟수 집계 :
        개별 소음 내역을 순회하며 { obj_name: 감지횟수 } 형태의 객체로 변환합니다.
        같은 obj_name이 여러 번 등장하면 누적하여 카운트합니다.
        (예: { '사람': 3, '음악': 2, '차량': 1 })
    */
    const noiseObjStat = noises.reduce((acc, n) => {
      acc[n.obj_name] = (acc[n.obj_name] || 0) + 1;
      return acc;
    }, {});

    // ── 최종 응답 ────────────────────────────────────────
    res.json({
      success: true,
      data: {
        immersion,    // 세션 기본 정보 + duration_min
        poses,        // 자세 유형별 데이터 배열
        noises,       // 개별 소음 이벤트 배열 (세션평균 제외)
        timelapses,   // 타임랩스 이미지 목록
        feedbacks,    // AI 피드백 목록
        summary: {
          badPoses,       // 불량 자세 총 횟수
          goodPoses,      // 정상 자세 총 횟수
          avgDecibel,     // 평균 데시벨 (소수점 1자리)
          poseTypeStat,   // 자세 유형별 집계 객체
          noiseObjStat,   // 소음 객체별 감지 횟수 객체
        },
      }
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📋 리포트 목록 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/reports

  [역할]
  현재 로그인한 유저의 완료된 집중 세션 목록을 페이지 단위로 조회합니다.
  각 세션에 집중 시간, 불량 자세 수, 소음 감지 횟수를 서브쿼리로 계산하여 함께 반환합니다.

  [처리 순서]
    1. 쿼리 파라미터에서 page와 limit을 꺼내고 유효 범위로 보정합니다.
    2. 완료된 세션(end_time > '00:00:00')만 필터링하여 페이지 단위로 조회합니다.
    3. 전체 완료 세션 수(total)를 조회하여 페이지네이션 메타 정보를 구성합니다.
    4. 세션 목록과 메타 정보를 함께 반환합니다.

  ▼ 완료 세션 필터 조건 ▼
    end_time > '00:00:00' : 세션 시작 시 end_time은 '00:00:00'으로 초기화되므로,
                            이 값보다 크다는 것은 세션이 정상적으로 종료되었다는 의미입니다.

  ▼ 서브쿼리 설명 ▼
    bad_pose_count  : 해당 세션의 불량 자세(NORMAL 제외) count 합계를 서브쿼리로 계산합니다.
    noise_count     : 해당 세션의 개별 소음 감지 횟수(세션평균 제외)를 서브쿼리로 계산합니다.
    JOIN 대신 서브쿼리를 사용하면 세션별 집계 값을 각 행에 바로 붙일 수 있습니다.

  @param {number} req.query.page  - 조회할 페이지 번호 (기본값: 1, 최솟값: 1)
  @param {number} req.query.limit - 한 페이지당 항목 수 (기본값: 10, 최댓값: 20)
  @returns 200 : 완료 세션 목록 배열 + 메타 { total, page, limit, totalPages }
*/
const getReportList = async (req, res, next) => {
  try {
    const pool = getPool();

    // ── 페이지네이션 파라미터 보정 ───────────────────────
    const page   = Math.max(1,  parseInt(req.query.page)  || 1);   // 최솟값 1 보장
    const limit  = Math.min(20, parseInt(req.query.limit) || 10);  // 최댓값 20 제한
    const offset = (page - 1) * limit;  // 건너뛸 행 수 계산

    // ── 완료된 세션 목록 조회 ────────────────────────────
    /*
      각 세션 행에 서브쿼리로 bad_pose_count와 noise_count를 계산하여 붙입니다.
      COALESCE(..., 0) : 해당 세션의 자세·소음 데이터가 없어 SUM/COUNT 결과가 NULL이면 0으로 대체합니다.
    */
    const [rows] = await pool.query(
      `SELECT i.*,
              TIMESTAMPDIFF(MINUTE,
                CONCAT(i.imm_date,' ',i.start_time),
                CONCAT(i.imm_date,' ',i.end_time)) AS duration_min,
              (SELECT COALESCE(SUM(p.count), 0) FROM poses p
               WHERE p.imm_idx = i.imm_idx
               AND p.pose_type != 'NORMAL') AS bad_pose_count,   -- 불량 자세 총 횟수
              (SELECT COUNT(*) FROM noises n
               WHERE n.imm_idx = i.imm_idx
               AND n.obj_name != '세션평균') AS noise_count       -- 개별 소음 감지 횟수
       FROM immersions i
       WHERE i.user_idx = ? AND i.end_time > '00:00:00'          -- 종료된 세션만 포함
       ORDER BY i.imm_date DESC, i.start_time DESC               -- 최신 날짜, 최근 시작 순 정렬
       LIMIT ? OFFSET ?`,
      [req.user.user_idx, limit, offset]
    );

    // ── 전체 완료 세션 수 조회 ───────────────────────────
    // totalPages 계산에 필요한 전체 행 수를 별도로 조회합니다
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM immersions
       WHERE user_idx = ? AND end_time > '00:00:00'`,
      [req.user.user_idx]
    );

    // ── 최종 응답 ────────────────────────────────────────
    res.json({
      success : true,
      data    : rows,
      meta    : {
        total,
        page,
        limit,
        totalPages : Math.ceil(total / limit),  // 전체 페이지 수 계산
      },
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 🤖 AI 피드백 생성 컨트롤러
// ────────────────────────────────────────────────

/*
  POST /api/reports/:imm_idx/feedback

  [역할]
  특정 세션에 대한 AI 피드백을 생성(또는 재생성)합니다.
  세션 정보, 자세 통계, 평균 데시벨을 AI 서비스에 전달하여 피드백 텍스트를 받고,
  feedbacks 테이블에 저장합니다. 기존 피드백이 있으면 UPDATE, 없으면 INSERT합니다.

  [처리 순서]
    1. 세션(immersions)을 조회하고 소유자를 검증합니다.
    2. 자세(poses) 데이터를 조회합니다.
    3. 세션 평균 데시벨을 noises 테이블에서 조회합니다.
    4. 자세 유형별 count 집계 객체(poseCount)를 생성합니다.
    5. generateAIFeedback으로 AI 피드백 텍스트를 생성합니다.
    6. 기존 피드백 존재 여부에 따라 UPDATE 또는 INSERT를 수행합니다.

  ▼ UPSERT 패턴 ▼
    이 함수는 UPSERT(UPDATE + INSERT) 패턴을 사용합니다.
    같은 세션에 피드백을 여러 번 요청해도 행이 중복되지 않고
    항상 가장 최근 피드백으로 교체됩니다.
      - 기존 피드백 있음 → UPDATE (fb_content, created_at 갱신)
      - 기존 피드백 없음 → INSERT (새 행 생성)

  @param {string} req.params.imm_idx - 피드백을 생성할 세션의 고유 ID
  @returns 200 : AI 피드백 텍스트
           404 : 세션 없음 또는 소유자 불일치
*/
const generateFeedback = async (req, res, next) => {
  try {
    const pool = getPool();
    const { imm_idx } = req.params;   // URL 파라미터에서 세션 ID 추출

    // ── 세션 조회 및 소유자 검증 ──────────────────────────
    // imm_idx와 user_idx를 동시에 조건으로 걸어 본인 세션만 접근 가능하게 합니다
    const [[session]] = await pool.query(
      `SELECT *, TIMESTAMPDIFF(MINUTE,
                  CONCAT(imm_date,' ',start_time),
                  CONCAT(imm_date,' ',end_time)) AS duration_min
       FROM immersions WHERE imm_idx = ? AND user_idx = ?`,
      [imm_idx, req.user.user_idx]
    );
    // 세션이 없거나 소유자가 다르면 404 반환
    if (!session) return res.status(404).json({ success: false, message: '세션을 찾을 수 없습니다.' });

    // ── 자세 데이터 조회 ─────────────────────────────────
    // AI 피드백 생성에 필요한 자세 유형별 데이터를 조회합니다
    const [poses] = await pool.query(
      'SELECT * FROM poses WHERE imm_idx = ?',
      [imm_idx]
    );

    // ── 세션 평균 데시벨 조회 ────────────────────────────
    // obj_name = '세션평균'인 행에서 세션 전체의 평균 데시벨 값을 꺼냅니다
    const [[noiseSummary]] = await pool.query(
      `SELECT decibel 
       FROM noises
       WHERE imm_idx = ? AND obj_name = '세션평균'`,
      [imm_idx]
    );

    // ── 자세 유형별 count 집계 객체 생성 ────────────────
    /*
      poses 배열을 { pose_type: count } 형태의 객체로 변환합니다.
      generateAIFeedback 함수가 이 형태로 입력값을 받습니다.
      (예: { 'NORMAL': 30, 'FORWARD_HEAD': 5 })
    */
    const poseCount = poses.reduce((acc, p) => {
      acc[p.pose_type] = p.count || 0;
      return acc;
    }, {});

    /*
      ?. (옵셔널 체이닝) : noiseSummary가 undefined이면 오류 없이 undefined를 반환합니다.
      ?? (널 병합 연산자) : undefined 또는 null이면 0을 기본값으로 사용합니다.
    */
    const avgDecibel = noiseSummary?.decibel ?? 0;

    // ── AI 피드백 생성 ───────────────────────────────────
    // 세션 정보, 자세 통계, 평균 데시벨을 AI 서비스에 전달하여 피드백 텍스트를 받습니다
    const feedback = await generateAIFeedback(session, poseCount, avgDecibel);

    // ── 기존 피드백 존재 여부 확인 (UPSERT 패턴) ─────────
    // imm_idx 기준으로 이미 피드백이 저장되어 있는지 확인합니다
    const [[existing]] = await pool.query(
      'SELECT fb_idx FROM feedbacks WHERE imm_idx = ?', [imm_idx]
    );

    if (existing) {
      // 기존 피드백이 있으면 내용과 생성 시각을 최신 값으로 업데이트합니다
      await pool.query(
        'UPDATE feedbacks SET fb_content = ?, created_at = ? WHERE imm_idx = ?',
        [feedback, toMySQLDatetime(), imm_idx]
      );
    } else {
      // 기존 피드백이 없으면 새 행을 INSERT합니다
      await pool.query(
        'INSERT INTO feedbacks (imm_idx, fb_content, created_at) VALUES (?, ?, ?)',
        [imm_idx, feedback, toMySQLDatetime()]
      );
    }

    res.json({ success: true, data: { feedback } });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - getReport       : 세션 상세 리포트 조회 라우터에 연결
    - getReportList   : 리포트 목록 조회 라우터에 연결
    - generateFeedback: AI 피드백 생성 라우터에 연결
*/
module.exports = { getReport, getReportList, generateFeedback };
