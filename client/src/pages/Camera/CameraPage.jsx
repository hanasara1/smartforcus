// client/src/pages/Camera/CameraPage.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { connectSocket, disconnectSocket, getSocket } from '../../api/socket';
import { startSessionAPI, endSessionAPI } from '../../api/immersion.api';
import { uploadTimelapseAPI } from '../../api/timelapse.api';
import usePoseDetector, { POSE_LABELS } from '../../hooks/usePoseDetector';
import useNoiseDetector from '../../hooks/useNoiseDetector';
import ScoreRing from '../../components/common/ScoreRing';
import './CameraPage.css';

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const CameraPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();

  // ── ref 선언
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const decibelListRef = useRef([]);
  const calibrationRef = useRef(null);
  const poseCountRef = useRef({
    NORMAL: 0, TURTLE: 0, SLUMP: 0,
    TILT: 0, CHIN: 0, STATIC: 0,
  });
  const videoSizeRef = useRef({ width: 640, height: 480 });

  // ✅ ref 추가 선언 (기존 ref 선언 아래에 추가)
  const goodStreakRef = useRef(0); // 현재 연속 바른 자세 시간 (초)
  const maxGoodStreakRef = useRef(0); // 최고 연속 바른 자세 시간 (초)
  const lastPoseTypeRef = useRef('NORMAL'); // 직전 자세 타입

  // ── state 선언
  const [status, setStatus] = useState('idle'); // idle | calibrating | running | paused | ended
  const [immIdx, setImmIdx] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [score, setScore] = useState(100);
  const [poseBanner, setPoseBanner] = useState({ msg: '', type: 'good' });
  const [poseLog, setPoseLog] = useState([]);
  const [decibel, setDecibel] = useState(0);
  const [noiseAlert, setNoiseAlert] = useState('');
  const [calibration, setCalibration] = useState(null);
  const [isEnding, setIsEnding] = useState(false); // ✅ 종료 처리 중 상태

  // ── 파생 상태
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isCalibrating = status === 'calibrating';

  // ── calibration state → ref 동기화
  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

  // ✅ handlePose 콜백 안에 streak 계산 추가
  // ── 자세 감지 콜백
  const handlePose = useCallback(({ pose, noise, landmarks }) => {
    if (!isRunning && !isCalibrating) return;

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

    if (!isRunning) return;

    if (pose.type && pose.type in poseCountRef.current) {
      poseCountRef.current[pose.type] += 1;
    }

    setPoseBanner({ msg: POSE_LABELS[pose.type] || '', type: pose.status });
    setDecibel(noise.val);
    if (noise.status !== 'NORMAL') setNoiseAlert(`🔊 ${noise.msg}`);
    else setNoiseAlert('');

    if (pose.status === 'WARNING' || pose.status === 'CAUTION') {
      setScore(p => Math.max(0, p - 2));
      setPoseLog(p => [{
        type: pose.type,
        load: pose.load,
        time: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }),
        status: pose.status,
      }, ...p].slice(0, 30));

      // ✅ 불량 자세 감지 시 streak 초기화
      goodStreakRef.current = 0;
      lastPoseTypeRef.current = pose.type;

    } else {
      setScore(p => Math.min(100, p + 0.5));

      // ✅ 바른 자세일 때 streak 증가 (1초마다 handlePose 호출 기준)
      if (lastPoseTypeRef.current === 'NORMAL') {
        goodStreakRef.current += 1;
        // ✅ 최고 기록 갱신
        if (goodStreakRef.current > maxGoodStreakRef.current) {
          maxGoodStreakRef.current = goodStreakRef.current;
        }
      }
      lastPoseTypeRef.current = 'NORMAL';
    }
  }, [isRunning, isCalibrating]);

  // ✅ usePoseDetector 반환값 변경
  const { startRecording, stopRecording, getRecording, clearRecording } = usePoseDetector(
    videoRef, canvasRef, handlePose,
    isRunning || isCalibrating,
    calibration, decibel,
    isCalibrating,
  );

  // ── 소음 감지 콜백
  const handleNoise = useCallback(({ decibel: db, level }) => {
    if (!isRunning) return;
    setDecibel(db);
    if (db > 0) decibelListRef.current.push(db);
    if (level === 'high') setNoiseAlert(`🔊 소음 경고: ${db}dB`);
    else setNoiseAlert('');
    const socket = getSocket();
    if (socket && immIdx && level !== 'low') {
      socket.emit('noise:data', {
        imm_idx: immIdx, decibel: db, obj_name: '주변소음', reliability: 0.9,
      });
    }
  }, [immIdx, isRunning]);

  useNoiseDetector(handleNoise, isRunning);

  // ── 타이머
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRunning]);

  // ── 소켓 이벤트 구독
  useEffect(() => {
    if (status === 'idle') return;
    const socket = connectSocket(token);
    socket.on('pose:feedback', ({ message }) => setPoseBanner(p => ({ ...p, msg: message })));
    socket.on('noise:alert', ({ message }) => setNoiseAlert(message));
    socket.on('session:feedback', (data) => {
      const imm_idx = data?.imm_idx;
      disconnectSocket();
      navigate(`/report/${imm_idx}`);
    });
    return () => {
      socket.off('pose:feedback');
      socket.off('noise:alert');
      socket.off('session:feedback');
    };
  }, [status, token, navigate]);

  // ── 카메라 스트림
  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            aspectRatio: { ideal: 4 / 3 },
            facingMode: 'user',
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            videoSizeRef.current = {
              width: settings.width || 640,
              height: settings.height || 480,
            };
            if (canvasRef.current) {
              canvasRef.current.width = videoSizeRef.current.width;
              canvasRef.current.height = videoSizeRef.current.height;
            }
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
    return () => {
      stream?.getTracks().forEach(t => t.stop());
      disconnectSocket();
    };
  }, []);

  // ── 자세 등록 시작
  const startCalibration = () => {
    setCalibration(null);
    calibrationRef.current = null;
    setStatus('calibrating');
  };

  // ── 자세 등록 확정
  const confirmCalibration = async () => {
    if (!calibrationRef.current) {
      alert('자세를 인식하지 못했어요! 카메라 앞에 상반신이 잘 보이게 앉아주세요.');
      return;
    }
    await startSession();
  };

  // ✅ startSession 함수 안에 녹화 시작 추가
  // ✅ startSession 함수 안에 streak 초기화 추가
  const startSession = async () => {
    const now = new Date();
    const imm_date = now.toISOString().split('T')[0];
    const start_time = now.toTimeString().split(' ')[0];
    try {
      const { data } = await startSessionAPI({ imm_date, start_time });
      setImmIdx(data.data.imm_idx);
      setStatus('running');
      setElapsed(0);
      setScore(100);
      setPoseLog([]);
      decibelListRef.current = [];
      poseCountRef.current = { NORMAL: 0, TURTLE: 0, SLUMP: 0, TILT: 0, CHIN: 0, STATIC: 0 };

      // ✅ streak 초기화
      goodStreakRef.current = 0;
      maxGoodStreakRef.current = 0;
      lastPoseTypeRef.current = 'NORMAL';

      startRecording();
    } catch (err) {
      console.error('세션 시작 에러:', err);
      alert(err.response?.data?.message || '세션 시작 실패');
    }
  };

  // ── 일시정지
  const pauseSession = () => {
    setStatus('paused');
    setNoiseAlert('');
    setPoseBanner({ msg: '', type: 'good' });
  };

  // ── 재시작
  const resumeSession = () => {
    setCalibration(null);
    calibrationRef.current = null;
    setStatus('running');
  };

  // ✅ endSession 함수 안에 max_good_streak 전송 추가
  const endSession = async () => {
    // ✅ 중복 실행 방지
    if (!immIdx || isEnding) return;
    setIsEnding(true);

    if (!immIdx) return;
    const end_time = new Date().toTimeString().split(' ')[0];
    const imm_score = Math.round(score);

    // ✅ 최고 연속 바른 자세 시간 (초 → 분 반올림)
    const max_good_streak = maxGoodStreakRef.current;

    try {
      // ✅ max_good_streak 함께 전송
      await endSessionAPI(immIdx, { end_time, imm_score, max_good_streak });

      // ✅ endSession 함수 안 타임랩스 부분
      const recording = await stopRecording();

      if (recording?.blob && recording?.fileName) {

        // ✅ 1. 브라우저 자동 다운로드
        const url = URL.createObjectURL(recording.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = recording.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✅ 하이라이트 영상 다운로드 완료:', recording.fileName);

        // ✅ 2. DB에 파일명만 저장
        try {
          await uploadTimelapseAPI(immIdx, recording.fileName);
          console.log('✅ DB 파일명 저장 완료');
        } catch (tlErr) {
          console.error('DB 저장 실패 (무시):', tlErr.message);
        }
      } else {
        // ✅ 하이라이트가 없는 경우 (아주 바른 자세로만 집중!)
        console.log('🎉 하이라이트 없음! 아주 바른 자세로 집중하셨어요!');
      }

      clearRecording();

      // ── 소켓 emit (기존 코드 그대로!)
      const avgDecibel = calcAvgDecibel();
      const currentSocket = getSocket();
      const emitData = {
        imm_idx: immIdx,
        avg_decibel: avgDecibel,
        pose_count: { ...poseCountRef.current },
      };
      if (currentSocket?.connected) {
        currentSocket.emit('session:request_feedback', emitData);
      } else {
        const newSocket = connectSocket(token);
        newSocket.once('connect', () => {
          newSocket.emit('session:request_feedback', emitData);
        });
      }

      decibelListRef.current = [];
      poseCountRef.current = { NORMAL: 0, TURTLE: 0, SLUMP: 0, TILT: 0, CHIN: 0, STATIC: 0 };
      setStatus('ended');

    } catch (err) {
      console.error('세션 종료 에러:', err);
      alert(err.response?.data?.message || '세션 종료 실패');
    }
  };

  const calcAvgDecibel = () => {
    const list = decibelListRef.current;
    if (list.length === 0) return 0;
    return Number(list.reduce((acc, val) => acc + val, 0) / list.length);
  };

  const goReport = () => navigate(`/report/${immIdx}`);

  const noiseColor = decibel >= 75
    ? 'var(--color-error)'
    : decibel >= 50
      ? 'var(--color-warning)'
      : 'var(--color-success)';
  const noisePct = Math.min(100, (decibel / 100) * 100);

  return (
    <div className="camera-page">
      {/* 상태 바 */}
      <div className="camera-status-bar">
        <span className={`status-chip status-chip--${status === 'running' ? 'running' :
          status === 'paused' ? 'paused' :
            status === 'calibrating' ? 'calibrating' : 'idle'
          }`}>
          {status === 'running' && <span className="status-chip__dot" />}
          {status === 'idle' ? '대기 중' :
            status === 'calibrating' ? '📐 자세 등록 중' :
              status === 'running' ? '집중 중' :
                status === 'paused' ? '⏸ 일시정지' : '세션 종료'}
        </span>

        {(isRunning || isPaused) && (
          <span style={{ color: 'var(--color-text-muted)', fontSize: '.85rem' }}>
            세션 #{immIdx}
          </span>
        )}

        {noiseAlert && !isPaused && (
          <span className="status-chip status-chip--paused">{noiseAlert}</span>
        )}
      </div>

      {/* 메인 그리드 */}
      <div className="camera-grid">
        {/* 카메라 뷰 */}
        <div className="camera-view">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} />

          {/* 일시정지 오버레이 */}
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

          {poseBanner.msg && !isPaused && !isCalibrating && (
            <div className={`pose-banner pose-banner--${poseBanner.type}`}>
              {poseBanner.type === 'bad' ? '⚠️' : '✅'} {poseBanner.msg}
            </div>
          )}

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

        {/* 우측 패널 */}
        <div className="camera-panel">
          {/* 타이머 */}
          <div className="panel-card">
            <h3>⏱ 집중 시간</h3>
            <div
              className="session-timer"
              style={{ color: isPaused ? 'var(--color-text-muted)' : undefined }}
            >
              {fmt(elapsed)}
              {isPaused && (
                <span style={{ fontSize: '.7rem', marginLeft: 8 }}>일시정지</span>
              )}
            </div>
          </div>

          {/* 실시간 점수 */}
          <div className="panel-card">
            <h3>📈 실시간 점수</h3>
            <div className="live-score-wrap">
              <ScoreRing score={Math.round(score)} size={110} />
            </div>
          </div>

          {/* 자세 로그 */}
          <div className="panel-card">
            <h3>📋 자세 로그</h3>
            {poseLog.length === 0
              ? (
                <p className="text-muted" style={{ fontSize: '.8rem' }}>
                  집중 시작 후 자세 감지 기록이 표시됩니다
                </p>
              ) : (
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

          {/* 컨트롤 버튼 */}
          <div className="camera-controls">
            {status === 'idle' && (
              <button className="btn btn--primary btn--lg" onClick={startCalibration}>
                📐 자세 등록 후 시작
              </button>
            )}

            {status === 'calibrating' && (
              <>
                <p className="calibration-guide-text">
                  {calibration
                    ? '✅ 자세가 인식됐어요! 버튼을 눌러 집중을 시작하세요!'
                    : '📐 카메라를 바라보며 올바른 자세를 취해주세요!'}
                </p>
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

            {status === 'running' && (
              <>
                <button className="btn btn--warning btn--lg" onClick={pauseSession}>
                  ⏸ 일시정지
                </button>
                
                <button
                  className="btn btn--danger btn--lg"
                  onClick={endSession}
                  disabled={isEnding} // ✅ 종료 중엔 비활성화
                >
                  {isEnding ? '⏳ 종료 중...' : '⏹ 집중 종료'}
                </button>
              </>
            )}

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

export default CameraPage;
