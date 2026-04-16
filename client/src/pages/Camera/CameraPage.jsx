// client/src/pages/Camera/CameraPage.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React       : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
// useEffect   : 컴포넌트 생명주기에 따라 소켓·카메라·타이머를 초기화·해제하는 훅
// useRef      : 렌더링과 무관하게 값을 유지하는 참조 객체를 생성하는 훅
//               video·canvas 요소, 타이머 ID, 자세 카운트 등을 관리합니다.
// useState    : 세션 상태, 경과 시간, 점수 등 UI에 반영되는 상태를 관리하는 훅
// useCallback : 의존성이 바뀔 때만 함수를 재생성하여 불필요한 리렌더링을 방지하는 훅
import React, { useEffect, useRef, useState, useCallback } from 'react';

// useNavigate : 세션 종료 후 리포트 페이지로 이동시키는 훅
import { useNavigate } from 'react-router-dom';

// useAuth : 전역 인증 상태에서 JWT 토큰을 가져오는 커스텀 훅 (소켓 인증에 사용)
import { useAuth } from '../../context/AuthContext';

// connectSocket    : 서버 소켓에 연결하고 인스턴스를 반환하는 함수
// disconnectSocket : 소켓 연결을 종료하는 함수
// getSocket        : 현재 연결된 소켓 인스턴스를 반환하는 함수
import { connectSocket, disconnectSocket, getSocket } from '../../api/socket';

// startSessionAPI : 새 집중 세션을 서버에 생성하고 imm_idx를 받아오는 API 함수
// endSessionAPI   : 세션 종료 데이터(시간·점수·스트릭)를 서버에 전송하는 API 함수
import { startSessionAPI, endSessionAPI } from '../../api/immersion.api';

// uploadTimelapseAPI : 하이라이트 영상 파일명을 DB에 저장하는 API 함수
import { uploadTimelapseAPI } from '../../api/timelapse.api';

// usePoseDetector : MediaPipe 기반 실시간 자세 감지 + 하이라이트 캡처를 처리하는 커스텀 훅
// POSE_LABELS     : 자세 유형 코드 → 한글 라벨 매핑 상수
import usePoseDetector, { POSE_LABELS } from '../../hooks/usePoseDetector';

// useNoiseDetector : 마이크 기반 실시간 소음 감지를 처리하는 커스텀 훅
import useNoiseDetector from '../../hooks/useNoiseDetector';

// ScoreRing : 집중 점수를 원형 게이지로 표시하는 컴포넌트
import ScoreRing from '../../components/common/ScoreRing';

// CameraPage.css : 카메라 뷰, 패널, 컨트롤 버튼 등의 레이아웃 스타일
import './CameraPage.css';


// ────────────────────────────────────────────────
// ⏱️ 시간 포맷 유틸 함수
// ────────────────────────────────────────────────

/*
  fmt(s)란?
  초(second) 단위 숫자를 'MM:SS' 형식의 문자열로 변환합니다.
  타이머 표시에 사용됩니다.

  padStart(2, '0') : 한 자리 숫자를 두 자리로 맞춥니다. (예: 5 → '05')

  @param  {number} s - 변환할 초 단위 숫자
  @returns {string}    'MM:SS' 형식의 문자열 (예: 125 → '02:05')
*/
const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;


// ────────────────────────────────────────────────
// 📷 CameraPage 컴포넌트 (집중 세션 메인 페이지)
// ────────────────────────────────────────────────

/*
  CameraPage란?
  웹캠으로 자세를 감지하고 마이크로 소음을 측정하면서
  집중 세션을 시작·관리·종료하는 핵심 페이지 컴포넌트입니다.

  ▼ 세션 상태 흐름 (status) ▼
    idle
    → calibrating  : 기준 자세 등록 중
    → running      : 집중 세션 진행 중
    → paused       : 일시정지
    → running      : 재시작 (다시 calibrating을 거쳐 running으로 전환)
    → ended        : 세션 종료 완료

  ▼ 주요 기능 ▼
    - 자세 감지  : usePoseDetector → handlePose 콜백으로 점수·로그·스트릭 갱신
    - 소음 감지  : useNoiseDetector → handleNoise 콜백으로 dB 수치·경고 갱신
    - 소켓 연동  : 자세·소음 데이터를 서버로 실시간 전송, 피드백 수신
    - 하이라이트 : 불량 자세·고소음 발생 시 프레임 캡처 → 세션 종료 시 WebM 변환 후 다운로드
    - 연속 바른 자세 스트릭 : 최고 연속 기록을 서버에 함께 전송
*/
const CameraPage = () => {
  const { token } = useAuth();
  const navigate  = useNavigate();


  // ────────────────────────────────────────────────
  // 🗂️ ref 선언 (렌더링과 무관한 값 관리)
  // ────────────────────────────────────────────────

  /*
    ref를 사용하는 이유:
    이 값들은 변경되어도 리렌더링이 필요 없거나,
    콜백 클로저 안에서 항상 최신값을 읽어야 하는 경우에 사용합니다.
  */
  const videoRef      = useRef(null); // <video> 요소 : 웹캠 스트림 출력
  const canvasRef     = useRef(null); // <canvas> 요소 : 스켈레톤 오버레이 출력
  const timerRef      = useRef(null); // setInterval ID : 타이머 정리에 사용

  // 세션 중 수집된 데시벨 값 목록 (세션 종료 시 평균 계산에 사용)
  const decibelListRef  = useRef([]);

  // 기준 자세 캘리브레이션 데이터 (state와 동기화하여 콜백 안에서 최신값 참조)
  const calibrationRef  = useRef(null);

  // 자세 유형별 감지 횟수 (세션 종료 시 소켓으로 서버에 전송)
  const poseCountRef    = useRef({
    NORMAL: 0, TURTLE: 0, SLUMP: 0,
    TILT: 0, CHIN: 0, STATIC: 0,
  });

  // 웹캠 실제 해상도 (canvas 크기 동기화에 사용)
  const videoSizeRef    = useRef({ width: 640, height: 480 });


  // ── 연속 바른 자세 스트릭 ref ────────────────────

  /*
    스트릭(Streak)이란?
    바른 자세가 연속으로 유지된 시간(초)을 추적하는 지표입니다.
    state 대신 ref를 사용하는 이유 : 초마다 갱신되지만 UI에 직접 표시하지 않으므로
    리렌더링 없이 값만 누적합니다.
  */
  const goodStreakRef      = useRef(0);       // 현재 연속 바른 자세 시간 (초)
  const maxGoodStreakRef   = useRef(0);       // 세션 중 최고 연속 바른 자세 시간 (초)
  const lastPoseTypeRef   = useRef('NORMAL'); // 직전 프레임의 자세 유형 (스트릭 연속성 판단용)


  // ────────────────────────────────────────────────
  // 🔄 state 선언 (UI에 반영되는 값 관리)
  // ────────────────────────────────────────────────

  /*
    ▼ status 값과 의미 ▼
      'idle'        : 세션 시작 전 대기 상태
      'calibrating' : 기준 자세 등록 중
      'running'     : 집중 세션 진행 중
      'paused'      : 일시정지
      'ended'       : 세션 종료 완료
  */
  const [status,     setStatus]     = useState('idle');
  const [immIdx,     setImmIdx]     = useState(null);   // 현재 세션의 DB 고유 ID
  const [elapsed,    setElapsed]    = useState(0);      // 경과 시간 (초)
  const [score,      setScore]      = useState(100);    // 실시간 집중 점수 (0~100)
  const [poseBanner, setPoseBanner] = useState({ msg: '', type: 'good' }); // 자세 알림 배너
  const [poseLog,    setPoseLog]    = useState([]);     // 자세 이벤트 로그 (최대 30개)
  const [decibel,    setDecibel]    = useState(0);      // 현재 소음 데시벨
  const [noiseAlert, setNoiseAlert] = useState('');     // 소음 경고 메시지
  const [calibration, setCalibration] = useState(null); // 기준 자세 캘리브레이션 데이터
  const [isEnding,   setIsEnding]   = useState(false);  // 세션 종료 처리 중 여부 (중복 방지)


  // ── 파생 상태 (status에서 계산) ──────────────────

  /*
    boolean 파생 상태를 미리 계산하여 JSX에서 가독성을 높입니다.
    상태 문자열을 직접 비교하는 것보다 의미가 명확합니다.
  */
  const isRunning     = status === 'running';
  const isPaused      = status === 'paused';
  const isCalibrating = status === 'calibrating';


  // ── calibration state → ref 동기화 ─────────────

  /*
    calibration이 state와 ref 두 곳에 존재하는 이유:
    - state  : 변경 시 컴포넌트를 리렌더링하여 UI를 갱신합니다.
    - ref    : handlePose 콜백 클로저 안에서 항상 최신 calibration 값을 읽기 위해 사용합니다.
               클로저는 처음 생성 시의 state 값을 캡처하므로, state만 사용하면 이전 값을 참조합니다.
  */
  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);


  // ────────────────────────────────────────────────
  // 🦴 자세 감지 콜백
  // ────────────────────────────────────────────────

  /*
    handlePose란?
    usePoseDetector가 매 분석 주기(1초)마다 호출하는 콜백 함수입니다.
    분석 결과({ pose, noise, landmarks })를 받아 점수·로그·스트릭을 갱신합니다.

    ▼ 동작 흐름 ▼
      1. running 또는 calibrating 상태가 아니면 즉시 종료합니다.
      2. 캘리브레이션이 완료되지 않은 경우:
         랜드마크(귀·어깨)의 Y축 거리로 기준 자세를 자동 감지합니다.
      3. 캘리브레이션 완료 후 running 상태일 때:
         자세 유형 카운트를 증가시키고 점수·로그를 갱신합니다.

    ▼ 점수 계산 기준 ▼
      WARNING / CAUTION 자세 감지 : -2점 (최솟값 0)
      NORMAL 자세 유지             : +0.5점 (최댓값 100)

    ▼ 스트릭(streak) 계산 기준 ▼
      - 바른 자세가 직전 프레임에도 NORMAL이었을 때만 streak를 +1 증가합니다.
      - 불량 자세 감지 시 streak를 0으로 초기화합니다.
      - 매 프레임마다 maxGoodStreakRef와 비교하여 최고 기록을 갱신합니다.
  */
  const handlePose = useCallback(({ pose, noise, landmarks }) => {
    if (!isRunning && !isCalibrating) return;


    // ── 캘리브레이션 미완료 : 기준 자세 자동 감지 ───

    /*
      landmarks[7]  : 귀(ear) 랜드마크
      landmarks[11] : 어깨(shoulder) 랜드마크

      두 랜드마크의 Y축 거리(distY)가 0.05 이상이면
      상반신이 충분히 보이는 것으로 판단하여 기준 자세를 등록합니다.
    */
    if (!calibrationRef.current) {
      if (landmarks && landmarks[7] && landmarks[11]) {
        const distY = Math.abs(landmarks[7].y - landmarks[11].y);
        if (distY > 0.05) {
          const newCalibration = { distY };
          calibrationRef.current = newCalibration;
          setCalibration(newCalibration);
        }
      }
      return;
    }

    // 캘리브레이션 완료 후에도 running 상태가 아니면 아무것도 하지 않습니다.
    if (!isRunning) return;


    // ── 자세 유형 카운트 증가 ────────────────────────

    if (pose.type && pose.type in poseCountRef.current) {
      poseCountRef.current[pose.type] += 1;
    }

    // 자세 배너와 소음 데시벨을 즉시 갱신합니다.
    setPoseBanner({ msg: POSE_LABELS[pose.type] || '', type: pose.status });
    setDecibel(noise.val);

    // 소음 상태가 NORMAL이 아니면 경고 메시지를 표시합니다.
    if (noise.status !== 'NORMAL') setNoiseAlert(`🔊 ${noise.msg}`);
    else setNoiseAlert('');


    // ── 불량 자세 감지 : 점수 감소 + 로그 추가 ──────

    if (pose.status === 'WARNING' || pose.status === 'CAUTION') {
      setScore(p => Math.max(0, p - 2)); // 2점 감소 (최솟값 0)

      // 로그 앞에 추가하고 최대 30개로 제한합니다.
      setPoseLog(p => [{
        type   : pose.type,
        load   : pose.load,
        time   : new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }),
        status : pose.status,
      }, ...p].slice(0, 30));

      // 불량 자세 감지 시 연속 스트릭 초기화
      goodStreakRef.current    = 0;
      lastPoseTypeRef.current  = pose.type;


    // ── 바른 자세 유지 : 점수 증가 + 스트릭 증가 ───

    } else {
      setScore(p => Math.min(100, p + 0.5)); // 0.5점 증가 (최댓값 100)

      /*
        직전 자세(lastPoseTypeRef)가 NORMAL일 때만 streak를 증가합니다.
        → 불량 자세에서 바른 자세로 막 전환된 첫 프레임은 streak를 올리지 않습니다.
           (연속성이 이미 끊겼기 때문)
      */
      if (lastPoseTypeRef.current === 'NORMAL') {
        goodStreakRef.current += 1;

        // 현재 streak가 최고 기록보다 높으면 최고 기록 갱신
        if (goodStreakRef.current > maxGoodStreakRef.current) {
          maxGoodStreakRef.current = goodStreakRef.current;
        }
      }
      lastPoseTypeRef.current = 'NORMAL';
    }
  }, [isRunning, isCalibrating]);


  // ────────────────────────────────────────────────
  // 🕵️ usePoseDetector 훅 연결
  // ────────────────────────────────────────────────

  /*
    usePoseDetector가 반환하는 함수:
      - startRecording  : 세션 시작 시 하이라이트 캡처 초기화
      - stopRecording   : 세션 종료 시 캡처 프레임 → WebM 변환 (Promise 반환)
      - clearRecording  : 캡처 버퍼 완전 초기화 (종료 후 정리)

    active = isRunning || isCalibrating :
      세션 진행 중 또는 캘리브레이션 중에만 MediaPipe를 활성화합니다.
  */
  const { startRecording, stopRecording, clearRecording } = usePoseDetector(
    videoRef,
    canvasRef,
    handlePose,
    isRunning || isCalibrating, // active 조건
    calibration,
    decibel,
    isCalibrating,
  );


  // ────────────────────────────────────────────────
  // 🎙️ 소음 감지 콜백
  // ────────────────────────────────────────────────

  /*
    handleNoise란?
    useNoiseDetector가 주기적으로 호출하는 소음 감지 콜백 함수입니다.

    ▼ 동작 흐름 ▼
      1. 세션이 running 상태일 때만 처리합니다.
      2. 현재 데시벨을 화면에 표시하고 누적 목록에 추가합니다.
      3. 소음이 high(75dB 이상) 레벨이면 경고 메시지를 표시합니다.
      4. low가 아닌 경우 소켓으로 서버에 소음 데이터를 전송합니다.
         → 서버에서 리포트 분석에 활용됩니다.
  */
  const handleNoise = useCallback(({ decibel: db, level }) => {
    if (!isRunning) return;

    setDecibel(db);
    if (db > 0) decibelListRef.current.push(db); // 세션 중 평균 dB 계산용으로 누적

    // 소음 레벨에 따라 경고 메시지를 표시하거나 초기화합니다.
    if (level === 'high') setNoiseAlert(`🔊 소음 경고: ${db}dB`);
    else setNoiseAlert('');

    // low 레벨이 아닌 경우 소켓을 통해 서버에 소음 데이터를 전송합니다.
    const socket = getSocket();
    if (socket && immIdx && level !== 'low') {
      socket.emit('noise:data', {
        imm_idx    : immIdx,
        decibel    : db,
        obj_name   : '주변소음',
        reliability: 0.9,
      });
    }
  }, [immIdx, isRunning]);

  // useNoiseDetector : isRunning일 때만 마이크 감지를 활성화합니다.
  useNoiseDetector(handleNoise, isRunning);


  // ────────────────────────────────────────────────
  // ⏱️ 세션 타이머
  // ────────────────────────────────────────────────

  /*
    isRunning일 때만 1초마다 elapsed를 증가시킵니다.
    isRunning이 false로 바뀌면(일시정지·종료) clearInterval로 타이머를 멈춥니다.
    cleanup 함수에서도 clearInterval을 호출하여 메모리 누수를 방지합니다.
  */
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRunning]);


  // ────────────────────────────────────────────────
  // 🔌 소켓 이벤트 구독
  // ────────────────────────────────────────────────

  /*
    status가 'idle'이 아닐 때 소켓에 연결하고 서버 이벤트를 구독합니다.

    ▼ 구독하는 이벤트 ▼
      pose:feedback    : 서버의 자세 피드백 메시지를 배너에 표시합니다.
      noise:alert      : 서버의 소음 경고 메시지를 상태 바에 표시합니다.
      session:feedback : 세션 분석 완료 신호 수신 시 리포트 페이지로 이동합니다.
                         이동 전 소켓을 먼저 끊어 중복 연결을 방지합니다.

    cleanup 함수:
      컴포넌트가 언마운트되거나 status가 바뀔 때 이벤트 리스너를 제거합니다.
      (소켓 연결 자체는 유지하고 리스너만 해제)
  */
  useEffect(() => {
    if (status === 'idle') return;

    const socket = connectSocket(token);

    socket.on('pose:feedback', ({ message }) =>
      setPoseBanner(p => ({ ...p, msg: message }))
    );
    socket.on('noise:alert', ({ message }) =>
      setNoiseAlert(message)
    );
    socket.on('session:feedback', (data) => {
      const imm_idx = data?.imm_idx;
      disconnectSocket();
      navigate(`/report/${imm_idx}`);
    });

    // cleanup : 이벤트 리스너 제거 (소켓 연결은 유지)
    return () => {
      socket.off('pose:feedback');
      socket.off('noise:alert');
      socket.off('session:feedback');
    };
  }, [status, token, navigate]);


  // ────────────────────────────────────────────────
  // 📹 카메라 스트림 초기화
  // ────────────────────────────────────────────────

  /*
    컴포넌트 마운트 시 웹캠 스트림을 시작하고 <video>에 연결합니다.
    마운트 시 한 번만 실행됩니다. (의존성 배열 비어있음)

    ▼ 카메라 설정 ▼
      width/height    : 640×480 권장 해상도
      aspectRatio     : 4:3 비율
      facingMode: 'user' : 전면 카메라 사용

    ▼ 메타데이터 로드 후 처리 ▼
      - 실제 해상도를 videoSizeRef에 저장합니다.
      - canvas 크기를 실제 해상도에 맞게 조정합니다.
      - 줌(zoom) 기능을 지원하면 최솟값으로 설정하여 넓은 시야를 확보합니다.

    cleanup 함수:
      페이지를 떠날 때 웹캠 트랙을 모두 종료하고 소켓을 끊습니다.
  */
  useEffect(() => {
    let stream;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width       : { ideal: 640 },
            height      : { ideal: 480 },
            aspectRatio : { ideal: 4 / 3 },
            facingMode  : 'user', // 전면 카메라 사용
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // 비디오 메타데이터 로드 완료 후 실제 해상도 동기화
          videoRef.current.onloadedmetadata = () => {
            const track    = stream.getVideoTracks()[0];
            const settings = track.getSettings();

            // 실제 카메라 해상도를 ref에 저장합니다.
            videoSizeRef.current = {
              width  : settings.width  || 640,
              height : settings.height || 480,
            };

            // canvas 크기를 실제 비디오 해상도에 맞춥니다.
            if (canvasRef.current) {
              canvasRef.current.width  = videoSizeRef.current.width;
              canvasRef.current.height = videoSizeRef.current.height;
            }

            // 줌 기능 지원 시 최솟값으로 설정하여 화각을 최대로 확보합니다.
            const capabilities = track.getCapabilities();
            if (capabilities.zoom) {
              track.applyConstraints({
                advanced: [{ zoom: capabilities.zoom.min }],
              });
            }
          };
        }
      } catch {
        alert('카메라 접근 권한이 필요합니다.');
      }
    })();

    // cleanup : 페이지 이탈 시 웹캠 종료 + 소켓 연결 해제
    return () => {
      stream?.getTracks().forEach(t => t.stop());
      disconnectSocket();
    };
  }, []);


  // ────────────────────────────────────────────────
  // 🎮 세션 제어 함수들
  // ────────────────────────────────────────────────

  // ── 자세 등록(캘리브레이션) 시작 ────────────────

  /*
    기존 캘리브레이션 데이터를 초기화하고 'calibrating' 상태로 전환합니다.
    MediaPipe가 상반신을 감지하면 handlePose 내에서 자동으로 calibration이 설정됩니다.
  */
  const startCalibration = () => {
    setCalibration(null);
    calibrationRef.current = null;
    setStatus('calibrating');
  };


  // ── 자세 등록 확정 ───────────────────────────────

  /*
    캘리브레이션 데이터가 있으면 세션을 시작합니다.
    없으면 사용자에게 자세를 바로잡도록 안내합니다.
  */
  const confirmCalibration = async () => {
    if (!calibrationRef.current) {
      alert('자세를 인식하지 못했어요! 카메라 앞에 상반신이 잘 보이게 앉아주세요.');
      return;
    }
    await startSession();
  };


  // ── 세션 시작 ────────────────────────────────────

  /*
    startSession이 하는 일:
      1. 현재 시각으로 세션 날짜·시작 시간을 서버에 전송합니다.
      2. 서버로부터 받은 imm_idx를 상태에 저장합니다.
      3. 모든 누적 데이터(점수·로그·카운트·스트릭)를 초기값으로 리셋합니다.
      4. 하이라이트 캡처를 초기화하고 시작합니다. (startRecording)
  */
  const startSession = async () => {
    const now        = new Date();
    const imm_date   = now.toISOString().split('T')[0];         // 'YYYY-MM-DD'
    const start_time = now.toTimeString().split(' ')[0];        // 'HH:MM:SS'

    try {
      const { data } = await startSessionAPI({ imm_date, start_time });
      setImmIdx(data.data.imm_idx);
      setStatus('running');
      setElapsed(0);
      setScore(100);
      setPoseLog([]);
      decibelListRef.current  = [];
      poseCountRef.current    = { NORMAL: 0, TURTLE: 0, SLUMP: 0, TILT: 0, CHIN: 0, STATIC: 0 };

      // 연속 바른 자세 스트릭 초기화
      goodStreakRef.current    = 0;
      maxGoodStreakRef.current = 0;
      lastPoseTypeRef.current = 'NORMAL';

      startRecording(); // 하이라이트 캡처 시작

    } catch (err) {
      console.error('세션 시작 에러:', err);
      alert(err.response?.data?.message || '세션 시작 실패');
    }
  };


  // ── 일시정지 ─────────────────────────────────────

  /*
    세션을 일시정지하고 배너·경고 메시지를 초기화합니다.
    타이머와 자세 감지도 isRunning이 false가 되면서 자동으로 멈춥니다.
  */
  const pauseSession = () => {
    setStatus('paused');
    setNoiseAlert('');
    setPoseBanner({ msg: '', type: 'good' });
  };


  // ── 재시작 ───────────────────────────────────────

  /*
    일시정지 후 재시작 시 캘리브레이션을 초기화하고 'running' 상태로 복귀합니다.
    캘리브레이션을 초기화하는 이유 : 자리를 이동하거나 자세가 바뀔 수 있으므로
    재시작 시 handlePose가 다시 기준 자세를 자동 감지하도록 합니다.
  */
  const resumeSession = () => {
    setCalibration(null);
    calibrationRef.current = null;
    setStatus('running');
  };


  // ── 세션 종료 ────────────────────────────────────

  /*
    endSession이 하는 일:
      1. 중복 실행 방지 : immIdx가 없거나 isEnding이면 즉시 종료합니다.
      2. 서버에 종료 데이터(종료 시각·점수·최고 스트릭)를 전송합니다.
      3. stopRecording()으로 캡처 프레임을 WebM 영상으로 변환합니다.
      4. 변환된 영상을 브라우저 자동 다운로드 + DB에 파일명 저장합니다.
      5. 소켓으로 세션 분석 요청을 전송합니다. (서버가 피드백 후 리포트 페이지로 이동)
      6. 누적 데이터를 정리하고 'ended' 상태로 전환합니다.
  */
  const endSession = async () => {
    // 중복 실행 방지 (빠른 연속 클릭, 소켓 중복 호출 등 방어)
    if (!immIdx || isEnding) return;
    setIsEnding(true);

    const end_time        = new Date().toTimeString().split(' ')[0]; // 'HH:MM:SS'
    const imm_score       = Math.round(score);
    const max_good_streak = maxGoodStreakRef.current; // 최고 연속 바른 자세 시간 (초)

    try {
      // 서버에 종료 데이터 전송 (max_good_streak 포함)
      await endSessionAPI(immIdx, { end_time, imm_score, max_good_streak });


      // ── 하이라이트 영상 처리 ──────────────────────

      /*
        stopRecording() : 버퍼의 ImageBitmap 프레임들을 WebM 영상으로 변환합니다.
        캡처된 프레임이 없으면 null을 반환합니다.
      */
      const recording = await stopRecording();

      if (recording?.blob && recording?.fileName) {

        // 1. 브라우저 자동 다운로드 처리
        /*
          URL.createObjectURL : Blob을 브라우저 메모리상의 임시 URL로 변환합니다.
          <a> 태그를 동적 생성하여 클릭 → 다운로드를 트리거합니다.
          URL.revokeObjectURL : 다운로드 후 메모리에서 임시 URL을 해제합니다.
        */
        const url = URL.createObjectURL(recording.blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = recording.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✅ 하이라이트 영상 다운로드 완료:', recording.fileName);

        // 2. DB에 파일명 저장 (업로드 실패해도 세션 종료는 계속 진행)
        try {
          await uploadTimelapseAPI(immIdx, recording.fileName);
          console.log('✅ DB 파일명 저장 완료');
        } catch (tlErr) {
          console.error('DB 저장 실패 (무시):', tlErr.message);
        }

      } else {
        // 하이라이트 프레임이 없음 = 내내 바른 자세로 집중한 경우
        console.log('🎉 하이라이트 없음! 아주 바른 자세로 집중하셨어요!');
      }

      clearRecording(); // 캡처 버퍼 초기화


      // ── 소켓 세션 분석 요청 ───────────────────────

      /*
        서버에 세션 분석 요청을 전송합니다.
        서버는 분석 완료 후 'session:feedback' 이벤트로 응답하고,
        소켓 구독 핸들러가 리포트 페이지로 이동시킵니다.

        소켓 연결 상태에 따라:
          - 이미 연결됨  : 현재 소켓으로 즉시 전송
          - 연결 안 됨   : 새로 연결 후 connect 이벤트에서 전송
      */
      const avgDecibel    = calcAvgDecibel();
      const currentSocket = getSocket();
      const emitData      = {
        imm_idx     : immIdx,
        avg_decibel : avgDecibel,
        pose_count  : { ...poseCountRef.current },
      };

      if (currentSocket?.connected) {
        currentSocket.emit('session:request_feedback', emitData);
      } else {
        const newSocket = connectSocket(token);
        newSocket.once('connect', () => {
          newSocket.emit('session:request_feedback', emitData);
        });
      }

      // 누적 데이터 초기화
      decibelListRef.current = [];
      poseCountRef.current   = { NORMAL: 0, TURTLE: 0, SLUMP: 0, TILT: 0, CHIN: 0, STATIC: 0 };
      setStatus('ended');

    } catch (err) {
      console.error('세션 종료 에러:', err);
      alert(err.response?.data?.message || '세션 종료 실패');
    }
  };


  // ── 평균 데시벨 계산 ────────────────────────────

  /*
    세션 중 수집된 decibelListRef의 값들을 평균내어 반환합니다.
    데이터가 없으면 0을 반환합니다.
    세션 종료 시 소켓 데이터로 서버에 전송됩니다.
  */
  const calcAvgDecibel = () => {
    const list = decibelListRef.current;
    if (list.length === 0) return 0;
    return Number(list.reduce((acc, val) => acc + val, 0) / list.length);
  };


  // ── 리포트 페이지 이동 ──────────────────────────

  // 세션 종료 후 '리포트 보기' 버튼 클릭 시 해당 세션의 리포트 페이지로 이동합니다.
  const goReport = () => navigate(`/report/${immIdx}`);


  // ────────────────────────────────────────────────
  // 🎨 소음 시각화 계산값
  // ────────────────────────────────────────────────

  /*
    noiseColor : 데시벨 수치에 따라 소음 바의 색상을 결정합니다.
      75dB 이상 : 빨강 (경고 수준)
      50dB 이상 : 노랑 (주의 수준)
      50dB 미만 : 초록 (양호 수준)

    noisePct : 데시벨을 0~100% 비율로 변환하여 소음 바의 채움 너비에 사용합니다.
               최댓값을 100%로 고정합니다.
  */
  const noiseColor = decibel >= 75
    ? 'var(--color-error)'
    : decibel >= 50
      ? 'var(--color-warning)'
      : 'var(--color-success)';

  const noisePct = Math.min(100, (decibel / 100) * 100);


  // ────────────────────────────────────────────────
  // 🖥️ JSX 렌더링
  // ────────────────────────────────────────────────

  return (
    <div className="camera-page">

      {/* ════════════════════════════════
          📊 상단 상태 바
          현재 세션 상태·번호·소음 경고를 표시합니다.
          ════════════════════════════════ */}
      <div className="camera-status-bar">

        {/*
          status-chip : 현재 세션 상태를 색상 뱃지로 표시합니다.
          --running 클래스일 때 점(dot) 애니메이션을 함께 표시합니다.
        */}
        <span className={`status-chip status-chip--${
          status === 'running'     ? 'running'     :
          status === 'paused'      ? 'paused'      :
          status === 'calibrating' ? 'calibrating' : 'idle'
        }`}>
          {status === 'running' && <span className="status-chip__dot" />}
          {status === 'idle'        ? '대기 중'          :
           status === 'calibrating' ? '📐 자세 등록 중'  :
           status === 'running'     ? '집중 중'          :
           status === 'paused'      ? '⏸ 일시정지'       : '세션 종료'}
        </span>

        {/* 세션 ID : running 또는 paused 상태일 때만 표시 */}
        {(isRunning || isPaused) && (
          <span style={{ color: 'var(--color-text-muted)', fontSize: '.85rem' }}>
            세션 #{immIdx}
          </span>
        )}

        {/* 소음 경고 : 일시정지 중에는 표시하지 않습니다. */}
        {noiseAlert && !isPaused && (
          <span className="status-chip status-chip--paused">{noiseAlert}</span>
        )}

      </div>


      {/* ════════════════════════════════
          📐 메인 그리드 : 카메라 뷰 + 우측 패널
          ════════════════════════════════ */}
      <div className="camera-grid">

        {/* ── 카메라 뷰 영역 ────────────────────── */}
        <div className="camera-view">

          {/* 웹캠 영상 출력 */}
          <video ref={videoRef} autoPlay playsInline muted />

          {/* 스켈레톤 오버레이 canvas : video 위에 절대 위치로 겹쳐 표시 */}
          <canvas ref={canvasRef} />


          {/* 일시정지 오버레이 : isPaused일 때만 화면 위에 표시 */}
          {isPaused && (
            <div className="pause-overlay">
              <div className="pause-overlay__content">
                <span className="pause-overlay__icon">⏸</span>
                <p>일시정지 중</p>
                <p style={{ fontSize: '.85rem', opacity: .8 }}>
                  자세 감지가 중단되었습니다
                </p>
              </div>
            </div>
          )}

          {/*
            자세 배너 : 감지된 자세 유형을 화면 하단에 표시합니다.
            일시정지 중 또는 캘리브레이션 중에는 숨깁니다.
          */}
          {poseBanner.msg && !isPaused && !isCalibrating && (
            <div className={`pose-banner pose-banner--${poseBanner.type}`}>
              {poseBanner.type === 'bad' ? '⚠️' : '✅'} {poseBanner.msg}
            </div>
          )}

          {/*
            소음 미터 : running 중에만 우하단에 표시합니다.
            noisePct에 따라 바의 채움 너비와 noiseColor에 따라 색상이 변경됩니다.
          */}
          {isRunning && (
            <div className="noise-meter-overlay">
              <span className="noise-db">{decibel}dB</span>
              <div className="noise-bar">
                <div
                  className="noise-fill"
                  style={{ width: `${noisePct}%`, background: noiseColor }}
                />
              </div>
            </div>
          )}

        </div>


        {/* ── 우측 정보 패널 ────────────────────── */}
        <div className="camera-panel">

          {/* 경과 시간 카드 */}
          <div className="panel-card">
            <h3>⏱ 집중 시간</h3>
            <div
              className="session-timer"
              style={{ color: isPaused ? 'var(--color-text-muted)' : undefined }}
            >
              {fmt(elapsed)}
              {/* 일시정지 상태일 때 타이머 옆에 '일시정지' 표시 */}
              {isPaused && (
                <span style={{ fontSize: '.7rem', marginLeft: 8 }}>일시정지</span>
              )}
            </div>
          </div>

          {/* 실시간 집중 점수 카드 */}
          <div className="panel-card">
            <h3>📈 실시간 점수</h3>
            <div className="live-score-wrap">
              {/* ScoreRing : 점수를 원형 게이지로 시각화 */}
              <ScoreRing score={Math.round(score)} size={110} />
            </div>
          </div>

          {/* 자세 이벤트 로그 카드 */}
          <div className="panel-card">
            <h3>📋 자세 로그</h3>
            {poseLog.length === 0
              ? (
                // 로그가 없을 때 안내 문구 표시
                <p className="text-muted" style={{ fontSize: '.8rem' }}>
                  집중 시작 후 자세 감지 기록이 표시됩니다
                </p>
              ) : (
                // 최대 30개의 자세 이벤트를 시간 역순(최신순)으로 표시합니다.
                <ul className="pose-log">
                  {poseLog.map((p, i) => (
                    <li
                      key={i}
                      className={`pose-log-item pose-log-item--${p.status}`}
                    >
                      <span className="pose-log-item__time">{p.time}</span>
                      <span>{POSE_LABELS[p.type] || p.type}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </div>


          {/* ── 세션 제어 버튼 영역 ──────────────── */}
          {/*
            status 값에 따라 적절한 버튼 조합을 조건부로 렌더링합니다.
            각 상태에서 가능한 동작만 노출하여 UX를 단순화합니다.
          */}
          <div className="camera-controls">

            {/* idle : 자세 등록 시작 버튼 */}
            {status === 'idle' && (
              <button className="btn btn--primary btn--lg" onClick={startCalibration}>
                📐 자세 등록 후 시작
              </button>
            )}

            {/* calibrating : 자세 인식 완료 여부에 따라 버튼 상태 변경 */}
            {status === 'calibrating' && (
              <>
                <p className="calibration-guide-text">
                  {calibration
                    ? '✅ 자세가 인식됐어요! 버튼을 눌러 집중을 시작하세요!'
                    : '📐 카메라를 바라보며 올바른 자세를 취해주세요!'}
                </p>
                {/*
                  자세 인식 전 : outline 스타일 + disabled 처리
                  자세 인식 후 : primary 스타일로 변경되어 활성화
                */}
                <button
                  className={`btn btn--lg ${calibration ? 'btn--primary' : 'btn--outline'}`}
                  onClick={confirmCalibration}
                  disabled={!calibration}
                >
                  {calibration ? '🚀 집중 시작!' : '⏳ 자세 인식 중...'}
                </button>
                <button
                  className="btn btn--ghost btn--lg"
                  onClick={() => setStatus('idle')}
                >
                  ✖ 취소
                </button>
              </>
            )}

            {/* running : 일시정지 + 종료 버튼 */}
            {status === 'running' && (
              <>
                <button className="btn btn--warning btn--lg" onClick={pauseSession}>
                  ⏸ 일시정지
                </button>
                {/*
                  isEnding일 때 버튼을 비활성화하여
                  종료 처리 중 중복 클릭을 방지합니다.
                */}
                <button
                  className="btn btn--danger btn--lg"
                  onClick={endSession}
                  disabled={isEnding}
                >
                  {isEnding ? '⏳ 종료 중...' : '⏹ 집중 종료'}
                </button>
              </>
            )}

            {/* paused : 재시작 + 종료 버튼 */}
            {status === 'paused' && (
              <>
                <button className="btn btn--primary btn--lg" onClick={resumeSession}>
                  ▶ 재시작
                </button>
                <button className="btn btn--danger btn--lg" onClick={endSession}>
                  ⏹ 집중 종료
                </button>
              </>
            )}

            {/* ended : 리포트 페이지 이동 버튼 */}
            {status === 'ended' && (
              <button className="btn btn--primary" onClick={goReport}>
                📊 리포트 보기
              </button>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default : 이 컴포넌트를 다른 파일에서 import하여 사용할 수 있게 합니다.
  사용 예시 (라우터 설정):
    import CameraPage from '@/pages/Camera/CameraPage';
    <Route path="/camera" element={<CameraPage />} />
*/
export default CameraPage;
