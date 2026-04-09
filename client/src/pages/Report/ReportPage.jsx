// client/src/pages/Report/ReportPage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { getReportListAPI, getReportAPI, genFeedbackAPI } from '../../api/report.api';
import ScoreRing from '../../components/common/ScoreRing';
import Spinner from '../../components/common/Spinner';
import './ReportPage.css';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  ArcElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler
);

// ── 날짜 포맷 함수 (컴포넌트 밖 ✅ - Hook 아니므로 OK)
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── 시간 포맷 함수 (컴포넌트 밖 ✅ - Hook 아니므로 OK)
const formatTime = (timeStr) => {
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return timeStr.slice(0, 5);
};

// ── AI 피드백 JSON 파싱 함수 (컴포넌트 밖 ✅ - Hook 아니므로 OK)
const parseFeedback = (raw) => {
  if (!raw) return null;
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.오늘의총평 || parsed.긍정분석 || parsed.보완사항) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

// ── 집중 태그 렌더링 함수 (컴포넌트 밖 ✅ - Hook 아니므로 OK)
const renderTags = (tagStr) => {
  if (!tagStr) return null;
  const tags = tagStr.split(' ').filter(t => t.startsWith('#'));
  return (
    <div className="feedback-tags">
      {tags.map((tag, i) => (
        <span key={i} className="feedback-tag">{tag}</span>
      ))}
    </div>
  );
};

// ── AI 피드백 카드 컴포넌트 (컴포넌트 밖 ✅ - Hook 없으므로 OK)
const FeedbackCard = ({ raw }) => {
  const parsed = parseFeedback(raw);
  if (parsed) {
    return (
      <div className="feedback-box feedback-box--structured">
        {parsed.오늘의총평 && (
          <div className="feedback-section__summary">
            <span className="feedback-section__badge">오늘의 총평</span>
            <p className="feedback-summary-text">{parsed.오늘의총평}</p>
          </div>
        )}
        <div className="feedback-columns">
          {parsed.긍정분석 && (
            <div className="feedback-col feedback-col--positive">
              <div className="feedback-col__header">
                <span className="feedback-col__icon">✅</span>
                <span className="feedback-col__title">잘한 점</span>
              </div>
              <p className="feedback-col__content" style={{ whiteSpace: 'pre-line' }}>
                {parsed.긍정분석}
              </p>
            </div>
          )}
          {parsed.보완사항 && (
            <div className="feedback-col feedback-col--improve">
              <div className="feedback-col__header">
                <span className="feedback-col__icon">💡</span>
                <span className="feedback-col__title">보완할 점</span>
              </div>
              <p className="feedback-col__content" style={{ whiteSpace: 'pre-line' }}>
                {parsed.보완사항}
              </p>
            </div>
          )}
        </div>
        {parsed.집중태그 && renderTags(parsed.집중태그)}
      </div>
    );
  }
  return (
    <div className="feedback-box" style={{ whiteSpace: 'pre-line' }}>
      {raw}
    </div>
  );
};

// ── 메인 컴포넌트
const ReportPage = () => {
  const { imm_idx: paramIdx } = useParams();
  const navigate = useNavigate();

  // ✅ 모든 useState는 여기 컴포넌트 안에!
  const [sessions, setSessions] = useState([]);
  const [selIdx, setSelIdx] = useState(paramIdx || null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [page, setPage] = useState(1);       // ✅ 컴포넌트 안으로 이동
  const [hasMore, setHasMore] = useState(false);   // ✅ 컴포넌트 안으로 이동
  const [isRegenerating, setIsRegenerating] = useState(false); // ✅ 컴포넌트 안으로 이동

  // ✅ 재생성 핸들러도 컴포넌트 안으로 이동
  const handleRegenFeedback = useCallback(async () => {
    if (!selIdx || isRegenerating) return;
    setIsRegenerating(true);
    try {
      const { data } = await genFeedbackAPI(selIdx);
      setAiFeedback(data.data.feedback);
    } catch (err) {
      console.error('피드백 재생성 실패:', err);
    } finally {
      setIsRegenerating(false);
    }
  }, [selIdx, isRegenerating]);

  // ── 세션 목록 불러오기
  const fetchSessionList = useCallback(() => {
    getReportListAPI(page)
      .then(({ data }) => {
        if (page === 1) {
          setSessions(data.data);
        } else {
          setSessions(prev => [...prev, ...data.data]);
        }
        setHasMore(page < data.meta.totalPages);
        if (!selIdx && data.data.length > 0) {
          setSelIdx(String(data.data[0].imm_idx));
        }
      })
      .catch(console.error);
  }, [page, selIdx]);

  useEffect(() => {
    fetchSessionList();
  }, [paramIdx]);

  // ── 리포트 상세 불러오기
  useEffect(() => {
    if (!selIdx) return;
    setLoading(true);
    setReport(null);
    setAiFeedback('');

    getReportAPI(selIdx)
      .then(({ data }) => {
        setReport(data.data);
        if (data.data.feedbacks?.length > 0) {
          setAiFeedback(data.data.feedbacks[0].fb_content);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selIdx]);

  // ── 자세별 오류 횟수 막대그래프
  const buildPoseBarChart = useCallback(() => {
    if (!report?.summary?.poseTypeStat) return null;

    const LABEL_MAP = {
      TURTLE: '거북목',
      SLUMP: '엎드림',
      TILT: '몸 기울어짐',
      CHIN: '턱 괴기',
      STATIC: '장시간 고정',
    };

    const entries = Object.entries(report.summary.poseTypeStat)
      .filter(([k, v]) => k !== 'NORMAL' && LABEL_MAP[k] && v > 0);

    if (!entries.length) return null;

    return {
      labels: entries.map(([k]) => LABEL_MAP[k]),
      datasets: [{
        label: '감지 횟수',
        data: entries.map(([, v]) => v),
        backgroundColor: [
          'rgba(239,68,68,.75)',
          'rgba(249,115,22,.75)',
          'rgba(234,179,8,.75)',
          'rgba(168,85,247,.75)',
          'rgba(59,130,246,.75)',
        ],
        borderRadius: 6,
        borderWidth: 0,
      }],
    };
  }, [report]);

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
  };

  return (
    <div className="report-page">

      {/* ── 왼쪽: 세션 목록 사이드바 */}
      <aside className="report-sidebar">
        <div className="sidebar-header">
          <h3>📋 최근 세션 기록</h3>
          <span className="session-count">{sessions.length}개</span>
        </div>

        {sessions.length === 0 ? (
          <div className="sidebar-empty">
            <p>아직 집중 기록이 없습니다</p>
            <button className="btn btn--primary btn--sm" onClick={() => navigate('/camera')}>
              🚀 집중 시작
            </button>
          </div>
        ) : (
          <ul className="session-list">
            {sessions.slice(0, 5).map((s, idx) => (
              <li
                key={s.imm_idx}
                className={`session-item ${String(s.imm_idx) === String(selIdx) ? 'active' : ''}`}
                onClick={() => {
                  setSelIdx(String(s.imm_idx));
                  navigate(`/report/${s.imm_idx}`);
                }}
              >
                <div className="session-item__rank">#{idx + 1}</div>
                <div className="session-item__info">
                  <div className="session-item__date">📅 {formatDate(s.imm_date)}</div>
                  <div className="session-item__time">
                    🕐 {formatTime(s.start_time)} ~ {formatTime(s.end_time)}
                  </div>
                  <div className="session-item__stats">
                    <span className="stat-badge stat-badge--score">🏆 {s.imm_score}점</span>
                    <span className="stat-badge stat-badge--time">⏱ {s.duration_min ?? 0}분</span>
                  </div>
                  <div className="session-item__meta">
                    <span>⚠️ 자세오류 {s.bad_pose_count ?? 0}회</span>
                    <span>🔊 소음 {s.noise_count ?? 0}회</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <button
            className="btn btn--ghost btn--sm"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={() => setPage(p => p + 1)}
          >
            📋 더보기
          </button>
        )}
      </aside>

      {/* ── 오른쪽: 리포트 상세 */}
      <div className="report-detail">

        {loading && <Spinner text="리포트 불러오는 중..." />}

        {!loading && !report && (
          <div className="report-empty">
            <span className="report-empty__icon">📊</span>
            <p>왼쪽에서 세션을 선택하면 리포트가 표시됩니다.</p>
            <button className="btn btn--primary" onClick={() => navigate('/camera')}>
              🚀 집중 시작하기
            </button>
          </div>
        )}

        {!loading && report && (() => {
          const { immersion, summary, timelapses } = report;
          const poseBarChart = buildPoseBarChart();
          const streak = immersion.max_good_streak || 0;
          const streakMin = Math.floor(streak / 60);
          const streakSec = String(streak % 60).padStart(2, '0');

          return (
            <>
              {/* ── 1행: 요약 카드 */}
              <div className="report-summary-row">
                <div className="summary-card" style={{ borderTopColor: 'var(--color-primary)' }}>
                  <div className="summary-card__label">집중 점수</div>
                  <ScoreRing score={immersion.imm_score} size={60} />
                </div>
                <div className="summary-card" style={{ borderTopColor: 'var(--color-success)' }}>
                  <div className="summary-card__label">집중 시간</div>
                  <div className="summary-card__value">
                    {immersion.duration_min ?? 0}
                    <small style={{ fontSize: '.9rem' }}>분</small>
                  </div>
                  <div className="summary-card__sub">
                    {formatDate(immersion.imm_date)}<br />
                    {formatTime(immersion.start_time)} ~ {formatTime(immersion.end_time)}
                  </div>
                </div>
                <div className="summary-card" style={{ borderTopColor: 'var(--color-info, #0ea5e9)' }}>
                  <div className="summary-card__label">최고 연속 바른 자세</div>
                  <div className="summary-card__value">
                    {streakMin}<small style={{ fontSize: '.9rem' }}>분 </small>
                    {streakSec}<small style={{ fontSize: '.9rem' }}>초</small>
                  </div>
                  <div className="summary-card__sub">
                    {streakMin >= 5 ? '🏆 훌륭한 자세 유지력이에요!'
                      : streakMin >= 2 ? '👍 좋아요! 더 늘려봐요!'
                        : '💪 바른 자세를 더 유지해봐요!'}
                  </div>
                </div>
                <div className="summary-card" style={{ borderTopColor: 'var(--color-warning)' }}>
                  <div className="summary-card__label">평균 소음</div>
                  <div className="summary-card__value">
                    {summary.avgDecibel}
                    <small style={{ fontSize: '.9rem' }}>dB</small>
                  </div>
                  <div className="summary-card__sub">
                    소음 감지 {report.noises.length}회
                  </div>
                </div>
              </div>

              {/* ── 2행: 타임랩스 + 자세별 오류 횟수 */}
              <div className="report-main-row">
                {timelapses?.length > 0 ? (
                  <div className="timelapse-section">
                    <h3>🎬 타임랩스</h3>
                    <div className="timelapse-grid">
                      {timelapses.map(t => (
                        <div key={t.lapse_idx} className="timelapse-item">
                          <div className="timelapse-player">
                            <video id={`video-${t.lapse_idx}`} controls />
                          </div>
                          <div className="timelapse-upload-area">
                            <input
                              type="file"
                              accept="video/webm,video/*"
                              id={`file-${t.lapse_idx}`}
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                if (file.name !== t.file_name) {
                                  alert(`⚠️ 파일명이 다릅니다!\n\n필요한 파일: ${t.file_name}\n선택한 파일: ${file.name}`);
                                  e.target.value = '';
                                  return;
                                }
                                const url = URL.createObjectURL(file);
                                const videoEl = document.getElementById(`video-${t.lapse_idx}`);
                                if (videoEl) videoEl.src = url;
                              }}
                            />
                            <label htmlFor={`file-${t.lapse_idx}`} className="timelapse-upload-btn">
                              <span className="timelapse-upload-btn__icon">📂</span>
                              <span className="timelapse-upload-btn__text">파일 불러오기</span>
                              <span className="timelapse-upload-btn__desc">
                                저장된 타임랩스 파일을<br />선택해 주세요
                              </span>
                              <span className="timelapse-upload-btn__filename">
                                📄 {t.file_name}
                              </span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="timelapse-section timelapse-empty">
                    <h3>🎬 타임랩스</h3>
                    <div className="pose-perfect">
                      <span className="pose-perfect__icon">🎥</span>
                      <p>타임랩스가 없습니다.</p>
                      <p style={{ fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
                        집중 세션을 완료하면 자동으로 생성돼요!
                      </p>
                    </div>
                  </div>
                )}

                {poseBarChart ? (
                  <div className="chart-card timeline-card">
                    <h3>🧘 자세별 오류 횟수</h3>
                    <div className="chart-wrap">
                      <Bar
                        data={poseBarChart}
                        options={{
                          ...chartOpts,
                          plugins: { ...chartOpts.plugins, legend: { display: false } },
                          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="chart-card timeline-card">
                    <h3>🧘 자세별 오류 횟수</h3>
                    <div className="pose-perfect">
                      <span className="pose-perfect__icon">🏆</span>
                      <p>불량 자세가 감지되지 않았어요!</p>
                      <p style={{ fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
                        완벽한 자세로 집중하셨어요 👍
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 3행: AI 피드백 */}
              <div className="feedback-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                  <h3 style={{ margin: 0 }}>🤖 AI 피드백</h3>
                  {aiFeedback && (
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={handleRegenFeedback}
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? '⏳ 재생성 중...' : '🔄 피드백 재생성'}
                    </button>
                  )}
                </div>
                {aiFeedback ? (
                  <FeedbackCard raw={aiFeedback} />
                ) : (
                  <div className="feedback-empty">
                    <p>아직 피드백이 없습니다.</p>
                  </div>
                )}
              </div>

            </>
          );
        })()}
      </div>
    </div>
  );
};

export default ReportPage;
