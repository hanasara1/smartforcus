// client/src/hooks/useNoiseDetector.js

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// useEffect   : 컴포넌트 마운트/언마운트 시점에 마이크 연결과 해제를 처리하는 훅
// useRef      : 렌더링과 무관하게 값을 유지하는 참조 객체를 생성하는 훅
//               오디오 컨텍스트, 스트림 등 리렌더링 없이 관리해야 하는 값에 사용합니다.
// useCallback : 함수를 메모이제이션하여 불필요한 재생성을 방지하는 훅
//               의존성 배열의 값이 바뀔 때만 함수를 새로 만듭니다.
import { useEffect, useRef, useCallback } from 'react';


// ────────────────────────────────────────────────
// 🎙️ useNoiseDetector 커스텀 훅 (소음 감지)
// ────────────────────────────────────────────────

/*
  useNoiseDetector란?
  마이크로부터 실시간으로 음량을 측정하여 데시벨(dB)과 소음 레벨을
  주기적으로 콜백 함수에 전달하는 커스텀 훅입니다.

  ▼ 동작 방식 ▼
    [정상 모드] 브라우저의 Web Audio API로 마이크에 접근하여
               requestAnimationFrame 루프로 실시간 음량을 분석합니다.
    [Mock 모드] 마이크 접근 권한이 없거나 오류 발생 시
               setInterval로 30~70dB 범위의 난수를 생성하여 대체합니다.

  ▼ Props ▼
    @param {Function} onNoise - 소음 데이터를 전달받는 콜백 함수
                                { decibel: number, level: string } 형태의 객체를 인자로 받습니다.
    @param {boolean}  active  - true일 때만 마이크 감지를 시작합니다.
                                false이면 아무 동작도 하지 않습니다.

  ▼ onNoise 콜백 인자 구조 ▼
    - decibel : 측정된 음량 (dB 단위 정수)
    - level   : 'low' | 'mid' | 'high' (데시벨 구간별 레벨)
*/
const useNoiseDetector = (onNoise, active) => {

  // ── 내부 참조값(ref) 초기화 ──────────────────────

  /*
    useRef를 사용하는 이유:
    오디오 관련 객체들은 상태(state)가 아니라 렌더링과 무관한 리소스입니다.
    ref에 저장하면 값이 바뀌어도 리렌더링이 발생하지 않으며,
    cleanup 함수에서도 최신 값에 안전하게 접근할 수 있습니다.
  */
  const audioCtxRef  = useRef(null); // Web Audio API의 AudioContext 인스턴스
  const analyserRef  = useRef(null); // 주파수 데이터를 분석하는 AnalyserNode
  const streamRef    = useRef(null); // 마이크로부터 받아온 MediaStream
  const animFrameRef = useRef(null); // requestAnimationFrame의 ID (취소에 사용)
  const intervalRef  = useRef(null); // Mock 모드의 setInterval ID (취소에 사용)
  //                                    ↑ rAF와 interval을 별도 ref로 분리하여
  //                                      cleanup 시 각각 올바른 방식으로 정리합니다.


  // ── 데시벨 → 소음 레벨 변환 함수 ───────────────

  /*
    측정된 데시벨 값을 3단계 레벨 문자열로 변환합니다.

    ▼ 레벨 기준 ▼
      75dB 이상 : 'high' (높은 소음 - 집중 방해 수준)
      50dB 이상 : 'mid'  (중간 소음 - 주의 필요 수준)
      50dB 미만 : 'low'  (낮은 소음 - 양호한 수준)

    useCallback 적용 이유:
      의존성이 없는 순수 함수이므로 최초 생성 후 재생성되지 않습니다.
      아래 useEffect의 의존성 배열에 포함되어도 불필요한 재실행을 방지합니다.

    @param  {number} db    - 측정된 데시벨 값
    @returns {string}        'low' | 'mid' | 'high'
  */
  const getDecibelLevel = useCallback((db) => {
    if (db >= 75) return 'high';
    if (db >= 50) return 'mid';
    return 'low';
  }, []); // 의존성 없음 → 최초 생성 후 재생성되지 않음


  // ── 마이크 감지 시작 및 정리 ────────────────────

  /*
    active가 true로 바뀔 때 마이크 연결을 시작하고
    active가 false로 바뀌거나 컴포넌트가 언마운트될 때 모든 리소스를 정리합니다.

    mounted 플래그 사용 이유:
      비동기 작업(startAudio) 완료 전에 컴포넌트가 언마운트되면
      이미 해제된 리소스에 접근하는 문제가 발생할 수 있습니다.
      mounted = false로 설정하면 cleanup 이후의 콜백 실행을 차단합니다.
  */
  useEffect(() => {
    if (!active) return; // active가 false이면 아무것도 실행하지 않습니다.

    let mounted = true; // 컴포넌트 마운트 여부 플래그


    // ── [정상 모드] 마이크 연결 및 실시간 음량 분석 ──

    const startAudio = async () => {
      try {

        // 브라우저에 마이크 접근 권한을 요청합니다.
        // 사용자가 허용하면 마이크 스트림(MediaStream)을 반환합니다.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        /*
          AudioContext란?
          Web Audio API의 핵심 객체로 오디오 처리 파이프라인을 관리합니다.
          webkitAudioContext : 구형 Safari 브라우저 호환을 위한 폴백입니다.
        */
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = audioCtx;

        /*
          AnalyserNode란?
          오디오 스트림의 주파수 데이터를 실시간으로 분석하는 노드입니다.
          fftSize: 256 : FFT(고속 푸리에 변환) 샘플 크기를 256으로 설정합니다.
                         값이 클수록 정밀하지만 연산 비용이 증가합니다.
                         256이면 frequencyBinCount가 128개가 됩니다. (fftSize / 2)
        */
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        // 마이크 스트림 → AnalyserNode로 오디오 신호를 연결합니다.
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        // 주파수 데이터를 담을 배열 (0~255 사이의 정수값, 크기 = frequencyBinCount)
        const dataArray = new Uint8Array(analyser.frequencyBinCount);


        // ── requestAnimationFrame 루프 ────────────

        /*
          tick 함수란?
          매 프레임(약 60fps)마다 실행되어 마이크 음량을 측정하고 onNoise를 호출합니다.

          ▼ 데시벨 계산 공식 ▼
            avg     : 전체 주파수 빈(bin)의 평균값 (0~255)
            decibel : 20 × log10(avg + 1)
                      +1을 더하는 이유 : avg가 0일 때 log10(0) = -∞ 가 되는 것을 방지합니다.
        */
        const tick = () => {
          if (!mounted) return; // 언마운트 후 실행 차단

          // 현재 프레임의 주파수 데이터를 dataArray에 채웁니다.
          analyser.getByteFrequencyData(dataArray);

          // 모든 주파수 빈의 평균값을 계산합니다.
          const avg     = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;

          // 평균값을 데시벨(dB)로 변환합니다.
          const decibel = Math.round(20 * Math.log10(avg + 1));

          // 데시벨을 3단계 레벨 문자열로 변환합니다.
          const level   = getDecibelLevel(decibel);

          // 측정 결과를 콜백 함수로 전달합니다.
          onNoise({ decibel, level });

          // 다음 프레임에서 tick을 다시 실행하도록 예약합니다.
          // 반환되는 ID를 ref에 저장하여 cleanup 시 취소할 수 있게 합니다.
          animFrameRef.current = requestAnimationFrame(tick);
        };

        tick(); // 루프 시작

      } catch (err) {

        // ── [Mock 모드] 마이크 접근 실패 시 난수로 대체 ──

        /*
          마이크 권한 거부 또는 하드웨어 오류 발생 시 진입합니다.
          실제 마이크 대신 30~70dB 범위의 난수를 1초마다 생성하여
          실제 동작과 유사한 환경을 시뮬레이션합니다.
          개발 환경이나 마이크가 없는 기기에서도 기능이 동작하도록 보장합니다.
        */
        console.warn('마이크 접근 오류:', err.message);

        if (mounted) {
          intervalRef.current = setInterval(() => {
            // 30 이상 70 미만의 난수 데시벨 생성 (30 + 0~40 범위)
            const decibel = Math.round(30 + Math.random() * 40);
            onNoise({ decibel, level: getDecibelLevel(decibel) });
          }, 1000); // 1초마다 실행
        }
      }
    };

    startAudio();


    // ── Cleanup : 리소스 해제 ────────────────────

    /*
      useEffect의 반환 함수는 컴포넌트 언마운트 또는 의존성 변경 시 실행됩니다.
      오디오 관련 리소스를 해제하지 않으면 마이크가 계속 활성 상태로 남아
      메모리 누수와 배터리 소모가 발생합니다.

      ▼ 정리 순서 ▼
        1. mounted 플래그 → false : 비동기 콜백의 추가 실행을 즉시 차단합니다.
        2. cancelAnimationFrame   : rAF 루프(tick)를 중단합니다.
        3. clearInterval          : Mock 모드의 interval을 중단합니다.
        4. getTracks().stop()     : 마이크 스트림의 각 트랙을 종료합니다.
                                    (브라우저 탭의 마이크 사용 중 표시가 사라집니다.)
        5. audioCtx.close()       : AudioContext를 닫고 메모리를 해제합니다.

        ?.  옵셔널 체이닝 사용 이유 : 정상 모드가 아닌 Mock 모드에서는
            streamRef, audioCtxRef가 null이므로 안전하게 건너뜁니다.
    */
    return () => {
      mounted = false;
      cancelAnimationFrame(animFrameRef.current);          // rAF 루프 중단
      clearInterval(intervalRef.current);                  // Mock interval 중단
      streamRef.current?.getTracks().forEach(t => t.stop()); // 마이크 트랙 종료
      audioCtxRef.current?.close();                        // AudioContext 해제
    };

  }, [active, onNoise, getDecibelLevel]);
  //  ↑ active가 바뀌면 (감지 시작/중단) 재실행
  //    onNoise, getDecibelLevel은 부모 리렌더링 시 참조 변경을 감지하기 위해 포함
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default : 이 훅을 다른 파일에서 import하여 사용할 수 있게 합니다.
  사용 예시:
    import useNoiseDetector from '@/hooks/useNoiseDetector';
    useNoiseDetector(({ decibel, level }) => {
      console.log(decibel, level); // 예: 62, 'mid'
    }, isSessionActive);
*/
export default useNoiseDetector;
