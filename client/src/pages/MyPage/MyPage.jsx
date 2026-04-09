// client/src/pages/MyPage/MyPage.jsx
import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useAuth } from '../../context/AuthContext';
import { getMeAPI, getMyStatsAPI, updateMeAPI, getMyPoseStatsAPI, getRankingAPI, getMyStreakAPI } from '../../api/user.api';
import { getBadgeListAPI, purchaseBadgeAPI } from '../../api/badge.api';
import { getPointHistoryAPI } from '../../api/point.api';
import Spinner from '../../components/common/Spinner';
import './MyPage.css';
import { getSkinListAPI, purchaseSkinAPI, applySkinAPI } from '../../api/skin.api';
import StreakCalendar from '../../components/common/StreakCalendar';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ✅ 날짜 포맷 함수 추가 (UTC 변환 방지)
const formatChartDate = (dateStr) => {
  if (!dateStr) return '';
  // 'T' 앞부분만 잘라서 UTC 변환 없이 사용
  const [year, month, day] = dateStr.split('T')[0].split('-');
  return `${month}-${day}`;
};

// ── 포인트 타입 라벨
const POINT_TYPE_LABELS = {
  welcome: '🎁 웰컴 포인트',
  daily_login: '📅 출석 체크 +10P',
  streak_7: '🔥 7일 연속 출석 보너스 +50P',
  streak_30: '👑 30일 연속 출석 보너스 +300P',
  badge_purchase: '🏅 뱃지 구매',
  session_complete: '⏱ 집중 세션 완료 +10P',
  best_record: '🏆 최고 기록 갱신 +10P',
};
const pointLabel = (type) => {
  const base = type.split(':')[0];
  return POINT_TYPE_LABELS[base] || `⭐ 세션 보상 (${type.split(':')[1] || ''})`;
};

// ── 자세 유형 매핑
const POSE_LABEL_MAP = {
  TURTLE: { label: '거북목', icon: '🐢', color: 'rgba(239,68,68,.15)', border: '#ef4444' },
  SLUMP: { label: '엎드림', icon: '😴', color: 'rgba(249,115,22,.15)', border: '#f97316' },
  TILT: { label: '몸 기울어짐', icon: '↗️', color: 'rgba(234,179,8,.15)', border: '#eab308' },
  CHIN: { label: '턱 괴기', icon: '🤔', color: 'rgba(168,85,247,.15)', border: '#a855f7' },
  STATIC: { label: '장시간 고정', icon: '🪨', color: 'rgba(59,130,246,.15)', border: '#3b82f6' },
};

const MyPage = () => {
  const { logout } = useAuth();

  // ── 탭
  const [tab, setTab] = useState('stats');

  // ── 데이터 상태
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [poseStats, setPoseStats] = useState([]);
  const [badges, setBadges] = useState([]);
  const [points, setPoints] = useState({ list: [], total: 0 });
  const [ranking, setRanking] = useState(null);

  // ── 로딩 상태
  const [loading, setLoading] = useState(true);
  const [badgeLoading, setBadgeLoading] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);

  // ── 닉네임 변경 폼
  const [nickForm, setNickForm] = useState({ nick: '' });
  const [nickMsg, setNickMsg] = useState({ type: '', text: '' });
  const [nickLoading, setNickLoading] = useState(false);

  // ── 비밀번호 변경 폼
  const [pwdForm, setPwdForm] = useState({ currentPwd: '', newPwd: '', newPwdConfirm: '' });
  const [pwdMsg, setPwdMsg] = useState({ type: '', text: '' });
  const [pwdLoading, setPwdLoading] = useState(false);

  // ── 스킨 상태 변수 추가
  const [skins, setSkins] = useState([]);
  const [skinLoading, setSkinLoading] = useState(false);

  // 상태 기반 메시지로 교체
  const [toast, setToast] = useState({ type: '', text: '' });

  // 포인트 탭 - 내역 합산 표시 추가
  const pointSum = points.list.reduce((sum, p) => sum + p.reward_point, 0);

  // streak 상태 추가
  const [streak, setStreak] = useState(null);

  // ✅ 토스트 메시지 헬퍼 함수 (3초 후 자동 사라짐)
  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast({ type: '', text: '' }), 3000);
  };

  // ── 초기 데이터 로드
  useEffect(() => {
    Promise.all([getMeAPI(), getMyStatsAPI(), getMyPoseStatsAPI(), getMyStreakAPI(),])
      .then(([pr, sr, poser, streakr]) => {
        setProfile(pr.data.data);
        setStats(sr.data.data);
        setPoseStats(poser.data.data);
        setStreak(streakr.data.data);
        setNickForm({ nick: pr.data.data.nick });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ✅ 탭별 추가 로드 - 이미 데이터가 있으면 스킵
  useEffect(() => {
    if (tab === 'badges' && badges.length === 0) {
      setBadgeLoading(true);
      getBadgeListAPI()
        .then(({ data }) => setBadges(data.data))
        .catch(console.error)
        .finally(() => setBadgeLoading(false));
    }
    if (tab === 'points' && points.list.length === 0) {
      getPointHistoryAPI()
        .then(({ data }) => setPoints({ list: data.data, total: data.meta.total }))
        .catch(console.error);
    }
    if (tab === 'skins' && skins.length === 0) {
      setSkinLoading(true);
      getSkinListAPI()
        .then(({ data }) => setSkins(data.data))
        .catch(console.error)
        .finally(() => setSkinLoading(false));
    }
    if (tab === 'ranking' && !ranking) {
      setRankingLoading(true);
      getRankingAPI()
        .then(({ data }) => setRanking(data.data))
        .catch(console.error)
        .finally(() => setRankingLoading(false));
    }
  }, [tab]);

  // ✅ 수정된 코드
  const weeklyChart = stats?.weekly?.length ? {
    labels: stats.weekly.map(w => formatChartDate(w.imm_date)),
    datasets: [{
      label: '평균 집중 점수',
      data: stats.weekly.map(w => Math.round(w.avg_score)),
      backgroundColor: 'rgba(99,102,241,.7)',
      borderColor: '#6366f1',
      borderWidth: 1,
      borderRadius: 6,
    }],
  } : null;

  // ── 뱃지 구매
  const handlePurchase = async (badge_idx, badge_name) => {
    if (!window.confirm(`'${badge_name}' 뱃지를 구매하시겠습니까?`)) return;
    try {
      const { data } = await purchaseBadgeAPI(badge_idx);
      showToast('success', data.message);
      getBadgeListAPI().then(({ data: bd }) => setBadges(bd.data));
      getMeAPI().then(({ data: pd }) => setProfile(pd.data.data));
    } catch (err) {
      showToast('error', err.response?.data?.message || '구매 실패');
    }
  };

  // ── 스킨 구매
  const handlePurchaseSkin = async (skin_idx, skin_name, skin_price) => {
    if (!window.confirm(`'${skin_name}' 스킨을 ${skin_price}P에 구매하시겠습니까?`)) return;
    try {
      const { data } = await purchaseSkinAPI(skin_idx);
      showToast('success', data.message);
      getSkinListAPI().then(({ data: sd }) => setSkins(sd.data));
      getMeAPI().then(({ data: pd }) => setProfile(pd.data.data));
    } catch (err) {
      showToast('error', err.response?.data?.message || '구매 실패');
    }
  };

  // ── 스킨 적용
  const handleApplySkin = async (skin_idx) => {
    try {
      const { data } = await applySkinAPI(skin_idx);
      document.body.setAttribute('data-skin', data.data.skin_key);
      getSkinListAPI().then(({ data: sd }) => setSkins(sd.data));
      showToast('success', data.message);
    } catch (err) {
      showToast('error', err.response?.data?.message || '적용 실패');
    }
  };

  // ── 닉네임 변경
  const handleNickSubmit = async e => {

    e.preventDefault();
    setNickMsg({ type: '', text: '' });

    if (!nickForm.nick.trim()) {
      return setNickMsg({ type: 'error', text: '닉네임을 입력해주세요.' });
    }

    // ✅ 현재 닉네임과 동일하면 스킵
    if (nickForm.nick === profile?.nick) {
      return setNickMsg({ type: 'error', text: '현재 닉네임과 동일합니다.' });
    }

    setNickLoading(true);

    try {
      await updateMeAPI({ nick: nickForm.nick });
      setNickMsg({ type: 'success', text: '닉네임이 수정되었습니다.' });
      setProfile(prev => ({ ...prev, nick: nickForm.nick }));
    } catch (err) {
      setNickMsg({ type: 'error', text: err.response?.data?.message || '닉네임 수정 실패' });
    } finally {
      setNickLoading(false);
    }
  };

  // ── 비밀번호 변경
  const handlePwdSubmit = async e => {
    e.preventDefault();
    setPwdMsg({ type: '', text: '' });
    if (!pwdForm.currentPwd) {
      return setPwdMsg({ type: 'error', text: '현재 비밀번호를 입력해주세요.' });
    }
    if (!pwdForm.newPwd) {
      return setPwdMsg({ type: 'error', text: '새 비밀번호를 입력해주세요.' });
    }
    // ✅ 길이 검증 추가
    if (pwdForm.newPwd.length < 8) {
      return setPwdMsg({ type: 'error', text: '새 비밀번호는 8자 이상이어야 합니다.' });
    }
    if (pwdForm.newPwd !== pwdForm.newPwdConfirm) {
      return setPwdMsg({ type: 'error', text: '새 비밀번호가 일치하지 않습니다.' });
    }
    setPwdLoading(true);
    try {
      await updateMeAPI({ currentPwd: pwdForm.currentPwd, newPwd: pwdForm.newPwd });
      setPwdMsg({ type: 'success', text: '비밀번호가 변경되었습니다.' });
      setPwdForm({ currentPwd: '', newPwd: '', newPwdConfirm: '' });
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.response?.data?.message || '비밀번호 변경 실패' });
    } finally {
      setPwdLoading(false);
    }
  };

  if (loading) return <Spinner text="마이페이지 불러오는 중..." />;

  return (
    <div className="mypage">

      {/* ── 프로필 히어로 */}
      <div className="mypage-hero">
        <div className="hero-avatar">{profile?.nick?.[0]?.toUpperCase() || '?'}</div>
        <div className="hero-info">
          <h2 className="hero-nick">{profile?.nick}</h2>
          <p className="hero-email">{profile?.email}</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat__val">{stats?.session_count ?? 0}</span>
              <span className="hero-stat__label">세션</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat__val">{stats?.total_minutes ?? 0}</span>
              <span className="hero-stat__label">집중분</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat__val">{stats?.avg_score ?? 0}</span>
              <span className="hero-stat__label">평균점수</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat__val">{profile?.total_points ?? 0}</span>
              <span className="hero-stat__label">포인트</span>
            </div>
          </div>
        </div>
      </div>

      {/* // ✅ 토스트 메시지 UI - 프로필 히어로 아래에 추가 */}
      {toast.text && (
        <div className={`toast toast--${toast.type}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.text}
        </div>
      )}

      {/* ── 탭 네비게이션 */}
      <div className="mypage-tabs">
        {[
          ['stats', '📊 통계'],
          ['ranking', '🏆 랭킹'],
          ['badges', '🏅 뱃지'],
          ['skins', '🎨 스킨'],
          ['points', '💎 포인트'],
          ['settings', '⚙️ 설정'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════
          📊 통계 탭
      ════════════════════════════ */}
      {tab === 'stats' && (
        <div className="tab-content tab-content--stats">

          {/* 요약 카드 4개 */}
          <div className="stats-grid">
            <div className="stat-card">
              <h4>총 집중 세션</h4>
              <div className="stat-card__val">
                {stats?.session_count ?? 0}
                <span style={{ fontSize: '.9rem' }}>회</span>
              </div>
            </div>
            <div className="stat-card">
              <h4>총 집중 시간</h4>
              <div className="stat-card__val">
                {Math.floor((stats?.total_minutes ?? 0) / 60)}
                <span style={{ fontSize: '.9rem' }}>시간 </span>
                {(stats?.total_minutes ?? 0) % 60}
                <span style={{ fontSize: '.9rem' }}>분</span>
              </div>
            </div>
            <div className="stat-card">
              <h4>평균 집중 점수</h4>
              <div className="stat-card__val">
                {stats?.avg_score ?? 0}
                <span style={{ fontSize: '.9rem' }}>점</span>
              </div>
            </div>
            <div className="stat-card">
              <h4>누적 포인트</h4>
              <div className="stat-card__val" style={{ color: 'var(--color-warning)' }}>
                {profile?.total_points ?? 0}
                <span style={{ fontSize: '.9rem' }}>P</span>
              </div>
            </div>
          </div>

          {/* 주간 차트 */}
          <div className="stat-card stat-card--wide">
            <h4>최근 7일 집중 점수</h4>
            {weeklyChart ? (
              <div style={{ height: 200, marginTop: 12 }}>
                <Bar
                  data={weeklyChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { min: 0, max: 100 } },
                  }}
                />
              </div>
            ) : (
              <div className="empty-state empty-state--sm">
                <span className="empty-state__icon">📊</span>
                <p>아직 집중 기록이 없습니다.</p>
                <p style={{ fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
                  집중 세션을 완료하면 차트가 표시돼요!
                </p>
              </div>
            )}
          </div>

          {/* 자세 패턴 분석 */}
          <div className="pose-stats-section">
            <h4 className="pose-stats__title">🧘 내 취약 자세 Top 3</h4>
            {/* ✅ POSE_LABEL_MAP에 없는 항목 필터링 후 렌더링 */}
            {poseStats.filter(p => POSE_LABEL_MAP[p.pose_type]).length === 0 ? (
              <div className="empty-state empty-state--sm">
                <span className="empty-state__icon">🏆</span>
                <p>불량 자세가 감지되지 않았어요!</p>
                <p style={{ fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
                  바른 자세를 잘 유지하고 계세요 👍
                </p>
              </div>
            ) : (
              <div className="pose-stats-list">
                {poseStats
                  .filter(p => POSE_LABEL_MAP[p.pose_type])  // ✅ GOOD, BAD, WARNING 등 제외
                  .slice(0, 3)                                // ✅ 최대 3개만 표시
                  .map((p, idx) => {
                    const info = POSE_LABEL_MAP[p.pose_type];
                    const validStats = poseStats.filter(p => POSE_LABEL_MAP[p.pose_type]);
                    const maxCount = validStats[0]?.total_count || 1;
                    const percent = Math.round((p.total_count / maxCount) * 100);
                    return (
                      <div
                        key={p.pose_type}
                        className="pose-stat-item"
                        style={{ background: info.color, borderLeft: `4px solid ${info.border}` }}
                      >
                        <div className="pose-stat-item__left">
                          <span className="pose-stat-item__rank">#{idx + 1}</span>
                          <span className="pose-stat-item__icon">{info.icon}</span>
                          <span className="pose-stat-item__label">{info.label}</span>
                        </div>
                        <div className="pose-stat-item__right">
                          <div className="pose-stat-bar">
                            <div
                              className="pose-stat-bar__fill"
                              style={{ width: `${percent}%`, background: info.border }}
                            />
                          </div>
                          <span className="pose-stat-item__count">{p.total_count}회</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* 출석 스트릭 섹션 — ✅ streak !== null 이면 항상 표시 */}
          {streak !== null && (
            <div className="streak-section">

              {/* 상단 요약 카드 3개 */}
              <div className="streak-summary">
                <div className="streak-summary__card">
                  <div className="streak-summary__icon">🔥</div>
                  <div className="streak-summary__val">{streak.current_streak}</div>
                  <div className="streak-summary__label">현재 연속 출석</div>
                  <div className="streak-summary__sub">일</div>
                </div>
                <div className="streak-summary__card streak-summary__card--highlight">
                  <div className="streak-summary__icon">🏆</div>
                  <div className="streak-summary__val">{streak.max_streak}</div>
                  <div className="streak-summary__label">최장 연속 기록</div>
                  <div className="streak-summary__sub">일</div>
                </div>
                <div className="streak-summary__card">
                  <div className="streak-summary__icon">📅</div>
                  <div className="streak-summary__val">{streak.monthly_count}</div>
                  <div className="streak-summary__label">이번 달 출석</div>
                  <div className="streak-summary__sub">일</div>
                </div>
              </div>

              {/* 동기부여 메시지 */}
              <div className="streak-motivation">
                {streak.current_streak === 0 && (
                  <span>💡 오늘 로그인하면 스트릭이 시작돼요!</span>
                )}
                {streak.current_streak >= 1 && streak.current_streak < 7 && (
                  <span>🌱 {streak.current_streak}일 연속 출석 중! 7일 보너스까지 {7 - streak.current_streak}일 남았어요!</span>
                )}
                {streak.current_streak >= 7 && streak.current_streak < 30 && (
                  <span>🔥 {streak.current_streak}일 연속 출석 중! 30일 보너스까지 {30 - streak.current_streak}일 남았어요!</span>
                )}
                {streak.current_streak >= 30 && (
                  <span>👑 {streak.current_streak}일 연속 출석! 대단한 집중력이에요!</span>
                )}
              </div>

              {/* 잔디 캘린더 */}
              <div className="streak-calendar-wrap">
                <div className="streak-calendar-wrap__header">
                  <h4>📆 최근 12주 출석 현황</h4>
                  <span className="streak-total-badge">
                    누적 {streak.total_count}일 출석
                  </span>
                </div>
                {/* ✅ 출석 기록이 없어도 캘린더는 항상 표시, 빈 잔디로 렌더링 */}
                <StreakCalendar
                  attendanceDates={streak.attendance_dates ?? []}
                  weeks={12}
                />
                {/* ✅ 출석 기록이 아예 없을 때 안내 문구 */}
                {streak.total_count === 0 && (
                  <p style={{
                    textAlign: 'center',
                    fontSize: '.8rem',
                    color: 'var(--color-text-muted)',
                    marginTop: 'var(--spacing-sm)',
                  }}>
                    아직 출석 기록이 없어요. 매일 로그인하면 잔디가 채워져요! 🌱
                  </p>
                )}
              </div>

            </div>
          )}

        </div>
      )}

      {/* ════════════════════════════
          🏆 랭킹 탭
      ════════════════════════════ */}
      {tab === 'ranking' && (
        <div className="tab-content tab-content--ranking">

          {rankingLoading && <Spinner text="랭킹 불러오는 중..." />}

          {!rankingLoading && ranking && (
            <>
              {/* 헤더 */}
              <div className="ranking-header">
                <h4 className="ranking-header__title">🏆 집중력 랭킹 Top 10</h4>
                <p className="ranking-header__desc">
                  복합 점수 = 최대 집중 시간 + 총 집중 시간
                </p>
                {/* ✅ 마지막 갱신 시간 표시 */}
                {ranking.updatedAt && (
                  <p className="ranking-header__updated">
                    🕐 마지막 갱신 : {new Date(ranking.updatedAt).toLocaleString('ko-KR')}
                    <span className="ranking-update-badge">매일 자정에 한 번 자동 갱신</span>
                  </p>
                )}
              </div>

              {/* Top 10 목록 */}
              <div className="ranking-list">
                {ranking.top10.map((r) => (
                  <div
                    key={r.user_idx}
                    className={`
                      ranking-item
                      ${r.is_me ? 'ranking-item--me' : ''}
                      ${r.rank <= 3 ? `ranking-item--top${r.rank}` : ''}
                    `}
                  >
                    {/* 순위 */}
                    <div className="ranking-item__rank">
                      {r.rank === 1 && <span className="ranking-medal">🥇</span>}
                      {r.rank === 2 && <span className="ranking-medal">🥈</span>}
                      {r.rank === 3 && <span className="ranking-medal">🥉</span>}
                      {r.rank > 3 && <span className="ranking-num">#{r.rank}</span>}
                    </div>

                    {/* 아바타 */}
                    <div className={`ranking-item__avatar ${r.is_me ? 'ranking-item__avatar--me' : ''}`}>
                      {r.nick[0].toUpperCase()}
                    </div>

                    {/* 닉네임 + breakdown */}
                    <div className="ranking-item__info">
                      <span className="ranking-item__nick">
                        {r.nick}
                        {r.is_me && <span className="ranking-me-badge">나</span>}
                      </span>
                      <div className="ranking-item__breakdown">
                        <span className="breakdown-item breakdown-item--max">
                          <span className="breakdown-item__label">최대 집중 시간</span>
                          <span className="breakdown-item__val">{r.max_minutes}분</span>
                        </span>
                        <span className="breakdown-plus">+</span>
                        <span className="breakdown-item breakdown-item--total">
                          <span className="breakdown-item__label">총</span>
                          <span className="breakdown-item__val">{r.total_minutes}분</span>
                        </span>
                        <span className="breakdown-plus">=</span>
                        <span className="breakdown-item breakdown-item--score">
                          <span className="breakdown-item__label">복합</span>
                          <span className="breakdown-item__val">{r.composite_score}점</span>
                        </span>
                      </div>
                    </div>

                    {/* 복합 점수 */}
                    <div className="ranking-item__score">
                      <span className="ranking-item__score-val">{r.composite_score}</span>
                      <span className="ranking-item__score-label">점</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 나의 순위 (Top 10 밖일 때만) */}
              {!ranking.isInTop10 && ranking.myData && (
                <>
                  <div className="ranking-divider">
                    <span>···</span>
                  </div>
                  <div className="ranking-item ranking-item--me ranking-item--my-rank">
                    <div className="ranking-item__rank">
                      <span className="ranking-num">#{ranking.myData.rank}</span>
                    </div>
                    <div className="ranking-item__avatar ranking-item__avatar--me">
                      {ranking.myData.nick[0].toUpperCase()}
                    </div>
                    <div className="ranking-item__info">
                      <span className="ranking-item__nick">
                        {ranking.myData.nick}
                        <span className="ranking-me-badge">나</span>
                      </span>
                      <div className="ranking-item__breakdown">
                        <span className="breakdown-item breakdown-item--max">
                          <span className="breakdown-item__label">최대</span>
                          <span className="breakdown-item__val">{ranking.myData.max_minutes}분</span>
                        </span>
                        <span className="breakdown-plus">+</span>
                        <span className="breakdown-item breakdown-item--total">
                          <span className="breakdown-item__label">총</span>
                          <span className="breakdown-item__val">{ranking.myData.total_minutes}분</span>
                        </span>
                        <span className="breakdown-plus">=</span>
                        <span className="breakdown-item breakdown-item--score">
                          <span className="breakdown-item__label">복합</span>
                          <span className="breakdown-item__val">{ranking.myData.composite_score}점</span>
                        </span>
                      </div>
                    </div>
                    <div className="ranking-item__score">
                      <span className="ranking-item__score-val">{ranking.myData.composite_score}</span>
                      <span className="ranking-item__score-label">점</span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════
          🏅 뱃지 탭
      ════════════════════════════ */}
      {tab === 'badges' && (
        <div className="tab-content tab-content--badges">

          {badgeLoading && <Spinner text="뱃지 목록 불러오는 중..." />}

          {!badgeLoading && badges.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">🏅</span>
              <p>아직 뱃지가 없습니다.</p>
              <p style={{ fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
                집중 세션을 완료하면 뱃지를 획득할 수 있어요!
              </p>
            </div>
          )}

          {!badgeLoading && badges.length > 0 && (
            <div className="badge-grid">
              {badges.map(b => (
                <div key={b.badge_idx} className={`badge-card ${b.is_owned ? 'owned' : 'locked'}`}>
                  {b.is_owned && <span className="badge-card__owned">✅</span>}
                  <div style={{ fontSize: '2rem' }}>{b.badge_name.split(' ')[0]}</div>
                  <div className="badge-card__name">{b.badge_name.slice(b.badge_name.indexOf(' ') + 1)}</div>
                  <div className="badge-card__desc">{b.badge_desc}</div>
                  {b.badge_point > 0 && !b.is_owned && (
                    <div className="badge-card__cost">
                      {b.badge_point}P
                      <button
                        className="btn btn--primary btn--sm"
                        style={{ marginLeft: 6 }}
                        onClick={() => handlePurchase(b.badge_idx, b.badge_name)}
                      >
                        구매
                      </button>
                    </div>
                  )}
                  {b.badge_point === 0 && !b.is_owned && (
                    <div className="badge-card__cost" style={{ color: 'var(--color-text-muted)' }}>
                      조건 달성 시 자동 지급
                    </div>
                  )}
                  {b.is_owned && b.earned_at && (
                    <div className="badge-card__cost" style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                      {new Date(b.earned_at).toLocaleDateString('ko-KR')} 획득
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ════════════════════════════
    🎨 스킨 탭
════════════════════════════ */}
      {tab === 'skins' && (
        <div className="tab-content tab-content--skins">

          {skinLoading && <Spinner text="스킨 목록 불러오는 중..." />}

          {!skinLoading && (
            <>
              <div className="skin-section">
                <h4 className="skin-section__title">🎨 컬러 테마</h4>
                <div className="skin-grid">
                  {skins.filter(s => s.skin_type === 'COLOR').map(s => (
                    <div
                      key={s.skin_idx}
                      className={`
                  skin-card
                  ${s.is_active ? 'skin-card--active' : ''}
                  ${!s.is_owned && s.skin_price > 0 ? 'skin-card--locked' : ''}
                `}
                    >
                      {/* 미리보기 색상 */}
                      <div
                        className="skin-card__preview"
                        style={{ background: s.skin_preview }}
                      />

                      <div className="skin-card__info">
                        <div className="skin-card__name">{s.skin_name}</div>
                        <div className="skin-card__desc">{s.skin_desc}</div>
                      </div>

                      <div className="skin-card__action">
                        {Number(s.is_active) === 1 ? (
                          <span className="skin-active-badge">✅ 적용 중</span>
                        ) : s.is_owned || s.skin_price === 0 ? (
                          <button
                            className="btn btn--outline btn--sm"
                            onClick={() => handleApplySkin(s.skin_idx)}
                          >
                            적용
                          </button>
                        ) : (
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => handlePurchaseSkin(s.skin_idx, s.skin_name, s.skin_price)}
                          >
                            {s.skin_price}P 구매
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="skin-section">
                <h4 className="skin-section__title">🖼️ 배경 테마</h4>
                <div className="skin-grid">
                  {skins.filter(s => s.skin_type === 'BG').map(s => (
                    <div
                      key={s.skin_idx}
                      className={`
                  skin-card
                  ${s.is_active ? 'skin-card--active' : ''}
                  ${!s.is_owned && s.skin_price > 0 ? 'skin-card--locked' : ''}
                `}
                    >
                      <div
                        className="skin-card__preview"
                        style={{ background: s.skin_preview }}
                      />
                      <div className="skin-card__info">
                        <div className="skin-card__name">{s.skin_name}</div>
                        <div className="skin-card__desc">{s.skin_desc}</div>
                      </div>
                      <div className="skin-card__action">
                        {Number(s.is_active) === 1 ? (
                          <span className="skin-active-badge">✅ 적용 중</span>
                        ) : s.is_owned ? (
                          <button
                            className="btn btn--outline btn--sm"
                            onClick={() => handleApplySkin(s.skin_idx)}
                          >
                            적용
                          </button>
                        ) : (
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => handlePurchaseSkin(s.skin_idx, s.skin_name, s.skin_price)}
                          >
                            {s.skin_price}P 구매
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}


      {/* ════════════════════════════
          💎 포인트 탭
      ════════════════════════════ */}
      {tab === 'points' && (
        <div className="tab-content tab-content--points">

          <div className="point-total">
            <div>
              <div className="point-total__label">현재 보유 포인트</div>
              <div className="point-total__value">
                {profile?.total_points?.toLocaleString() ?? 0} P
              </div>

              {/* ✅ 내역 합계 표시 */}
              {points.list.length > 0 && (
                <div style={{ fontSize: '.75rem', opacity: .8, marginTop: 4 }}>
                  내역 합계: {pointSum.toLocaleString()}P
                </div>
              )}
            </div>

            <span style={{ fontSize: '2.5rem' }}>💎</span>
          </div>

          <div className="point-list">
            {points.list.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state__icon">💎</span>
                <p>아직 포인트 내역이 없습니다.</p>
                <p style={{ fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
                  집중 세션을 완료하면 포인트가 적립돼요!
                </p>
              </div>
            ) : (
              points.list.map(p => (
                <div
                  key={p.point_idx}
                  className={`point-item point-item--${p.reward_point >= 0 ? 'plus' : 'minus'}`}
                >
                  <div>
                    <div className="point-item__type">{pointLabel(p.reward_type)}</div>
                    <div className="point-item__date">{new Date(p.earned_at).toLocaleString('ko-KR')}</div>
                  </div>
                  <div className={`point-item__val ${p.reward_point >= 0 ? 'plus' : 'minus'}`}>
                    {p.reward_point >= 0 ? '+' : ''}{p.reward_point}P
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      )
      }

      {/* ════════════════════════════
          ⚙️ 설정 탭
      ════════════════════════════ */}
      {
        tab === 'settings' && (
          <div className="tab-content tab-content--settings">

            {/* 닉네임 변경 */}
            <form className="settings-form" onSubmit={handleNickSubmit}>
              <h4>닉네임 변경</h4>
              {nickMsg.text && (
                <p
                  className={nickMsg.type === 'error' ? 'auth-error' : 'auth-success'}
                  style={{ margin: 0, fontSize: '.875rem' }}
                >
                  {nickMsg.text}
                </p>
              )}
              <div className="form-group">
                <label>닉네임</label>
                <input
                  type="text"
                  value={nickForm.nick}
                  onChange={e => setNickForm(p => ({ ...p, nick: e.target.value }))}
                  placeholder="변경할 닉네임을 입력해주세요"
                />
              </div>
              <button className="btn btn--primary" type="submit" disabled={nickLoading}>
                {nickLoading ? '저장 중...' : '닉네임 저장'}
              </button>
            </form>

            {/* 비밀번호 변경 */}
            <form className="settings-form" onSubmit={handlePwdSubmit}>
              <h4>비밀번호 변경</h4>
              {pwdMsg.text && (
                <p
                  className={pwdMsg.type === 'error' ? 'auth-error' : 'auth-success'}
                  style={{ margin: 0, fontSize: '.875rem' }}
                >
                  {pwdMsg.text}
                </p>
              )}
              <div className="form-group">
                <label>현재 비밀번호</label>
                <input
                  type="password"
                  value={pwdForm.currentPwd}
                  onChange={e => setPwdForm(p => ({ ...p, currentPwd: e.target.value }))}
                  placeholder="현재 비밀번호를 입력해주세요"
                />
              </div>
              <div className="form-group">
                <label>새 비밀번호</label>
                <input
                  type="password"
                  value={pwdForm.newPwd}
                  onChange={e => setPwdForm(p => ({ ...p, newPwd: e.target.value }))}
                  placeholder="새 비밀번호를 입력해주세요"
                />
              </div>
              <div className="form-group">
                <label>새 비밀번호 확인</label>
                <input
                  type="password"
                  value={pwdForm.newPwdConfirm}
                  onChange={e => setPwdForm(p => ({ ...p, newPwdConfirm: e.target.value }))}
                  placeholder="새 비밀번호를 다시 입력해주세요"
                />
              </div>
              <button className="btn btn--primary" type="submit" disabled={pwdLoading}>
                {pwdLoading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>

            {/* 계정 관리 */}
            <div className="settings-form">
              <h4>계정 관리</h4>
              <button
                className="btn btn--danger btn--sm"
                onClick={() => { if (window.confirm('로그아웃 하시겠습니까?')) logout(); }}
              >
                로그아웃
              </button>
            </div>

          </div>
        )
      }

    </div >
  );
};

export default MyPage;
