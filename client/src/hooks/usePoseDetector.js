// client/src/hooks/usePoseDetector.js

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// useEffect   : 컴포넌트 마운트/언마운트 시 MediaPipe 초기화와 해제를 처리하는 훅
// useRef      : 렌더링과 무관하게 값을 유지하는 참조 객체를 생성하는 훅
//               오디오·카메라·프레임 버퍼 등 리렌더링 없이 관리해야 하는 값에 사용합니다.
// useCallback : 함수를 메모이제이션하여 불필요한 재생성을 방지하는 훅
import { useEffect, useRef, useCallback } from 'react';

// evaluateSmartFocus  : 랜드마크 데이터를 분석하여 자세·소음 상태를 판별하는 유틸 함수
// resetStaticTracking : '장시간 고정 자세(STATIC)' 감지를 위한 내부 타이머를 초기화하는 함수
import { evaluateSmartFocus, resetStaticTracking } from '../utils/smartFocus';


// ────────────────────────────────────────────────
// 🏷️ 자세 유형 라벨 상수
// ────────────────────────────────────────────────

/*
  POSE_LABELS란?
  자세 감지 결과 코드(영문 키)를 사용자에게 표시할 한글 라벨로 매핑한 상수 객체입니다.
  훅 반환값에 포함되어 UI 컴포넌트에서 직접 사용할 수 있습니다.

  ▼ 자세 유형 설명 ▼
    - NORMAL : 바른 자세 (정상)
    - TURTLE : 목이 앞으로 기울어진 거북목 자세
    - SLUMP  : 상체가 앞으로 쓰러지는 엎드림 자세
    - TILT   : 좌우 몸이 기울어진 자세
    - CHIN   : 손으로 턱을 괴는 자세
    - STATIC : 너무 오랫동안 같은 자세를 유지하는 상태
*/
export const POSE_LABELS = {
  NORMAL : '바른 자세',
  TURTLE : '거북목',
  SLUMP  : '엎드림',
  TILT   : '몸 기울어짐',
  CHIN   : '턱 괴기',
  STATIC : '장시간 고정 자세',
};


// ────────────────────────────────────────────────
// 🕵️ usePoseDetector 커스텀 훅 (자세 감지)
// ────────────────────────────────────────────────

/*
  usePoseDetector란?
  MediaPipe Holistic을 이용하여 웹캠 영상에서 실시간으로 신체 랜드마크를 분석하고
  자세 이상(거북목, 엎드림 등)과 소음 감지 시 하이라이트 프레임을 캡처하여
  세션 종료 시 WebM 영상으로 변환하는 커스텀 훅입니다.

  ▼ 매개변수 ▼
    @param {React.RefObject} videoRef      - 웹캠 영상이 렌더링되는 <video> 요소의 ref
    @param {React.RefObject} canvasRef     - 스켈레톤을 오버레이할 <canvas> 요소의 ref
    @param {Function}        onPoseResult  - 자세 분석 결과를 전달받는 콜백 함수
    @param {boolean}         active        - true일 때만 감지를 시작합니다.
    @param {object|null}     calibration   - 기준 자세 캘리브레이션 데이터 (null이면 캘리브레이션 미완료)
    @param {number}          db            - 현재 소음 데시벨 값 (useNoiseDetector와 연동)
    @param {boolean}         isCalibrating - 현재 캘리브레이션 진행 중 여부

  ▼ 반환값 ▼
    @returns {{
      POSE_LABELS    : object,   자세 유형 코드 → 한글 라벨 매핑 객체
      startRecording : Function, 세션 시작 시 호출하여 하이라이트 캡처를 초기화
      stopRecording  : Function, 세션 종료 시 호출하여 캡처된 프레임을 WebM으로 변환
      clearRecording : Function, 캡처 버퍼와 타이머를 초기화하는 리셋 함수
    }}
*/
const usePoseDetector = (videoRef, canvasRef, onPoseResult, active, calibration, db, isCalibrating) => {

  // ── MediaPipe 및 카메라 인스턴스 ref ─────────────

  const holisticRef = useRef(null); // MediaPipe Holistic 인스턴스 (자세·얼굴 랜드마크 분석)
  const cameraRef   = useRef(null); // MediaPipe Camera 인스턴스 (웹캠 프레임 공급)
  const animRef     = useRef(null); // requestAnimationFrame ID (하이라이트 영상 변환 루프용)


  // ── 자세 분석 버퍼 ref ───────────────────────────

  /*
    poseBufferRef : 1초 동안 수집된 자세 유형 문자열을 누적하는 배열입니다.
                   매 BUFFER_MS(1000ms)마다 다수결로 최종 자세를 결정합니다.
    lastDispatchRef : 마지막으로 onPoseResult를 호출한 시각입니다.
                     BUFFER_MS 간격을 계산하는 기준점으로 사용합니다.
  */
  const poseBufferRef    = useRef([]);
  const lastDispatchRef  = useRef(Date.now());


  // ── 하이라이트 캡처 관련 ref ─────────────────────

  const highlightBufferRef   = useRef([]);   // 캡처된 ImageBitmap 프레임 목록
  const lastCaptureTimeRef   = useRef(0);    // 마지막 캡처 시각 (중복 캡처 3초 방지용)
  const sessionStartTimeRef  = useRef(null); // 세션 시작 시각 (오버레이 경과 시간 계산용)
  const fileNameRef          = useRef('');   // 생성할 WebM 파일명


  // ── 최신 props 동기화 ref ────────────────────────

  /*
    useEffect의 클로저(closure) 문제를 방지하기 위해
    최신 props 값을 ref에 동기화합니다.

    클로저 문제란?
    useEffect 내부의 콜백은 처음 등록될 때의 props 값을 캡처합니다.
    props가 바뀌어도 콜백 내부에서는 이전 값을 참조할 수 있습니다.
    ref에 동기화하면 항상 최신 값을 읽을 수 있어 이 문제를 해결합니다.
  */
  const onPoseResultRef  = useRef(onPoseResult);
  const calibrationRef   = useRef(calibration);
  const dbRef            = useRef(db);

  // 각 props가 바뀔 때마다 ref에 최신값을 즉시 반영합니다.
  useEffect(() => { onPoseResultRef.current = onPoseResult; }, [onPoseResult]);
  useEffect(() => { calibrationRef.current  = calibration;  }, [calibration]);
  useEffect(() => { dbRef.current           = db;           }, [db]);


  // ────────────────────────────────────────────────
  // 🎬 startRecording : 하이라이트 캡처 초기화
  // ────────────────────────────────────────────────

  /*
    세션이 시작될 때 호출하여 하이라이트 캡처를 위한 상태를 초기화합니다.

    ▼ 파일명 생성 규칙 ▼
      highlight_YYYYMMDD_HHmmss.webm 형식으로 생성됩니다.
      예: highlight_20250315_143022.webm
      pad() : 한 자리 숫자를 두 자리로 맞추는 내부 헬퍼 함수 (예: 9 → '09')
  */
  const startRecording = useCallback(() => {
    highlightBufferRef.current    = [];        // 이전 캡처 프레임 초기화
    lastCaptureTimeRef.current    = 0;         // 중복 방지 타이머 초기화
    sessionStartTimeRef.current   = Date.now(); // 세션 시작 시각 기록

    // 파일명 생성 : 'highlight_YYYYMMDD_HHmmss.webm'
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    fileNameRef.current = `highlight_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.webm`;

    console.log('🎬 하이라이트 캡처 시작:', fileNameRef.current);
  }, []);


  // ────────────────────────────────────────────────
  // 📸 captureHighlight : 하이라이트 프레임 캡처
  // ────────────────────────────────────────────────

  /*
    불량 자세 또는 고소음 감지 시 현재 화면을 스냅샷으로 저장합니다.
    canvas에 카메라 화면을 그린 후 텍스트 오버레이를 추가하여
    ImageBitmap으로 변환해 버퍼에 누적합니다.

    ▼ 중복 캡처 방지 ▼
      lastCaptureTimeRef를 이용해 3초 이내 재캡처를 차단합니다.
      같은 이벤트가 연속으로 발생해도 의미 있는 장면만 저장됩니다.

    ▼ 오버레이 구성 ▼
      1. 카메라 화면 (좌우 반전 적용)
      2. 하단 반투명 검정 배경 (텍스트 가독성 확보)
      3. 감지 원인 텍스트 (자세 → 빨간색 / 소음 → 노란색)
      4. 경과 시간 (세션 시작부터 현재까지 MM:SS 형식)
      5. 소음 수치 (자세 감지일 때도 현재 dB 표시)

    @param {string} reason    - 캡처 원인 ('pose' | 'noise')
    @param {string} poseType  - 감지된 자세 유형 키 (POSE_LABELS의 키)
    @param {number} currentDb - 현재 소음 데시벨 값
  */
  const captureHighlight = useCallback((reason, poseType, currentDb) => {
    if (!videoRef.current) return;

    const now = Date.now();

    // 3초 이내 중복 캡처 방지
    if (now - lastCaptureTimeRef.current < 3000) return;
    lastCaptureTimeRef.current = now;


    // ── 경과 시간 계산 ────────────────────────────

    /*
      세션 시작 시각(sessionStartTimeRef)으로부터 현재까지의 초를 계산합니다.
      MM:SS 형식으로 포맷하여 오버레이 텍스트에 사용합니다.
    */
    const elapsed = sessionStartTimeRef.current
      ? Math.floor((now - sessionStartTimeRef.current) / 1000)
      : 0;
    const elapsedStr = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;


    // ── 캡처용 canvas 생성 ────────────────────────

    /*
      화면에 보이지 않는 임시 canvas를 생성하여 스냅샷을 그립니다.
      크기는 실제 비디오 해상도에 맞추며, 없을 경우 640×480을 기본값으로 사용합니다.
    */
    const snapCanvas   = document.createElement('canvas');
    snapCanvas.width   = videoRef.current.videoWidth  || 640;
    snapCanvas.height  = videoRef.current.videoHeight || 480;
    const ctx          = snapCanvas.getContext('2d');


    // ── 1단계 : 카메라 화면 그리기 (좌우 반전) ───

    /*
      웹캠 영상은 거울처럼 좌우 반전되어 표시되는 것이 자연스럽습니다.
      ctx.translate + ctx.scale(-1, 1) 로 수평 반전을 적용합니다.
      save()/restore() : 반전 변환이 이후 드로잉에 영향을 주지 않도록 격리합니다.
    */
    ctx.save();
    ctx.translate(snapCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0);
    ctx.restore();


    // ── 2단계 : 하단 반투명 배경 ─────────────────

    // 텍스트 아래에 반투명 검정 배경을 깔아 가독성을 높입니다.
    const barHeight = 70;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, snapCanvas.height - barHeight, snapCanvas.width, barHeight);


    // ── 3단계 : 감지 원인 텍스트 오버레이 ────────

    ctx.font      = 'bold 20px Arial';
    ctx.fillStyle = reason === 'noise'
      ? '#fbbf24'  // 소음 감지 → 노란색
      : '#f87171'; // 자세 감지 → 빨간색

    const labelText = reason === 'noise'
      ? `🔊 소음 감지: ${currentDb}dB`
      : `⚠️ ${POSE_LABELS[poseType] || poseType} 감지`;

    ctx.fillText(labelText, 16, snapCanvas.height - barHeight + 28);


    // ── 4단계 : 경과 시간 텍스트 ─────────────────

    ctx.font      = '16px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(`🕐 ${elapsedStr}`, 16, snapCanvas.height - barHeight + 56);


    // ── 5단계 : 소음 수치 (자세 감지 시에도 표시) ─

    if (reason !== 'noise' && currentDb > 0) {
      ctx.fillText(`🔉 ${currentDb}dB`, snapCanvas.width - 90, snapCanvas.height - barHeight + 56);
    }


    // ── canvas → ImageBitmap 변환 후 버퍼 저장 ───

    /*
      createImageBitmap() : canvas를 GPU 친화적인 ImageBitmap 객체로 변환합니다.
      canvas를 직접 저장하면 DOM 노드가 메모리를 계속 점유하지만,
      ImageBitmap은 가볍고 효율적으로 관리됩니다.
    */
    createImageBitmap(snapCanvas).then((bitmap) => {
      highlightBufferRef.current.push(bitmap);
      console.log(`📸 하이라이트 캡처 (${reason} / ${poseType}): 총 ${highlightBufferRef.current.length}장`);
    });
  }, [videoRef]);


  // ────────────────────────────────────────────────
  // 🎞️ stopRecording : 캡처 프레임 → WebM 영상 변환
  // ────────────────────────────────────────────────

  /*
    세션 종료 시 호출하여 버퍼에 쌓인 ImageBitmap 프레임들을 WebM 영상으로 변환합니다.
    Promise를 반환하므로 호출부에서 await로 변환 완료를 기다릴 수 있습니다.

    ▼ 변환 방식 ▼
      1. 임시 canvas를 생성하고 captureStream()으로 MediaStream을 얻습니다.
      2. MediaRecorder로 스트림을 녹화합니다.
      3. requestAnimationFrame 루프로 각 ImageBitmap을 canvas에 순서대로 그립니다.
      4. 모든 프레임을 그린 뒤 recorder.stop()을 호출하면
         onstop 이벤트에서 Blob을 완성하여 Promise를 resolve합니다.

    ▼ 프레임 유지 시간 ▼
      FPS 30, 장당 1.5초 유지 → 프레임당 45회(rAF 루프)를 같은 이미지로 그립니다.

    ▼ 코덱 선택 ▼
      vp9 코덱을 우선 사용하고, 미지원 환경에서는 기본 webm으로 폴백합니다.

    @returns {Promise<{ blob: Blob, fileName: string } | null>}
             - 캡처된 프레임이 없으면 null을 반환합니다.
             - 성공 시 { blob, fileName } 객체를 반환합니다.
  */
  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const frames = highlightBufferRef.current;

      // 캡처된 프레임이 없으면 변환하지 않고 즉시 null 반환
      if (frames.length === 0) {
        console.log('⚠️ 하이라이트 프레임 없음');
        resolve(null);
        return;
      }

      console.log(`🎬 영상 변환 시작: 총 ${frames.length}장`);


      // ── 변환용 canvas + MediaRecorder 설정 ──────

      // 캡처된 첫 번째 프레임 크기로 canvas 크기를 맞춥니다.
      const canvas   = document.createElement('canvas');
      canvas.width   = frames[0].width;
      canvas.height  = frames[0].height;
      const ctx      = canvas.getContext('2d');

      // canvas를 30fps 스트림으로 변환합니다.
      const stream   = canvas.captureStream(30);

      // vp9 코덱 지원 여부에 따라 mimeType을 결정합니다.
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks   = [];

      // 데이터 청크가 생성될 때마다 배열에 누적합니다.
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunks.push(e.data);
      };

      // 녹화가 완전히 멈추면 Blob으로 합쳐 Promise를 완료합니다.
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        console.log('✅ 하이라이트 영상 완성! 크기:', blob.size, 'bytes');
        resolve({ blob, fileName: fileNameRef.current });
      };

      recorder.start();


      // ── rAF 루프 : 프레임 순서대로 canvas에 그리기 ─

      /*
        한 이미지를 HOLD_SEC(1.5초) 동안 유지하기 위해
        같은 이미지를 HOLD_FRAMES(45회) 연속으로 그립니다.
        frameIdx를 증가시켜 현재 그려야 할 이미지 인덱스를 계산합니다.
      */
      let frameIdx        = 0;
      const FPS           = 30;            // 초당 프레임 수
      const HOLD_SEC      = 1.5;           // 이미지 1장당 유지 시간 (초)
      const HOLD_FRAMES   = FPS * HOLD_SEC; // 이미지 1장당 그릴 rAF 횟수 (45회)

      const drawNextFrame = () => {
        const imageIdx = Math.floor(frameIdx / HOLD_FRAMES); // 현재 그릴 이미지 인덱스

        // 모든 이미지를 다 그렸으면 녹화를 종료합니다.
        if (imageIdx >= frames.length) {
          recorder.stop();
          stream.getTracks().forEach(t => t.stop()); // 스트림 트랙 해제
          return;
        }

        // 현재 이미지를 canvas에 그립니다.
        ctx.drawImage(frames[imageIdx], 0, 0);
        frameIdx++;

        // 다음 프레임 예약 (ID를 ref에 저장하여 clearRecording에서 취소 가능)
        animRef.current = requestAnimationFrame(drawNextFrame);
      };

      drawNextFrame(); // 루프 시작
    });
  }, []);


  // ────────────────────────────────────────────────
  // 🗑️ clearRecording : 캡처 버퍼 전체 초기화
  // ────────────────────────────────────────────────

  /*
    하이라이트 관련 모든 ref를 초기 상태로 되돌립니다.
    세션이 취소되거나 오류가 발생한 경우 호출하여 상태를 정리합니다.
  */
  const clearRecording = useCallback(() => {
    highlightBufferRef.current   = [];
    lastCaptureTimeRef.current   = 0;
    sessionStartTimeRef.current  = null;
    fileNameRef.current          = '';
    cancelAnimationFrame(animRef.current); // 진행 중인 변환 루프가 있으면 중단
  }, []);


  // ────────────────────────────────────────────────
  // 🦴 drawSkeleton : 스켈레톤 오버레이 그리기
  // ────────────────────────────────────────────────

  /*
    MediaPipe Holistic에서 반환된 랜드마크를 canvas에 시각화합니다.
    캘리브레이션 중 여부에 따라 두 가지 모드로 동작합니다.

    ▼ 캘리브레이션 모드 (isCalibrating = true) ▼
      주요 상체 관절(어깨·팔꿈치·손목·귀)만 가이드 색상으로 표시합니다.
      - 캘리브레이션 완료 : 초록색 (올바른 자세 안내)
      - 캘리브레이션 미완 : 노란색 (자세 교정 요청)

    ▼ 일반 모드 (isCalibrating = false) ▼
      전체 상체 관절과 얼굴 키포인트를 모두 표시합니다.
      - 연결선     : 파란 보라색 (rgba(99,102,241,.85))
      - 상체 관절  : 연한 보라색 (#a5b4fc)
      - 하체 관절  : 회색 (#94a3b8)
      - 얼굴 키포인트 : 노란색/빨간색 (부위별 구분)

    ▼ 랜드마크 인덱스 주요 참조 ▼
      7·8   : 귀 (ear)
      11·12 : 어깨 (shoulder)
      13·14 : 팔꿈치 (elbow)
      15·16 : 손목 (wrist)
      23·24 : 엉덩이 (hip)

    @param {Array}          poseLandmarks  - 신체 랜드마크 배열 (33개)
    @param {Array|null}     faceLandmarks  - 얼굴 랜드마크 배열 (468개), 없으면 null
    @param {HTMLCanvasElement} canvas      - 그릴 대상 canvas 요소
    @param {boolean}        isCalibrating  - 현재 캘리브레이션 중 여부
    @param {object|null}    calibration    - 캘리브레이션 완료 데이터
  */
  const drawSkeleton = useCallback((poseLandmarks, faceLandmarks, canvas, isCalibrating, calibration) => {
    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); // 이전 프레임 지우기

    // 신뢰도(visibility)가 이 값 미만인 랜드마크는 그리지 않습니다.
    const MIN_VIS = 0.3;


    // ── 캘리브레이션 모드 : 가이드 스켈레톤 표시 ──

    if (isCalibrating) {
      // 캘리브레이션 완료 여부에 따라 색상을 달리합니다.
      const guideColor = calibration
        ? 'rgba(34, 197, 94, 0.9)'  // 완료 : 초록색
        : 'rgba(234, 179, 8, 0.9)'; // 미완 : 노란색

      // 캘리브레이션에 필요한 핵심 상체 연결선만 표시합니다.
      const GUIDE_CONNECTIONS = [
        [11, 12], // 어깨(좌 - 우)
        [11, 13], // 왼쪽 어깨 - 팔꿈치
        [13, 15], // 왼쪽 팔꿈치 - 손목
        [12, 14], // 오른쪽 어깨 - 팔꿈치
        [14, 16], // 오른쪽 팔꿈치 - 손목
        [7,  11], // 왼쪽 귀 - 어깨
        [8,  12], // 오른쪽 귀 - 어깨
      ];

      ctx.strokeStyle = guideColor;
      ctx.lineWidth   = 5;

      GUIDE_CONNECTIONS.forEach(([a, b]) => {
        const lA = poseLandmarks[a];
        const lB = poseLandmarks[b];
        // 랜드마크가 없거나 신뢰도가 낮으면 연결선을 그리지 않습니다.
        if (!lA || !lB) return;
        if ((lA.visibility ?? 1) < MIN_VIS) return;
        if ((lB.visibility ?? 1) < MIN_VIS) return;

        ctx.beginPath();
        ctx.moveTo(lA.x * canvas.width, lA.y * canvas.height);
        ctx.lineTo(lB.x * canvas.width, lB.y * canvas.height);
        ctx.stroke();
      });

      // 핵심 관절 포인트를 원형으로 표시합니다.
      [7, 8, 11, 12, 13, 14, 15, 16].forEach(i => {
        const lm = poseLandmarks[i];
        if (!lm || (lm.visibility ?? 1) < MIN_VIS) return;

        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 8, 0, 2 * Math.PI);
        ctx.fillStyle = guideColor;
        ctx.fill();
      });

      return; // 캘리브레이션 모드에서는 여기서 종료
    }


    // ── 일반 모드 : 전체 상체 스켈레톤 표시 ──────

    // 표시할 관절 연결 쌍 정의
    const CONNECTIONS = [
      [11, 12], // 어깨 (좌 - 우)
      [11, 13], [13, 15], // 왼쪽 팔
      [12, 14], [14, 16], // 오른쪽 팔
      [11, 23], [12, 24], // 어깨 - 엉덩이 (몸통)
      [23, 24],           // 엉덩이 (좌 - 우)
      [7,  11], [8,  12], // 귀 - 어깨 (목 방향)
    ];

    ctx.strokeStyle = 'rgba(99, 102, 241, .85)'; // 파란 보라색 연결선
    ctx.lineWidth   = 3;

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

    // 모든 관절 포인트를 원형으로 표시합니다.
    poseLandmarks.forEach((lm, i) => {
      if (i <= 10) return;                         // 0~10번은 얼굴 랜드마크이므로 건너뜁니다.
      if ((lm.visibility ?? 1) < MIN_VIS) return;  // 신뢰도 낮은 랜드마크 제외

      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fillStyle = i <= 16
        ? '#a5b4fc' // 상체(어깨·팔·손목) : 연한 보라색
        : '#94a3b8'; // 하체(엉덩이 이하) : 회색
      ctx.fill();
    });

    // 얼굴 랜드마크 키포인트 표시 (faceLandmarks가 있을 때만)
    if (faceLandmarks) {
      /*
        얼굴 468개 랜드마크 중 자세 분석에 사용되는 핵심 포인트만 표시합니다.
          1   : 코끝 (머리 기울기 기준)
          152 : 턱 (하관 위치)
          234 : 왼쪽 광대 (얼굴 너비 기준)
          454 : 오른쪽 광대 (얼굴 너비 기준)
      */
      const KEY_POINTS = [
        { idx: 1,   color: '#fbbf24' }, // 코끝      : 노란색
        { idx: 152, color: '#f43f5e' }, // 턱        : 빨간색
        { idx: 234, color: '#fbbf24' }, // 왼쪽 광대 : 노란색
        { idx: 454, color: '#fbbf24' }, // 오른쪽 광대: 노란색
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


  // ────────────────────────────────────────────────
  // ⚙️ MediaPipe 초기화 및 자세 분석 루프
  // ────────────────────────────────────────────────

  /*
    active가 true로 바뀔 때 MediaPipe Holistic과 Camera를 초기화하고
    active가 false로 바뀌거나 컴포넌트가 언마운트될 때 모든 리소스를 정리합니다.

    ▼ 초기화 순서 ▼
      1. Holistic 인스턴스가 이미 있으면 재사용합니다. (불필요한 재초기화 방지)
      2. @mediapipe/holistic 동적 import (코드 스플리팅으로 초기 번들 크기 절약)
      3. Holistic 인스턴스 생성 및 onResults 콜백 등록
      4. Holistic 옵션 설정 및 모델 초기화
      5. Camera 인스턴스 생성 및 시작 (매 프레임을 Holistic에 공급)

    isCleaning 플래그 사용 이유:
      cleanup 함수 실행 후 Camera의 onFrame 콜백이 한 번 더 호출될 수 있습니다.
      isCleaning = true로 설정하면 이미 해제된 Holistic에 프레임을 보내는
      문제를 방지할 수 있습니다.
  */
  useEffect(() => {
    if (!active) return; // active가 false이면 아무것도 실행하지 않습니다.

    resetStaticTracking(); // STATIC 자세 감지 타이머 초기화
    let mounted   = true;  // 컴포넌트 마운트 여부 플래그
    let isCleaning = false; // cleanup 진행 중 여부 플래그

    const setup = async () => {

      // ── 기존 인스턴스 재사용 ─────────────────────

      /*
        Holistic이 이미 초기화된 경우 재초기화를 건너뜁니다.
        MediaPipe 모델 로드는 시간이 오래 걸리므로 재사용이 중요합니다.
      */
      if (holisticRef.current) {
        console.log('♻️ Holistic 재사용');
        return;
      }

      try {

        // ── MediaPipe 동적 import ────────────────

        /*
          동적 import를 사용하는 이유:
          @mediapipe/holistic 라이브러리는 크기가 크므로
          앱 초기 로딩 시점이 아닌 실제 필요할 때만 불러와 성능을 최적화합니다.
        */
        const { Holistic } = await import('@mediapipe/holistic');
        const { Camera }   = await import('@mediapipe/camera_utils');

        // MediaPipe 워커 스레드 초기화 대기 (안정성 확보를 위한 지연)
        await new Promise(resolve => setTimeout(resolve, 500));


        // ── Holistic 인스턴스 생성 ───────────────

        /*
          locateFile : MediaPipe가 WASM 파일을 찾을 경로를 지정합니다.
          /mediapipe/holistic/ 폴더에 WASM 파일이 정적으로 서빙되어야 합니다.
        */
        const holistic = new Holistic({
          locateFile: (file) => `${window.location.origin}/mediapipe/holistic/${file}`,
        });


        // ── onResults 콜백 : 매 프레임 자세 분석 ─

        holistic.onResults((results) => {
          if (!mounted || !canvasRef.current || !videoRef.current) return;

          const canvas  = canvasRef.current;
          const video   = videoRef.current;

          // canvas 크기를 video 표시 크기에 동기화합니다.
          // (video 크기가 변경되면 canvas도 함께 갱신)
          const displayW = video.clientWidth;
          const displayH = video.clientHeight;
          if (canvas.width !== displayW || canvas.height !== displayH) {
            canvas.width  = displayW;
            canvas.height = displayH;
          }

          const poseLandmarks = results.poseLandmarks;
          const faceLandmarks = results.faceLandmarks;

          // 신체 랜드마크가 없으면 분석하지 않습니다.
          if (!poseLandmarks) return;

          // 양쪽 어깨가 모두 감지되어야 분석이 가능합니다.
          const leftShoulder  = poseLandmarks[11];
          const rightShoulder = poseLandmarks[12];
          if (!leftShoulder || !rightShoulder) return;

          // canvas에 스켈레톤 오버레이를 그립니다.
          drawSkeleton(poseLandmarks, faceLandmarks, canvas, isCalibrating, calibrationRef.current);


          // ── 캘리브레이션 미완료 상태 ──────────

          /*
            캘리브레이션 데이터가 없으면 자세 분석을 수행할 수 없습니다.
            기본값(NORMAL)을 반환하여 UI가 정상 상태를 표시하도록 합니다.
          */
          if (!calibrationRef.current) {
            onPoseResultRef.current({
              pose      : { type: 'NORMAL', status: 'NORMAL', load: '5kg' },
              noise     : { status: 'NORMAL', val: dbRef.current || 0, msg: '' },
              landmarks : poseLandmarks,
              faceLandmarks,
            });
            return;
          }


          // ── 정면/측면 감지 모드 결정 ──────────

          /*
            두 어깨 사이의 거리(offset)로 카메라 방향을 판별합니다.
              offset >= 0.15 : 정면에서 촬영 중 (front 모드)
              offset < 0.15  : 옆면에서 촬영 중 (side 모드)
            → 자세 분석 알고리즘이 카메라 각도에 맞는 기준을 적용합니다.
          */
          const offset = Math.sqrt(
            Math.pow(poseLandmarks[11].x - poseLandmarks[12].x, 2) +
            Math.pow(poseLandmarks[11].y - poseLandmarks[12].y, 2)
          );
          const mode = offset >= 0.15 ? 'front' : 'side';

          // 현재 프레임의 자세·소음 상태를 분석합니다.
          const frameResult = evaluateSmartFocus(
            { landmarks: poseLandmarks, faceLandmarks, db: dbRef.current || 0, mode },
            calibrationRef.current,
          );

          // 현재 프레임의 자세 유형을 버퍼에 추가합니다.
          poseBufferRef.current.push(frameResult.pose.type);

          const BUFFER_MS = 1000; // 자세 판정 주기 (1초)
          const now       = Date.now();


          // ── 1초마다 자세 다수결 판정 ──────────

          /*
            매 프레임마다 콜백을 호출하면 UI가 너무 자주 갱신됩니다.
            BUFFER_MS(1초) 동안 수집된 자세 유형 중 가장 많이 나온 유형을
            최종 자세로 결정합니다. (다수결 방식)

            ▼ 다수결 판정 기준 ▼
              THRESHOLD(20%) 이상 비율로 등장한 자세 유형 중
              우선순위(STATIC > CHIN > SLUMP > TURTLE > TILT > NORMAL) 순으로 선택합니다.
              → 짧은 순간적인 자세 흔들림을 무시하고 지속적인 불량 자세만 감지합니다.

            ▼ warningRatio(경고 비율) 사용 목적 ▼
              같은 불량 자세라도 1초 중 50% 이상 감지되면 WARNING,
              20% 이상이면 CAUTION으로 구분하여 경고 강도를 달리합니다.
          */
          if (now - lastDispatchRef.current >= BUFFER_MS) {
            const buffer = poseBufferRef.current;
            const counts = { STATIC: 0, CHIN: 0, SLUMP: 0, TURTLE: 0, TILT: 0, NORMAL: 0 };

            // 각 자세 유형의 등장 횟수를 집계합니다.
            buffer.forEach(type => { if (type in counts) counts[type] += 1; });

            const total     = buffer.length;
            const THRESHOLD = 0.2; // 자세 유형이 20% 이상 등장해야 감지로 인정

            // 우선순위 순서대로 THRESHOLD를 초과한 첫 번째 자세를 최종으로 선택합니다.
            let finalType = 'NORMAL';
            switch (true) {
              case counts.STATIC / total >= THRESHOLD : finalType = 'STATIC'; break;
              case counts.CHIN   / total >= THRESHOLD : finalType = 'CHIN';   break;
              case counts.SLUMP  / total >= THRESHOLD : finalType = 'SLUMP';  break;
              case counts.TURTLE / total >= THRESHOLD : finalType = 'TURTLE'; break;
              case counts.TILT   / total >= THRESHOLD : finalType = 'TILT';   break;
              default                                 : finalType = 'NORMAL';
            }

            // 최종 자세 유형의 등장 비율로 경고 강도를 결정합니다.
            const warningFrames = buffer.filter(t => t === finalType).length;
            const warningRatio  = warningFrames / total;

            // 각 자세 유형별 상태·부하 정보 매핑
            const poseResultMap = {
              STATIC : { type: 'STATIC', status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '정적 부하'        },
              CHIN   : { type: 'CHIN',   status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '안면 비대칭 위험' },
              SLUMP  : { type: 'SLUMP',  status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '상체 지지력 상실' },
              TURTLE : { type: 'TURTLE', status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '거북목'           },
              TILT   : { type: 'TILT',   status: warningRatio >= 0.5 ? 'WARNING' : 'CAUTION', load: '척추 불균형'      },
              NORMAL : { type: 'NORMAL', status: 'NORMAL',                                    load: '5kg'             },
            };

            // 버퍼 초기화 및 마지막 디스패치 시각 갱신
            poseBufferRef.current   = [];
            lastDispatchRef.current = now;

            // 최종 분석 결과를 콜백으로 전달합니다.
            onPoseResultRef.current({
              pose      : poseResultMap[finalType],
              noise     : frameResult.noise,
              landmarks : poseLandmarks,
            });


            // ── 하이라이트 캡처 조건 체크 ────────

            const currentDb = dbRef.current || 0;

            // 조건 1 : 불량 자세가 감지된 경우
            if (finalType !== 'NORMAL') {
              captureHighlight('pose', finalType, currentDb);
            }

            // 조건 2 : 소음이 75dB 이상인 경우
            if (currentDb >= 75) {
              captureHighlight('noise', finalType, currentDb);
            }
          }
        });


        // ── Holistic 옵션 및 모델 초기화 ────────

        /*
          ▼ 주요 옵션 설명 ▼
            modelComplexity        : 모델 복잡도 (0~2, 높을수록 정확하지만 느림)
            smoothLandmarks        : 랜드마크 떨림을 부드럽게 보간합니다.
            refineFaceLandmarks    : 얼굴 랜드마크를 더 정밀하게 추출합니다.
            minDetectionConfidence : 초기 감지 최소 신뢰도 (0~1)
            minTrackingConfidence  : 추적 유지 최소 신뢰도 (0~1)
        */
        holistic.setOptions({
          modelComplexity        : 1,
          smoothLandmarks        : true,
          refineFaceLandmarks    : true,
          minDetectionConfidence : 0.5,
          minTrackingConfidence  : 0.5,
        });

        await holistic.initialize(); // WASM 모델 파일 로드 (시간 소요)
        holisticRef.current = holistic;


        // ── Camera 인스턴스 생성 및 시작 ────────

        /*
          MediaPipe Camera :
          웹캠 스트림을 받아 매 프레임마다 onFrame 콜백을 호출합니다.
          onFrame에서 holistic.send()로 프레임을 분석 파이프라인에 공급합니다.

          isCleaning 체크 이유:
          cleanup 직후 남은 onFrame 호출이 이미 close된 holistic에
          프레임을 보내지 않도록 방어합니다.
        */
        if (videoRef.current) {
          const camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (isCleaning || !holistic || !videoRef.current) return;
              try {
                await holistic.send({ image: videoRef.current });
              } catch (err) { /* holistic이 이미 close된 경우 무시 */ }
            },
            width  : 640,
            height : 480,
          });
          await camera.start();
          cameraRef.current = camera;
        }

      } catch (err) {
        console.error('❌ setup 에러:', err);
      }
    };

    setup();


    // ── Cleanup : 리소스 해제 ────────────────────

    /*
      useEffect의 반환 함수는 컴포넌트 언마운트 또는 의존성 변경 시 실행됩니다.

      ▼ 정리 순서 ▼
        1. mounted = false    : 비동기 콜백의 추가 실행을 즉시 차단합니다.
        2. isCleaning = true  : Camera의 onFrame이 holistic에 접근하지 못하도록 막습니다.
        3. cancelAnimationFrame : 변환 중인 rAF 루프가 있으면 중단합니다.
        4. camera.stop()      : 웹캠 스트림 공급을 중단합니다.
        5. setTimeout 300ms 뒤 holistic.close() :
           camera.stop() 후 마지막 onFrame 콜백이 완료될 시간을 주고 해제합니다.
           (즉시 close하면 진행 중인 send()가 오류를 발생시킬 수 있습니다.)
    */
    return () => {
      mounted    = false;
      isCleaning = true;
      cancelAnimationFrame(animRef.current);
      cameraRef.current?.stop?.();

      // 300ms 후 Holistic을 완전히 닫고 ref를 초기화합니다.
      setTimeout(() => {
        holisticRef.current?.close?.();
        holisticRef.current = null;
        cameraRef.current   = null;
      }, 300);
    };

  }, [active, drawSkeleton, captureHighlight]);
  //  ↑ active가 바뀌면 (감지 시작/중단) 재실행
  //    drawSkeleton, captureHighlight는 useCallback으로 메모이제이션되어
  //    실제로 재생성되지 않지만 안전을 위해 의존성에 명시합니다.


  // ── 훅 반환값 ────────────────────────────────────

  return { POSE_LABELS, startRecording, stopRecording, clearRecording };
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default : 이 훅을 다른 파일에서 import하여 사용할 수 있게 합니다.
  사용 예시:
    import usePoseDetector from '@/hooks/usePoseDetector';
    const { POSE_LABELS, startRecording, stopRecording, clearRecording } = usePoseDetector(
      videoRef, canvasRef, handlePoseResult, isActive, calibration, decibel, isCalibrating
    );
*/
export default usePoseDetector;
