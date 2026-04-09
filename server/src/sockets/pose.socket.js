// server/src/sockets/pose.socket.js
const { getPool } = require('../config/db.config');
const { generateAIFeedback } = require('../services/feedback.service');
const logger = require('../utils/logger');
const { toMySQLDatetime } = require('../utils/dateUtil');

// ── 자세 유형 한글 레이블
const POSE_LABELS = {
  NORMAL: '바른 자세',
  TURTLE: '거북목',
  SLUMP:  '엎드림',
  TILT:   '몸 기울어짐',
  CHIN:   '턱 괴기',
  STATIC: '장시간 고정 자세',
};

// ── pose_status 결정 함수 (바른 자세 비율 기준)
const decidePoseStatus = (poseCount) => {
  const total       = Object.values(poseCount).reduce((a, b) => a + b, 0);
  const normalCount = poseCount.NORMAL || 0;
  if (total === 0) return 'GOOD';
  const goodRate    = (normalCount / total) * 100;
  if (goodRate >= 70) return 'GOOD';
  if (goodRate >= 40) return 'WARNING';
  return 'BAD';
};

// ── 대표 자세 결정 함수 (카운트 가장 많은 자세)
const decideTopPoseType = (poseCount) => {
  const sorted = Object.entries(poseCount).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] || 'NORMAL';
};

const poseHandler = (socket, _io) => {

  // ── 소음 데이터 수신
  socket.on('noise:data', async (payload) => {
    try {
      const { imm_idx, decibel, obj_name, reliability } = payload;
      const pool = getPool();
      await pool.query(
        'INSERT INTO noises (imm_idx, decibel, obj_name, reliability) VALUES (?, ?, ?, ?)',
        [imm_idx, decibel, obj_name, reliability]
      );
      if (Number(decibel) >= 75) {
        socket.emit('noise:alert', {
          message: `주변 소음이 높습니다 (${decibel}dB). 조용한 환경을 찾아보세요.`,
          decibel,
        });
      }
    } catch (err) {
      logger.error('noise:data 오류:', err.message);
    }
  });

  // ── 세션 종료 시 AI 종합 피드백 요청
  socket.on('session:request_feedback', async (...args) => {
    const data = args[0];
    logger.info('수신 데이터:', JSON.stringify(data));

    try {
      const { imm_idx, avg_decibel, pose_count } = data ?? {};

      if (!imm_idx) {
        logger.error('imm_idx 없음');
        return;
      }

      const pool      = getPool();
      const poseCount = pose_count ?? {};

      // ── 1단계: 세션 조회
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

      // ── 2단계: 평균 데시벨 저장
      // ✅ noises 테이블 스키마에 is_summary 컬럼이 없으므로
      //    obj_name을 '세션평균'으로 구분
      logger.info('2단계: 평균 데시벨 저장');
      const decibel = Number(avg_decibel) || 0;
      await pool.query(
        `INSERT INTO noises (imm_idx, decibel, obj_name, reliability)
         VALUES (?, ?, '세션평균', 1.0)`,
        [imm_idx, decibel]
      );
      logger.info(`2단계 완료 - 평균 데시벨: ${decibel}dB`);

      // ── 3단계: 자세 데이터 확인
      logger.info('3단계: 자세 데이터 확인');
      const total = Object.values(poseCount).reduce((a, b) => a + b, 0);

      if (total === 0) {
        logger.warn('자세 데이터 없음 → 기본 피드백 전송');

        // ✅ 자세 데이터 없을 때도 JSON 구조로 통일
        const emptyFeedback = JSON.stringify({
          오늘의총평: '자세 데이터가 수집되지 않은 세션이에요.',
          긍정분석:   '세션을 완료하신 것 자체가 훌륭해요! 다음 세션에서는 카메라 앞에 상반신이 잘 보이도록 위치를 조정해보세요.',
          보완사항:   '자세 감지 데이터가 없어 정확한 분석이 어려워요. 카메라 각도와 조명 상태를 확인해주세요.',
          집중태그:   '#세션완료 #환경점검필요 #성장중',
        }, null, 2);

        await pool.query(
          `INSERT INTO feedbacks (imm_idx, fb_content, created_at) VALUES (?, ?, ?)`,
          [imm_idx, emptyFeedback, toMySQLDatetime()]
        );

        socket.emit('session:feedback', { feedback: emptyFeedback, imm_idx });
        return;
      }

      const topPoseType = decideTopPoseType(poseCount);
      const poseStatus  = decidePoseStatus(poseCount);
      const detectedAt  = toMySQLDatetime();

      logger.info(`대표 자세: ${topPoseType} / 상태: ${poseStatus}`);
      logger.info(`자세 카운트: ${JSON.stringify(poseCount)}`);

      // ── 4단계: poses 테이블에 자세 유형별로 INSERT
      logger.info('4단계: poses INSERT (자세 유형별)');
      const poseEntries = Object.entries(poseCount).filter(([, count]) => count > 0);

      for (const [poseType, count] of poseEntries) {
        const typeStatus = poseType === 'NORMAL' ? 'GOOD' : poseStatus;
        await pool.query(
          `INSERT INTO poses (imm_idx, pose_type, pose_status, count, detected_at)
           VALUES (?, ?, ?, ?, ?)`,
          [imm_idx, poseType, typeStatus, count, detectedAt]
        );
        logger.info(`poses INSERT: ${poseType} - ${count}회 (${typeStatus})`);
      }
      logger.info('4단계 완료');

      // ── 5단계: AI 피드백 생성
      // ✅ generateAIFeedback 내부에서 Gemini 실패 시
      //    자동으로 fallbackFeedback(JSON) 을 반환하므로
      //    여기서 별도 try/catch 불필요
      logger.info('5단계: AI 피드백 생성');
      const feedback = await generateAIFeedback(session, poseCount, decibel);
      logger.info('5단계 완료');

      // ── 6단계: feedbacks 테이블 INSERT
      logger.info('6단계: feedbacks INSERT');
      await pool.query(
        `INSERT INTO feedbacks (imm_idx, fb_content, created_at) VALUES (?, ?, ?)`,
        [imm_idx, feedback, toMySQLDatetime()]
      );
      logger.info('6단계 완료');

      // ── 7단계: 클라이언트로 전송
      socket.emit('session:feedback', { feedback, imm_idx });
      logger.info('피드백 전송 완료');

    } catch (err) {
      logger.error('session:request_feedback 오류:', err.message);
      logger.error('오류 스택:', err.stack);

      // ✅ 소켓 전체 오류 시에도 클라이언트가 멈추지 않도록
      //    최소한의 에러 피드백 전송
      const errorFeedback = JSON.stringify({
        오늘의총평: '피드백 생성 중 오류가 발생했어요.',
        긍정분석:   '세션을 완료하셨습니다! 서버 오류로 상세 분석이 일시적으로 제공되지 않아요.',
        보완사항:   '잠시 후 다시 시도하거나, 관리자에게 문의해주세요.',
        집중태그:   '#세션완료 #오류발생',
      }, null, 2);

      try {
        socket.emit('session:feedback', {
          feedback: errorFeedback,
          imm_idx: data?.imm_idx,
        });
      } catch (_) { /* 소켓 자체가 끊긴 경우 무시 */ }
    }
  });
};

// ✅ buildFallbackFeedback 완전 제거
//    → feedback.service.js의 fallbackFeedback으로 일원화

module.exports = poseHandler;
