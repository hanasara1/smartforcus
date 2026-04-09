// client/src/hooks/useNoiseDetector.js

import { useEffect, useRef, useCallback } from 'react';

const useNoiseDetector = (onNoise, active) => {
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const intervalRef = useRef(null); // ✅ setInterval 전용 ref 분리

  const getDecibelLevel = useCallback((db) => {
    if (db >= 75) return 'high';
    if (db >= 50) return 'mid';
    return 'low';
  }, []);

  useEffect(() => {
    if (!active) return;
    let mounted = true;

    const startAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!mounted) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
          const decibel = Math.round(20 * Math.log10(avg + 1));
          const level = getDecibelLevel(decibel);
          onNoise({ decibel, level });
          animFrameRef.current = requestAnimationFrame(tick); // ✅ rAF 전용
        };
        tick();

      } catch (err) {
        console.warn('마이크 접근 오류:', err.message);
        if (mounted) {
          // ✅ Mock 모드 - interval 전용 ref 사용
          intervalRef.current = setInterval(() => {
            const decibel = Math.round(30 + Math.random() * 40);
            onNoise({ decibel, level: getDecibelLevel(decibel) });
          }, 1000);
        }
      }
    };

    startAudio();

    return () => {
      mounted = false;
      // ✅ 각각 올바른 방법으로 정리
      cancelAnimationFrame(animFrameRef.current);
      clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
    };
  }, [active, onNoise, getDecibelLevel]);
};

export default useNoiseDetector;
