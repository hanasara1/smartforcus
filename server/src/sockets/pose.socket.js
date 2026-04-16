// ─────────────────────────────────────────────────────────
// server/src/sockets/pose.socket.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');

/*
  generateAIFeedback : 세션 데이터를 기반으로 AI 피드백을 생성하는 서비스 함수입니다.
                       Gemini API 호출에 실패하면 내부적으로 규칙 기반 fallbackFeedback을
                       자동 호출하므로 항상 JSON 형식의 피드백 문자열을 반환합니다.
*/
const { generateAIFeedback } = require('../services/feedback.service');

// logger : 소켓 이벤트 처리 과정을 단계별로 기록하는 로깅 유틸리티
const logger = require('../utils/logger');

/*
  toMySQLDatetime : 현재 시각을 MySQL의 DATETIME 형식('YYYY-MM-DD HH:MM:SS')으로
                    변환하여 반환하는 유틸리티 함수입니다.
*/
const { toMySQLDatetime } = require('../utils/dateUtil');


// ────────────────────────────────────────────────
// 🏷️ 자세 유형 레이블 정의
// ────────────────────────────────────────────────

/*
  POSE_LABELS :
    DB에 저장된 자세 유형 코드(영문)를 사용자에게 보여줄 한국어 레이블로 매핑합니다.
    로그 출력 및 피드백 텍스트 생성 시 코드 대신 자연스러운 명칭을 사용하기 위해 활용합니다.
*/
const POSE_LABELS = {
  NORMAL : '바른 자세',
  TURTLE : '거북목',
  SLUMP  : '엎드림',
  TILT   : '몸 기울어짐',
  CHIN   : '턱 괴기',
  STATIC : '장시간 고정 자세',
};


// ────────────────────────────────────────────────
// 🛠️ 자세 분석 헬퍼 함수들
// ────────────────────────────────────────────────

/*
  decidePoseStatus(poseCount)

  [역할]
  세션의 전체 자세 감지 횟수 중 바른 자세(NORMAL) 비율을 계산하여
  세션의 자세 상태 등급(GOOD / WARNING / BAD)을 결정합니다.

  ▼ 등급 기준 ▼
    GOOD    : 바른 자세 비율 70% 이상 (또는 감지 데이터 없음)
    WARNING : 바른 자세 비율 40% 이상 70% 미만
    BAD     : 바른 자세 비율 40% 미만

  @param {object} poseCount - 자세 유형별 감지 횟수 (예: { NORMAL: 30, TURTLE: 5 })
  @returns {string} 'GOOD' | 'WARNING' | 'BAD'
*/
const decidePoseStatus = (poseCount) => {
  const total       = Object.values(poseCount).reduce((a, b) => a + b, 0);
  const normalCount = poseCount.NORMAL || 0;

  // 감지 데이터가 없으면 판단 불가이므로 기본값 'GOOD'을 반환합니다
  if (total === 0) return 'GOOD';

  const goodRate = (normalCount / total) * 100;  // 바른 자세 비율 (%)

  if (goodRate >= 70) return 'GOOD';
  if (goodRate >= 40) return 'WARNING';
  return 'BAD';
};


/*
  decideTopPoseType(poseCount)

  [역할]
  세션에서 가장 많이 감지된 자세 유형(대표 자세)을 반환합니다.
  poseCount 객체를 count 내림차순으로 정렬하여 첫 번째 항목을 꺼냅니다.
  데이터가 비어있으면 기본값 'NORMAL'을 반환합니다.

  @param {object} poseCount - 자세 유형별 감지 횟수
  @returns {string} 가장 많이 감지된 자세 유형 코드 (예: 'TURTLE')
*/
const decideTopPoseType = (poseCount) => {
  const sorted = Object.entries(poseCount).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] || 'NORMAL';  // 데이터가 없으면 'NORMAL' 반환
};


// ────────────────────────────────────────────────
// 🎯 자세 분석 소켓 이벤트 핸들러
// ────────────────────────────────────────────────

/*
  poseHandler(socket, _io)

  [역할]
  연결된 개별 클라이언트 소켓에 자세 분석 관련 이벤트 핸들러를 등록합니다.
  sockets/index.js의 'connection' 이벤트 콜백 안에서 호출되어
  클라이언트마다 독립적인 이벤트 리스너를 설정합니다.

  ▼ 등록되는 이벤트 목록 ▼
    noise:data               : 실시간 소음 데이터 수신 및 저장
    session:request_feedback : 세션 종료 시 AI 종합 피드백 생성 요청

  @param {Socket} socket - 연결된 개별 클라이언트 소켓 인스턴스
  @param {Server} _io    - Socket.IO 서버 전체 인스턴스 (현재 미사용, 향후 브로드캐스트용)
*/
const poseHandler = (socket, _io) => {


  // ────────────────────────────────────────────────
  // 🔊 실시간 소음 데이터 수신 핸들러
  // ────────────────────────────────────────────────

  /*
    이벤트 : 'noise:data'

    [역할]
    클라이언트가 감지한 주변 소음 데이터를 받아 noises 테이블에 저장합니다.
    데시벨이 75dB 이상이면 즉시 경고 이벤트를 클라이언트에 전송합니다.

    ▼ 페이로드 구조 ▼
      {
        imm_idx     : 현재 집중 세션의 고유 ID,
        decibel     : 감지된 소음의 데시벨 값,
        obj_name    : 소음 객체 이름 (예: '사람', '음악'),
        reliability : 감지 신뢰도 (0.0 ~ 1.0)
      }

    ▼ 소음 경고 기준 ▼
      75dB 이상 : 집중 방해 수준의 높은 소음으로 판단하여 'noise:alert' 이벤트를 전송합니다.
  */
  socket.on('noise:data', async (payload) => {
    try {
      const { imm_idx, decibel, obj_name, reliability } = payload;
      const pool = getPool();

      // 수신된 소음 데이터를 noises 테이블에 저장합니다
      await pool.query(
        'INSERT INTO noises (imm_idx, decibel, obj_name, reliability) VALUES (?, ?, ?, ?)',
        [imm_idx, decibel, obj_name, reliability]
      );

      // 데시벨이 75 이상이면 클라이언트에 소음 경고 이벤트를 전송합니다
      if (Number(decibel) >= 75) {
        socket.emit('noise:alert', {
          message : `주변 소음이 높습니다 (${decibel}dB). 조용한 환경을 찾아보세요.`,
          decibel,
        });
      }

    } catch (err) {
      logger.error('noise:data 오류:', err.message);
    }
  });


  // ────────────────────────────────────────────────
  // 🤖 세션 종료 AI 피드백 요청 핸들러
  // ────────────────────────────────────────────────

  /*
    이벤트 : 'session:request_feedback'

    [역할]
    세션 종료 시 클라이언트가 전송한 자세 통계와 소음 데이터를 바탕으로
    AI 피드백을 생성하고 DB에 저장한 뒤 클라이언트에 전송합니다.
    처리 단계마다 로그를 남겨 문제 발생 시 디버깅이 쉽도록 합니다.

    ▼ 페이로드 구조 ▼
      {
        imm_idx     : 종료된 집중 세션의 고유 ID,
        avg_decibel : 세션 전체 평균 데시벨 값,
        pose_count  : 자세 유형별 누적 감지 횟수 (예: { NORMAL: 30, TURTLE: 5 })
      }

    [처리 단계]
      1단계 : 세션 기본 정보 조회 (집중 시간 포함)
      2단계 : 평균 데시벨을 noises 테이블에 '세션평균' 행으로 저장
      3단계 : 자세 데이터 존재 여부 확인 (없으면 기본 피드백 전송 후 종료)
      4단계 : 자세 유형별로 poses 테이블에 INSERT
      5단계 : generateAIFeedback으로 AI 피드백 생성
      6단계 : feedbacks 테이블에 피드백 저장
      7단계 : 클라이언트에 피드백 전송

    ▼ 자세 데이터가 없을 때 처리 ▼
      카메라 오류 등으로 pose_count가 비어있으면
      카메라 환경 점검을 안내하는 기본 피드백을 즉시 전송하고 함수를 종료합니다.

    ▼ 오류 발생 시 처리 ▼
      전체 처리 중 예외가 발생하면 클라이언트가 멈추지 않도록
      최소한의 오류 안내 피드백을 소켓으로 전송합니다.
      소켓 자체가 끊긴 경우를 대비해 emit도 try/catch로 감쌉니다.
  */
  socket.on('session:request_feedback', async (...args) => {
    const data = args[0];
    logger.info('수신 데이터:', JSON.stringify(data));

    try {
      const { imm_idx, avg_decibel, pose_count } = data ?? {};

      // imm_idx가 없으면 어떤 세션인지 알 수 없으므로 처리를 중단합니다
      if (!imm_idx) {
        logger.error('imm_idx 없음');
        return;
      }

      const pool      = getPool();
      const poseCount = pose_count ?? {};  // pose_count가 없으면 빈 객체로 처리합니다

      // ── 1단계: 세션 기본 정보 조회 ────────────────────
      /*
        TIMESTAMPDIFF로 집중 시간(분)을 함께 계산합니다.
        session이 없으면 잘못된 imm_idx이므로 처리를 중단합니다.
      */
      logger.info('1단계: 세션 조회');
      const [[session]] = await pool.query(
        `SELECT *,
                TIMESTAMPDIFF(MINUTE,
                  CONCAT(imm_date,' ',start_time),
                  CONCAT(imm_date,' ',end_time)) AS duration_min
         FROM immersions
         WHERE imm_idx = ?`,
        [imm_idx]
      );
      if (!session) {
        logger.error('세션 없음:', imm_idx);
        return;
      }
      logger.info('1단계 완료');

      // ── 2단계: 세션 평균 데시벨 저장 ──────────────────
      /*
        noises 테이블에 is_summary 컬럼이 없으므로
        obj_name = '세션평균'으로 일반 소음 이벤트와 구분합니다.
        reliability = 1.0 : 세션 평균값이므로 신뢰도를 최대값으로 설정합니다.
      */
      logger.info('2단계: 평균 데시벨 저장');
      const decibel = Number(avg_decibel) || 0;  // 숫자가 아닌 값이 오면 0으로 처리합니다
      await pool.query(
        `INSERT INTO noises (imm_idx, decibel, obj_name, reliability)
         VALUES (?, ?, '세션평균', 1.0)`,
        [imm_idx, decibel]
      );
      logger.info(`2단계 완료 - 평균 데시벨: ${decibel}dB`);

      // ── 3단계: 자세 데이터 존재 여부 확인 ─────────────
      /*
        pose_count가 비어있으면 자세 분석이 불가능합니다.
        카메라 오류 등의 상황을 고려하여 기본 피드백을 전송하고 종료합니다.
        피드백은 Gemini와 동일한 JSON 구조를 유지합니다.
      */
      logger.info('3단계: 자세 데이터 확인');
      const total = Object.values(poseCount).reduce((a, b) => a + b, 0);

      if (total === 0) {
        logger.warn('자세 데이터 없음 → 기본 피드백 전송');

        const emptyFeedback = JSON.stringify({
          오늘의총평 : '자세 데이터가 수집되지 않은 세션이에요.',
          긍정분석   : '세션을 완료하신 것 자체가 훌륭해요! 다음 세션에서는 카메라 앞에 상반신이 잘 보이도록 위치를 조정해보세요.',
          보완사항   : '자세 감지 데이터가 없어 정확한 분석이 어려워요. 카메라 각도와 조명 상태를 확인해주세요.',
          집중태그   : '#세션완료 #환경점검필요 #성장중',
        }, null, 2);

        // 기본 피드백을 feedbacks 테이블에 저장합니다
        await pool.query(
          `INSERT INTO feedbacks (imm_idx, fb_content, created_at) VALUES (?, ?, ?)`,
          [imm_idx, emptyFeedback, toMySQLDatetime()]
        );

        // 클라이언트에 기본 피드백을 전송하고 처리를 종료합니다
        socket.emit('session:feedback', { feedback: emptyFeedback, imm_idx });
        return;
      }

      // ── 자세 분석 공통 값 계산 ──────────────────────────
      const topPoseType = decideTopPoseType(poseCount);  // 가장 많이 감지된 자세 유형
      const poseStatus  = decidePoseStatus(poseCount);   // 세션 전체 자세 상태 등급
      const detectedAt  = toMySQLDatetime();             // 모든 행의 detected_at을 동일 시각으로 통일

      logger.info(`대표 자세: ${topPoseType} / 상태: ${poseStatus}`);
      logger.info(`자세 카운트: ${JSON.stringify(poseCount)}`);

      // ── 4단계: 자세 유형별 poses 테이블 INSERT ─────────
      /*
        poseCount 객체를 순회하며 감지된 자세 유형마다 행을 INSERT합니다.
        count가 0인 유형은 제외합니다.
        NORMAL 자세는 항상 'GOOD', 불량 자세는 세션 전체 poseStatus를 적용합니다.
      */
      logger.info('4단계: poses INSERT (자세 유형별)');
      const poseEntries = Object.entries(poseCount).filter(([, count]) => count > 0);

      for (const [poseType, count] of poseEntries) {
        // NORMAL(바른 자세)는 항상 GOOD으로 저장하고, 불량 자세는 세션 전체 등급을 적용합니다
        const typeStatus = poseType === 'NORMAL' ? 'GOOD' : poseStatus;

        await pool.query(
          `INSERT INTO poses (imm_idx, pose_type, pose_status, count, detected_at)
           VALUES (?, ?, ?, ?, ?)`,
          [imm_idx, poseType, typeStatus, count, detectedAt]
        );
        logger.info(`poses INSERT: ${poseType} - ${count}회 (${typeStatus})`);
      }
      logger.info('4단계 완료');

      // ── 5단계: AI 피드백 생성 ───────────────────────────
      /*
        generateAIFeedback은 Gemini API 호출 실패 시
        내부적으로 fallbackFeedback을 자동 호출하므로
        여기서 별도의 오류 처리가 필요하지 않습니다.
        항상 Gemini와 동일한 JSON 구조의 문자열을 반환합니다.
      */
      logger.info('5단계: AI 피드백 생성');
      const feedback = await generateAIFeedback(session, poseCount, decibel);
      logger.info('5단계 완료');

      // ── 6단계: 피드백 DB 저장 ───────────────────────────
      logger.info('6단계: feedbacks INSERT');
      await pool.query(
        `INSERT INTO feedbacks (imm_idx, fb_content, created_at) VALUES (?, ?, ?)`,
        [imm_idx, feedback, toMySQLDatetime()]
      );
      logger.info('6단계 완료');

      // ── 7단계: 클라이언트에 피드백 전송 ────────────────
      // 'session:feedback' 이벤트로 생성된 피드백과 세션 ID를 클라이언트에 전달합니다
      socket.emit('session:feedback', { feedback, imm_idx });
      logger.info('피드백 전송 완료');

    } catch (err) {
      logger.error('session:request_feedback 오류:', err.message);
      logger.error('오류 스택:', err.stack);

      /*
        예상치 못한 오류가 발생해도 클라이언트가 응답 없이 멈추지 않도록
        오류 안내 피드백을 전송합니다.
        소켓 자체가 끊긴 경우 emit이 실패할 수 있으므로 try/catch로 감쌉니다.
      */
      const errorFeedback = JSON.stringify({
        오늘의총평 : '피드백 생성 중 오류가 발생했어요.',
        긍정분석   : '세션을 완료하셨습니다! 서버 오류로 상세 분석이 일시적으로 제공되지 않아요.',
        보완사항   : '잠시 후 다시 시도하거나, 관리자에게 문의해주세요.',
        집중태그   : '#세션완료 #오류발생',
      }, null, 2);

      try {
        socket.emit('session:feedback', {
          feedback : errorFeedback,
          imm_idx  : data?.imm_idx,
        });
      } catch (_) { /* 소켓 자체가 끊긴 경우 emit 실패를 무시합니다 */ }
    }
  });
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 핸들러 함수를 다른 파일에서 require()로 사용할 수 있게 합니다.
    - poseHandler : sockets/index.js의 'connection' 이벤트 콜백 안에서 호출
                    (예: io.on('connection', (socket) => { poseHandler(socket, io); }))

  ✅ buildFallbackFeedback 함수는 이 파일에서 완전히 제거되었습니다.
     피드백 폴백 로직은 feedback.service.js의 fallbackFeedback으로 일원화되어
     소켓과 HTTP API 양쪽에서 동일한 로직을 사용합니다.
*/
module.exports = poseHandler;
