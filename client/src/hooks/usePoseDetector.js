// client/src/hooks/usePoseDetector.js
import { useEffect, useRef, useCallback } from 'react';
import { evaluateSmartFocus, resetStaticTracking } from '../utils/smartFocus';

export const POSE_LABELS = {
  NORMAL: '바른 자세',
  TURTLE: '거북목',
  SLUMP: '엎드림',
  TILT: '몸 기울어짐',
  CHIN: '턱 괴기',
  STATIC: '장시간 고정 자세',
};

const usePoseDetector = (videoRef, canvasRef, onPoseResult, active, calibration, db, isCalibrating) => {
  const holisticRef = useRef(null);
  const cameraRef = useRef(null);
  const animRef = useRef(null);
  const poseBufferRef = useRef([]);
  const lastDispatchRef = useRef(Date.now());

  // ✅ 하이라이트 관련 ref
  const highlightBufferRef = useRef([]);   // 캡처된 하이라이트 프레임 저장
  const lastCaptureTimeRef = useRef(0);    // 마지막 캡처 시각 (중복 방지)
  const sessionStartTimeRef = useRef(null); // 세션 시작 시각 (경과 시간 계산용)
  const fileNameRef = useRef('');   // 저장 파일명

  const onPoseResultRef = useRef(onPoseResult);
  const calibrationRef = useRef(calibration);
  const dbRef = useRef(db);

  useEffect(() => { onPoseResultRef.current = onPoseResult; }, [onPoseResult]);
  useEffect(() => { calibrationRef.current = calibration; }, [calibration]);
  useEffect(() => { dbRef.current = db; }, [db]);

  // ✅ 세션 시작 시 호출 (sessionStartTime 기록)
  const startRecording = useCallback(() => {
    highlightBufferRef.current = [];
    lastCaptureTimeRef.current = 0;
    sessionStartTimeRef.current = Date.now();

    // ✅ 파일명 생성
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    fileNameRef.current = `highlight_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.webm`;
    console.log('🎬 하이라이트 캡처 시작:', fileNameRef.current);
  }, []);

  // ✅ 하이라이트 프레임 캡처 함수
  // canvas에 카메라 화면 + 텍스트 오버레이를 그려서 저장
  const captureHighlight = useCallback((reason, poseType, currentDb) => {
    if (!videoRef.current) return;

    const now = Date.now();
    // ✅ 3초 이내 중복 캡처 방지
    if (now - lastCaptureTimeRef.current < 3000) return;
    lastCaptureTimeRef.current = now;

    // ✅ 경과 시간 계산 (세션 시작부터)
    const elapsed = sessionStartTimeRef.current
      ? Math.floor((now - sessionStartTimeRef.current) / 1000)
      : 0;
    const elapsedStr = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

    // ✅ 캡처용 canvas 생성
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = videoRef.current.videoWidth || 640;
    snapCanvas.height = videoRef.current.videoHeight || 480;
    const ctx = snapCanvas.getContext('2d');

    // ✅ 1. 카메라 화면 그리기 (좌우 반전)
    ctx.save();
    ctx.translate(snapCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0);
    ctx.restore();

    // ✅ 2. 하단 반투명 배경 (텍스트 가독성)
    const barHeight = 70;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, snapCanvas.height - barHeight, snapCanvas.width, barHeight);

    // ✅ 3. 자세/소음 텍스트 오버레이
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = reason === 'noise'
      ? '#fbbf24'  // 🔊 소음 → 노란색
      : '#f87171'; // ⚠️ 자세 → 빨간색

    const labelText = reason === 'noise'
      ? `🔊 소음 감지: ${currentDb}dB`
      : `⚠️ ${POSE_LABELS[poseType] || poseType} 감지`;

    ctx.fillText(labelText, 16, snapCanvas.height - barHeight + 28);

    // ✅ 4. 경과 시간 텍스트
    ctx.font = '16px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`🕐 ${elapsedStr}`, 16, snapCanvas.height - barHeight + 56);

    // ✅ 5. dB 수치 (자세 감지일 때도 표시)
    if (reason !== 'noise' && currentDb > 0) {
      ctx.fillText(`🔉 ${currentDb}dB`, snapCanvas.width - 90, snapCanvas.height - barHeight + 56);
    }

    // ✅ canvas → ImageBitmap으로 변환 후 버퍼에 저장
    createImageBitmap(snapCanvas).then((bitmap) => {
      highlightBufferRef.current.push(bitmap);
      console.log(`📸 하이라이트 캡처 (${reason} / ${poseType}): 총 ${highlightBufferRef.current.length}장`);
    });
  }, [videoRef]);

  // ✅ 세션 종료 시 하이라이트 이미지들 → WebM 영상으로 변환
  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const frames = highlightBufferRef.current;

      // ✅ 캡처된 프레임이 없으면 null 반환
      if (frames.length === 0) {
        console.log('⚠️ 하이라이트 프레임 없음');
        resolve(null);
        return;
      }

      console.log(`🎬 영상 변환 시작: 총 ${frames.length}장`);

      // ✅ 변환용 canvas 생성
      const canvas = document.createElement('canvas');
      canvas.width = frames[0].width;
      canvas.height = frames[0].height;
      const ctx = canvas.getContext('2d');

      // ✅ canvas → MediaRecorder 스트림
      const stream = canvas.captureStream(30); // 30fps
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        console.log('✅ 하이라이트 영상 완성! 크기:', blob.size, 'bytes');
        resolve({ blob, fileName: fileNameRef.current });
      };

      recorder.start();

      // ✅ 각 프레임을 canvas에 순서대로 그리기
      // 한 장당 1.5초씩 보여줌
      let frameIdx = 0;
      const FPS = 30;            // 초당 30프레임
      const HOLD_SEC = 1.5;           // 한 이미지 유지 시간 (초)
      const HOLD_FRAMES = FPS * HOLD_SEC; // 한 이미지당 그릴 프레임 수 (45프레임)

      const drawNextFrame = () => {
        const imageIdx = Math.floor(frameIdx / HOLD_FRAMES);

        // ✅ 모든 이미지 다 그렸으면 녹화 종료
        if (imageIdx >= frames.length) {
          recorder.stop();
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        // ✅ 현재 이미지를 canvas에 그리기
        ctx.drawImage(frames[imageIdx], 0, 0);
        frameIdx++;
        animRef.current = requestAnimationFrame(drawNextFrame);
      };

      drawNextFrame();
    });
  }, []);

  // ✅ 초기화
  const clearRecording = useCallback(() => {
    highlightBufferRef.current = [];
    lastCaptureTimeRef.current = 0;
    sessionStartTimeRef.current = null;
    fileNameRef.current = '';
    cancelAnimationFrame(animRef.current);
  }, []);

  // ── 스켈레톤 그리기 (기존 코드 그대로!)
  const drawSkeleton = useCallback((poseLandmarks, faceLandmarks, canvas, isCalibrating, calibration) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const MIN_VIS = 0.3;

    if (isCalibrating) {
      const guideColor = calibration ? 'rgba(34, 197, 94, 0.9)' : 'rgba(234, 179, 8, 0.9)';
      const GUIDE_CONNECTIONS = [
        [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [7, 11], [8, 12],
      ];
      ctx.strokeStyle = guideColor;
      ctx.lineWidth = 5;
      GUIDE_CONNECTIONS.forEach(([a, b]) => {
        const lA = poseLandmarks[a];
        const lB = poseLandmarks[b];
        if (!lA || !lB) return;
        if ((lA.visibility ?? 1) < MIN_VIS) return;
        if ((lB.visibility ?? 1) < MIN_VIS) return;
        ctx.beginPath();
        ctx.moveTo(lA.x * canvas.width, lA.y * canvas.height);
        ctx.lineTo(lB.x * canvas.width, lB.y * canvas.height);
        ctx.stroke();
      });
      [7, 8, 11, 12, 13, 14, 15, 16].forEach(i => {
        const lm = poseLandmarks[i];
        if (!lm || (lm.visibility ?? 1) < MIN_VIS) return;
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 8, 0, 2 * Math.PI);
        ctx.fillStyle = guideColor;
        ctx.fill();
      });
      return;
    }

    const CONNECTIONS = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24], [7, 11], [8, 12],
    ];
    ctx.strokeStyle = 'rgba(99,102,241,.85)';
    ctx.lineWidth = 3;
    CONNECTIONS.forEach(([a, b]) => {
      const lA = poseLandmarks[a];
      const lB = poseLandmarks[b];
      if (!lA || !lB) return;
      if ((lA.visibility ?? 1) < MIN_VIS) return;
      if ((lB.visibility ?? 1) < MIN_VIS) return;
      ctx.beginPath();
      ctx.moveTo(lA.x * canvas.width, lA.y * canvas.height);
      ctx.lineTo(lB.x * canvas.width, lB.y * canvas.height);
      ctx.stroke();
    });
    poseLandmarks.forEach((lm, i) => {
      if (i <= 10) return;
      if ((lm.visibility ?? 1) < MIN_VIS) return;
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fillStyle = i <= 16 ? '#a5b4fc' : '#94a3b8';
      ctx.fill();
    });
    if (faceLandmarks) {
      const KEY_POINTS = [
        { idx: 1, color: '#fbbf24' }, { idx: 152, color: '#f43f5e' },
        { idx: 234, color: '#fbbf24' }, { idx: 454, color: '#fbbf24' },
      ];
      KEY_POINTS.forEach(({ idx, color }) => {
        const lm = faceLandmarks[idx];
        if (!lm) return;
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      });
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    resetStaticTracking();
    let mounted = true;
    let isCleaning = false;

    const setup = async () => {
      // ✅ 이미 초기화된 경우 재사용
      if (holisticRef.current) {
        console.log('♻️ Holistic 재사용');
        return;
      }

      try {
        const { Holistic } = await import('@mediapipe/holistic');
        const { Camera } = await import('@mediapipe/camera_utils');
        await new Promise(resolve => setTimeout(resolve, 500));

        const holistic = new Holistic({
          locateFile: (file) => `${window.location.origin}/mediapipe/holistic/${file}`,
        });

        holistic.onResults((results) => {
          if (!mounted || !canvasRef.current || !videoRef.current) return;
          const canvas = canvasRef.current;
          const video = videoRef.current;
          const displayW = video.clientWidth;
          const displayH = video.clientHeight;
          if (canvas.width !== displayW || canvas.height !== displayH) {
            canvas.width = displayW;
            canvas.height = displayH;
          }
          const poseLandmarks = results.poseLandmarks;
          const faceLandmarks = results.faceLandmarks;
          if (!poseLandmarks) return;
          const leftShoulder = poseLandmarks[11];
          const rightShoulder = poseLandmarks[12];
          if (!leftShoulder || !rightShoulder) return;
          drawSkeleton(poseLandmarks, faceLandmarks, canvas, isCalibrating, calibrationRef.current);

          if (!calibrationRef.current) {
            onPoseResultRef.current({
              pose: { type: 'NORMAL', status: 'NORMAL', load: '5kg' },
              noise: { status: 'NORMAL', val: dbRef.current || 0, msg: '' },
              landmarks: poseLandmarks,
              faceLandmarks,
            });
            return;
          }

          const offset = Math.sqrt(
            Math.pow(poseLandmarks[11].x - poseLandmarks[12].x, 2) +
            Math.pow(poseLandmarks[11].y - poseLandmarks[12].y, 2)
          );
          const mode = offset >= 0.15 ? 'front' : 'side';
          const frameResult = evaluateSmartFocus(
            { landmarks: poseLandmarks, faceLandmarks, db: dbRef.current || 0, mode },
            calibrationRef.current,
          );

          poseBufferRef.current.push(frameResult.pose.type);
          const BUFFER_MS = 1000;
          const now = Date.now();

          if (now - lastDispatchRef.current >= BUFFER_MS) {
            const buffer = poseBufferRef.current;
            const counts = { STATIC: 0, CHIN: 0, SLUMP: 0, TURTLE: 0, TILT: 0, NORMAL: 0 };
            buffer.forEach(type => { if (type in counts) counts[type] += 1; });
            const total = buffer.length;
            const THRESHOLD = 0.2;
            let finalType = 'NORMAL';
            switch (true) {
              case counts.STATIC / total >= THRESHOLD: finalType = 'STATIC'; break;
              case counts.CHIN / total >= THRESHOLD: finalType = 'CHIN'; break;
              case counts.SLUMP / total >= THRESHOLD: finalType = 'SLUMP'; break;
              case counts.TURTLE / total >= THRESHOLD: finalType = 'TURTLE'; break;
              case counts.TILT / total >= THRESHOLD: finalType = 'TILT'; break;
              default: finalType = 'NORMAL';
            }
            const warningFrames = buffer.filter(t => t === finalType).length;
            const warningRatio = warningFrames / total;
            const poseResultMap = {
              STATIC: { type: 'STATIC', status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '정적 부하' },
              CHIN: { type: 'CHIN', status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '안면 비대칭 위험' },
              SLUMP: { type: 'SLUMP', status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '상체 지지력 상실' },
              TURTLE: { type: 'TURTLE', status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '거북목' },
              TILT: { type: 'TILT', status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '척추 불균형' },
              NORMAL: { type: 'NORMAL', status: 'NORMAL', load: '5kg' },
            };
            poseBufferRef.current = [];
            lastDispatchRef.current = now;

            onPoseResultRef.current({
              pose: poseResultMap[finalType],
              noise: frameResult.noise,
              landmarks: poseLandmarks,
            });

            // ✅ 하이라이트 캡처 조건 체크
            const currentDb = dbRef.current || 0;

            // 조건 1: 불량 자세 감지
            if (finalType !== 'NORMAL') {
              captureHighlight('pose', finalType, currentDb);
            }

            // 조건 2: 소음 75dB 이상
            if (currentDb >= 75) {
              captureHighlight('noise', finalType, currentDb);
            }
          }
        });

        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          refineFaceLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        await holistic.initialize();
        holisticRef.current = holistic;

        if (videoRef.current) {
          const camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (isCleaning || !holistic || !videoRef.current) return;
              try {
                await holistic.send({ image: videoRef.current });
              } catch (err) { /* 이미 close된 경우 무시 */ }
            },
            width: 640,
            height: 480,
          });
          await camera.start();
          cameraRef.current = camera;
        }
      } catch (err) {
        console.error('❌ setup 에러:', err);
      }
    };

    setup();

    return () => {
      mounted = false;
      isCleaning = true;
      cancelAnimationFrame(animRef.current);
      cameraRef.current?.stop?.();
      setTimeout(() => {
        holisticRef.current?.close?.();
        holisticRef.current = null;
        cameraRef.current = null;
      }, 300);
    };
  }, [active, drawSkeleton, captureHighlight]);

  return { POSE_LABELS, startRecording, stopRecording, clearRecording };
};

export default usePoseDetector;
