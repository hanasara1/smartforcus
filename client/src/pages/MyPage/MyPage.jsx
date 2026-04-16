// client/src/pages/MyPage/MyPage.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React     : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
// useEffect : 컴포넌트 마운트 시 API 데이터를 불러오고,
//             탭 전환 시 추가 데이터를 로드하는 훅
// useState  : 탭 상태, 프로필·통계·랭킹 등 다양한 UI 상태를 관리하는 훅
import React, { useEffect, useState } from 'react';

// Chart.js 관련 모듈 :
//   ChartJS        : Chart.js 전역 인스턴스 (플러그인 등록에 사용)
//   CategoryScale  : X축 카테고리 스케일 (날짜 라벨에 사용)
//   LinearScale    : Y축 선형 스케일 (점수 0~100 범위)
//   BarElement     : 막대 그래프 요소
//   Title          : 차트 제목 플러그인
//   Tooltip        : 호버 시 수치를 보여주는 툴팁 플러그인
//   Legend         : 차트 범례 플러그인
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Bar : Chart.js의 막대 그래프를 React 컴포넌트로 래핑한 요소
import { Bar } from 'react-chartjs-2';

// useAuth : 전역 인증 상태에서 logout 함수를 가져오는 커스텀 훅
import { useAuth } from '../../context/AuthContext';

// ── 사용자 관련 API 함수 ──────────────────────────
// getMeAPI         : 현재 유저 프로필(닉네임·이메일·포인트) 조회
// getMyStatsAPI    : 세션 수·총 집중 시간·평균 점수·주간 차트 데이터 조회
// updateMeAPI      : 닉네임 또는 비밀번호 변경 요청
// getMyPoseStatsAPI: 자세 유형별 감지 횟수(취약 자세 Top 3) 조회
// getRankingAPI    : 전체 유저 랭킹 Top 10 + 내 순위 조회
// getMyStreakAPI    : 출석 스트릭(연속 출석일·최장 기록·캘린더) 조회
import {
  getMeAPI,
  getMyStatsAPI,
  updateMeAPI,
  getMyPoseStatsAPI,
  getRankingAPI,
  getMyStreakAPI,
} from '../../api/user.api';

// ── 뱃지 API 함수 ─────────────────────────────────
// getBadgeListAPI  : 전체 뱃지 목록 + 보유 여부 조회
// purchaseBadgeAPI : 포인트로 뱃지 구매
import { getBadgeListAPI, purchaseBadgeAPI } from '../../api/badge.api';

// ── 포인트 API 함수 ───────────────────────────────
// getPointHistoryAPI : 포인트 적립·사용 내역 조회
import { getPointHistoryAPI } from '../../api/point.api';

// ── 스킨 API 함수 ─────────────────────────────────
// getSkinListAPI  : 전체 스킨 목록 + 보유·적용 여부 조회
// purchaseSkinAPI : 포인트로 스킨 구매
// applySkinAPI    : 보유한 스킨을 현재 테마로 적용
import { getSkinListAPI, purchaseSkinAPI, applySkinAPI } from '../../api/skin.api';

// Spinner         : 데이터 로딩 중 표시하는 로딩 인디케이터 컴포넌트
import Spinner from '../../components/common/Spinner';

// StreakCalendar   : GitHub 잔디 스타일 출석 캘린더 컴포넌트
import StreakCalendar from '../../components/common/StreakCalendar';

// MyPage.css : 프로필 히어로, 탭, 통계 카드 등 마이페이지 전체 스타일
import './MyPage.css';


// ────────────────────────────────────────────────
// ⚙️ Chart.js 플러그인 전역 등록
// ────────────────────────────────────────────────

/*
  ChartJS.register() :
  사용할 Chart.js 기능(스케일·요소·플러그인)을 전역에 등록합니다.
  등록하지 않으면 해당 기능이 차트에 반영되지 않습니다.
  앱 전체에서 한 번만 실행되면 됩니다.
*/
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);


// ────────────────────────────────────────────────
// 🗓️ 차트용 날짜 포맷 유틸 함수
// ────────────────────────────────────────────────

/*
  formatChartDate란?
  ISO 날짜 문자열('YYYY-MM-DDTHH:mm:ss')에서 'MM-DD' 형식만 추출합니다.

  ▼ UTC 변환을 방지하는 이유 ▼
    new Date('YYYY-MM-DD').toLocaleDateString() 은 UTC 기준으로 변환되어
    한국(UTC+9) 기준으로 하루가 밀릴 수 있습니다.
    'T' 앞부분만 문자열로 잘라 사용하면 UTC 변환 없이 날짜를 그대로 사용합니다.

  @param  {string} dateStr - 'YYYY-MM-DDTHH:mm:ss' 형식의 날짜 문자열
  @returns {string}          'MM-DD' 형식의 문자열 (예: '03-15')
*/
const formatChartDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('T')[0].split('-');
  return `${month}-${day}`;
};


// ────────────────────────────────────────────────
// 🏷️ 포인트 유형 라벨 상수
// ────────────────────────────────────────────────

/*
  포인트 내역의 reward_type 코드를 사용자 친화적인 한글 라벨로 매핑합니다.
  매핑에 없는 타입은 pointLabel() 함수에서 기본 형식으로 폴백 처리합니다.
*/
const POINT_TYPE_LABELS = {
  welcome          : '🎁 웰컴 포인트',
  daily_login      : '📅 출석 체크 +10P',
  streak_7         : '🔥 7일 연속 출석 보너스 +50P',
  streak_30        : '👑 30일 연속 출석 보너스 +300P',
  badge_purchase   : '🏅 뱃지 구매',
  session_complete : '⏱ 집중 세션 완료 +10P',
  best_record      : '🏆 최고 기록 갱신 +10P',
};

/*
  pointLabel(type)이란?
  reward_type 문자열에서 ':' 앞부분(기본 타입)을 추출하여 라벨을 반환합니다.
  예: 'session_complete:3' → '⏱ 집중 세션 완료 +10P'
  매핑에 없는 경우 '⭐ 세션 보상 (세션번호)' 형식으로 폴백합니다.

  @param  {string} type - reward_type 문자열 (콜론으로 세부 정보 포함 가능)
  @returns {string}       한글 라벨 문자열
*/
const pointLabel = (type) => {
  const base = type.split(':')[0];
  return POINT_TYPE_LABELS[base] || `⭐ 세션 보상 (${type.split(':')[1] || ''})`;
};


// ────────────────────────────────────────────────
// 🏷️ 자세 유형 매핑 상수
// ────────────────────────────────────────────────

/*
  자세 유형 코드를 UI 표시에 필요한 한글 라벨·아이콘·색상으로 매핑합니다.
  취약 자세 Top 3 섹션의 카드 스타일에 사용됩니다.

  ▼ 각 항목 구조 ▼
    - label  : 사용자에게 표시할 한글 자세명
    - icon   : 자세를 표현하는 이모지
    - color  : 카드 배경색 (rgba로 낮은 투명도 설정)
    - border : 카드 왼쪽 강조선 색상
*/
const POSE_LABEL_MAP = {
  TURTLE : { label: '거북목',       icon: '🐢', color: 'rgba(239,68,68,.15)',  border: '#ef4444' },
  SLUMP  : { label: '엎드림',       icon: '😴', color: 'rgba(249,115,22,.15)', border: '#f97316' },
  TILT   : { label: '몸 기울어짐',  icon: '↗️', color: 'rgba(234,179,8,.15)',  border: '#eab308' },
  CHIN   : { label: '턱 괴기',      icon: '🤔', color: 'rgba(168,85,247,.15)', border: '#a855f7' },
  STATIC : { label: '장시간 고정',  icon: '🪨', color: 'rgba(59,130,246,.15)', border: '#3b82f6' },
};


// ────────────────────────────────────────────────
// 👤 MyPage 컴포넌트 (마이페이지 전체)
// ────────────────────────────────────────────────

/*
  MyPage란?
  유저의 집중 통계, 랭킹, 뱃지, 스킨, 포인트 내역, 계정 설정을
  탭 형태로 제공하는 마이페이지 컴포넌트입니다.

  ▼ 탭 목록 ▼
    - stats    : 집중 통계 (세션 수·시간·점수·주간 차트·자세 패턴·출석 스트릭)
    - ranking  : 전체 유저 랭킹 Top 10 + 내 순위
    - badges   : 뱃지 목록 (보유·미보유·구매 가능)
    - skins    : 스킨 목록 (컬러·배경 테마 구매·적용)
    - points   : 포인트 적립·사용 내역
    - settings : 닉네임·비밀번호 변경 + 로그아웃

  ▼ 데이터 로딩 전략 ▼
    - stats 관련 데이터 : 컴포넌트 마운트 시 Promise.all로 일괄 로드
    - 탭별 추가 데이터  : 해당 탭으로 이동할 때 최초 1회만 로드 (이미 있으면 스킵)
*/
const MyPage = () => {
  const { logout } = useAuth();


  // ── 탭 상태 ──────────────────────────────────

  // 현재 활성화된 탭 ('stats' | 'ranking' | 'badges' | 'skins' | 'points' | 'settings')
  const [tab, setTab] = useState('stats');


  // ── 데이터 상태 ──────────────────────────────

  const [profile,   setProfile]   = useState(null);  // 유저 프로필 (닉네임·이메일·포인트)
  const [stats,     setStats]     = useState(null);   // 집중 통계 (세션·시간·점수·주간 차트)
  const [poseStats, setPoseStats] = useState([]);     // 자세 유형별 감지 횟수
  const [badges,    setBadges]    = useState([]);     // 뱃지 목록 (보유 여부 포함)
  const [points,    setPoints]    = useState({ list: [], total: 0 }); // 포인트 내역
  const [ranking,   setRanking]   = useState(null);   // 랭킹 데이터 (Top 10 + 내 순위)
  const [streak,    setStreak]    = useState(null);   // 출석 스트릭 데이터
  const [skins,     setSkins]     = useState([]);     // 스킨 목록 (보유·적용 여부 포함)


  // ── 로딩 상태 ────────────────────────────────

  const [loading,        setLoading]        = useState(true);  // 초기 데이터 로딩
  const [badgeLoading,   setBadgeLoading]   = useState(false); // 뱃지 탭 로딩
  const [rankingLoading, setRankingLoading] = useState(false); // 랭킹 탭 로딩
  const [skinLoading,    setSkinLoading]    = useState(false); // 스킨 탭 로딩


  // ── 닉네임 변경 폼 상태 ──────────────────────

  const [nickForm,    setNickForm]    = useState({ nick: '' });
  const [nickMsg,     setNickMsg]     = useState({ type: '', text: '' }); // 폼 피드백 메시지
  const [nickLoading, setNickLoading] = useState(false);


  // ── 비밀번호 변경 폼 상태 ────────────────────

  const [pwdForm,    setPwdForm]    = useState({ currentPwd: '', newPwd: '', newPwdConfirm: '' });
  const [pwdMsg,     setPwdMsg]     = useState({ type: '', text: '' }); // 폼 피드백 메시지
  const [pwdLoading, setPwdLoading] = useState(false);


  // ── 토스트 알림 상태 ─────────────────────────

  /*
    toast : 뱃지·스킨 구매/적용 결과를 화면 상단에 잠시 표시하는 알림입니다.
    type  : 'success' (초록) | 'error' (빨강)
    text  : 표시할 메시지 문자열
  */
  const [toast, setToast] = useState({ type: '', text: '' });


  // ── 파생 계산값 ──────────────────────────────

  /*
    pointSum : 포인트 내역 목록의 reward_point 합계입니다.
    현재 보유 포인트(total_points)와 비교하여 내역 누적 합계를 보여줍니다.
  */
  const pointSum = points.list.reduce((sum, p) => sum + p.reward_point, 0);


  // ── 토스트 헬퍼 함수 ─────────────────────────

  /*
    showToast(type, text)란?
    토스트 메시지를 표시하고 3초 후 자동으로 사라지게 합니다.
    alert() 대신 사용하여 UX를 개선합니다.

    @param {string} type - 'success' | 'error'
    @param {string} text - 표시할 메시지
  */
  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast({ type: '', text: '' }), 3000); // 3초 후 자동 숨김
  };


  // ────────────────────────────────────────────────
  // 🌐 초기 데이터 로드 (마운트 시 1회)
  // ────────────────────────────────────────────────

  /*
    Promise.all : 4개의 API 요청을 병렬로 실행하여 모두 완료될 때까지 기다립니다.
    순차 실행보다 훨씬 빠르게 데이터를 로드할 수 있습니다.

    로드 항목:
      - getMeAPI()          : 유저 프로필 (닉네임·이메일·포인트)
      - getMyStatsAPI()     : 집중 통계 (세션·시간·점수·주간 차트)
      - getMyPoseStatsAPI() : 자세 유형별 감지 횟수
      - getMyStreakAPI()     : 출석 스트릭 및 캘린더 데이터
  */
  useEffect(() => {
    Promise.all([
      getMeAPI(),
      getMyStatsAPI(),
      getMyPoseStatsAPI(),
      getMyStreakAPI(),
    ])
      .then(([pr, sr, poser, streakr]) => {
        setProfile(pr.data.data);
        setStats(sr.data.data);
        setPoseStats(poser.data.data);
        setStreak(streakr.data.data);
        setNickForm({ nick: pr.data.data.nick }); // 닉네임 폼 초기값 설정
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);


  // ────────────────────────────────────────────────
  // 🔄 탭별 추가 데이터 로드
  // ────────────────────────────────────────────────

  /*
    탭을 클릭할 때마다 해당 탭의 데이터가 필요한지 확인하고
    아직 로드되지 않은 경우에만 API를 호출합니다.

    ▼ 이미 데이터가 있으면 스킵하는 이유 ▼
      탭을 반복적으로 전환할 때 불필요한 API 호출을 방지합니다.
      (badges.length === 0, points.list.length === 0, !ranking 등으로 체크)
  */
  useEffect(() => {

    // 뱃지 탭 : 뱃지 목록이 아직 없을 때만 로드
    if (tab === 'badges' && badges.length === 0) {
      setBadgeLoading(true);
      getBadgeListAPI()
        .then(({ data }) => setBadges(data.data))
        .catch(console.error)
        .finally(() => setBadgeLoading(false));
    }

    // 포인트 탭 : 포인트 내역이 아직 없을 때만 로드
    if (tab === 'points' && points.list.length === 0) {
      getPointHistoryAPI()
        .then(({ data }) => setPoints({ list: data.data, total: data.meta.total }))
        .catch(console.error);
    }

    // 스킨 탭 : 스킨 목록이 아직 없을 때만 로드
    if (tab === 'skins' && skins.length === 0) {
      setSkinLoading(true);
      getSkinListAPI()
        .then(({ data }) => setSkins(data.data))
        .catch(console.error)
        .finally(() => setSkinLoading(false));
    }

    // 랭킹 탭 : 랭킹 데이터가 아직 없을 때만 로드
    if (tab === 'ranking' && !ranking) {
      setRankingLoading(true);
      getRankingAPI()
        .then(({ data }) => setRanking(data.data))
        .catch(console.error)
        .finally(() => setRankingLoading(false));
    }

  }, [tab]); // tab이 바뀔 때마다 실행


  // ────────────────────────────────────────────────
  // 📊 주간 집중 점수 차트 데이터 생성
  // ────────────────────────────────────────────────

  /*
    weeklyChart란?
    stats.weekly 배열을 Chart.js Bar 컴포넌트에 전달하는 데이터 객체입니다.
    데이터가 없으면 null을 반환하여 empty-state를 표시합니다.

    ▼ 구조 ▼
      labels   : X축 날짜 라벨 ('MM-DD' 형식)
      datasets : 막대 그래프 데이터 (평균 집중 점수)
  */
  const weeklyChart = stats?.weekly?.length ? {
    labels   : stats.weekly.map(w => formatChartDate(w.imm_date)),
    datasets : [{
      label           : '평균 집중 점수',
      data            : stats.weekly.map(w => Math.round(w.avg_score)),
      backgroundColor : 'rgba(99,102,241,.7)',  // 반투명 보라색 막대
      borderColor     : '#6366f1',
      borderWidth     : 1,
      borderRadius    : 6,                       // 막대 상단 모서리를 둥글게
    }],
  } : null;


  // ────────────────────────────────────────────────
  // 🎮 이벤트 핸들러 함수들
  // ────────────────────────────────────────────────

  // ── 뱃지 구매 ────────────────────────────────────

  /*
    confirm() 확인 후 구매를 진행합니다.
    성공 시 뱃지 목록과 프로필 포인트를 최신 상태로 갱신합니다.

    @param {number} badge_idx  - 구매할 뱃지의 고유 ID
    @param {string} badge_name - confirm 메시지에 표시할 뱃지 이름
  */
  const handlePurchase = async (badge_idx, badge_name) => {
    if (!window.confirm(`'${badge_name}' 뱃지를 구매하시겠습니까?`)) return;
    try {
      const { data } = await purchaseBadgeAPI(badge_idx);
      showToast('success', data.message);
      // 구매 후 목록과 포인트를 즉시 갱신합니다.
      getBadgeListAPI().then(({ data: bd }) => setBadges(bd.data));
      getMeAPI().then(({ data: pd }) => setProfile(pd.data.data));
    } catch (err) {
      showToast('error', err.response?.data?.message || '구매 실패');
    }
  };


  // ── 스킨 구매 ────────────────────────────────────

  /*
    confirm() 확인 후 스킨을 구매합니다.
    성공 시 스킨 목록과 프로필 포인트를 최신 상태로 갱신합니다.

    @param {number} skin_idx   - 구매할 스킨의 고유 ID
    @param {string} skin_name  - confirm 메시지에 표시할 스킨 이름
    @param {number} skin_price - confirm 메시지에 표시할 스킨 가격 (P)
  */
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


  // ── 스킨 적용 ────────────────────────────────────

  /*
    스킨을 현재 테마로 적용합니다.
    서버에 적용 요청 후 <body>의 data-skin 속성을 변경하여
    CSS 변수 기반의 테마가 즉시 반영되도록 합니다.

    @param {number} skin_idx - 적용할 스킨의 고유 ID
  */
  const handleApplySkin = async (skin_idx) => {
    try {
      const { data } = await applySkinAPI(skin_idx);
      // <body data-skin="skin_key"> 변경 → CSS 변수 테마 즉시 적용
      document.body.setAttribute('data-skin', data.data.skin_key);
      getSkinListAPI().then(({ data: sd }) => setSkins(sd.data));
      showToast('success', data.message);
    } catch (err) {
      showToast('error', err.response?.data?.message || '적용 실패');
    }
  };


  // ── 닉네임 변경 폼 제출 ──────────────────────────

  /*
    클라이언트 유효성 검사 후 닉네임 변경 API를 호출합니다.
    성공 시 profile 상태를 즉시 갱신하여 프로필 히어로에 반영합니다.

    ▼ 유효성 검사 항목 ▼
      - 빈 값 입력 여부
      - 현재 닉네임과 동일 여부 (불필요한 API 호출 방지)
  */
  const handleNickSubmit = async e => {
    e.preventDefault();
    setNickMsg({ type: '', text: '' });

    if (!nickForm.nick.trim()) {
      return setNickMsg({ type: 'error', text: '닉네임을 입력해주세요.' });
    }
    // 현재 닉네임과 동일하면 API 호출 없이 에러 표시
    if (nickForm.nick === profile?.nick) {
      return setNickMsg({ type: 'error', text: '현재 닉네임과 동일합니다.' });
    }

    setNickLoading(true);
    try {
      await updateMeAPI({ nick: nickForm.nick });
      setNickMsg({ type: 'success', text: '닉네임이 수정되었습니다.' });
      // 프로필 상태를 부분 업데이트하여 프로필 히어로에 즉시 반영
      setProfile(prev => ({ ...prev, nick: nickForm.nick }));
    } catch (err) {
      setNickMsg({ type: 'error', text: err.response?.data?.message || '닉네임 수정 실패' });
    } finally {
      setNickLoading(false);
    }
  };


  // ── 비밀번호 변경 폼 제출 ────────────────────────

  /*
    클라이언트 유효성 검사 후 비밀번호 변경 API를 호출합니다.
    성공 시 폼을 초기화하고 성공 메시지를 표시합니다.

    ▼ 유효성 검사 항목 ▼
      - 현재 비밀번호 입력 여부
      - 새 비밀번호 입력 여부
      - 새 비밀번호 8자 이상 여부
      - 새 비밀번호와 확인 일치 여부
  */
  const handlePwdSubmit = async e => {
    e.preventDefault();
    setPwdMsg({ type: '', text: '' });

    if (!pwdForm.currentPwd) {
      return setPwdMsg({ type: 'error', text: '현재 비밀번호를 입력해주세요.' });
    }
    if (!pwdForm.newPwd) {
      return setPwdMsg({ type: 'error', text: '새 비밀번호를 입력해주세요.' });
    }
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
      setPwdForm({ currentPwd: '', newPwd: '', newPwdConfirm: '' }); // 폼 초기화
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.response?.data?.message || '비밀번호 변경 실패' });
    } finally {
      setPwdLoading(false);
    }
  };


  // ── 초기 로딩 중 스피너 표시 ─────────────────────
  if (loading) return <Spinner text="마이페이지 불러오는 중..." />;


  // ────────────────────────────────────────────────
  // 🖥️ JSX 렌더링
  // ────────────────────────────────────────────────

  return (
    <div className="mypage">

      {/* ════════════════════════════════
          👤 프로필 히어로 영역
          아바타·닉네임·이메일·요약 통계를 표시합니다.
          ════════════════════════════════ */}
      <div className="mypage-hero">

        {/* 아바타 : 닉네임 첫 글자를 대문자로 표시 */}
        <div className="hero-avatar">
          {profile?.nick?.[0]?.toUpperCase() || '?'}
        </div>

        <div className="hero-info">
          <h2 className="hero-nick">{profile?.nick}</h2>
          <p className="hero-email">{profile?.email}</p>

          {/* 요약 통계 4개 : 세션 수·집중분·평균점수·포인트 */}
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


      {/* ════════════════════════════════
          🍞 토스트 알림
          구매·적용 결과를 3초간 화면 상단에 표시합니다.
          toast.text가 있을 때만 렌더링합니다.
          ════════════════════════════════ */}
      {toast.text && (
        <div className={`toast toast--${toast.type}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.text}
        </div>
      )}


      {/* ════════════════════════════════
          🗂️ 탭 네비게이션
          클릭 시 tab 상태를 변경하여 해당 탭 콘텐츠를 표시합니다.
          ════════════════════════════════ */}
      <div className="mypage-tabs">
        {[
          ['stats',    '📊 통계'],
          ['ranking',  '🏆 랭킹'],
          ['badges',   '🏅 뱃지'],
          ['skins',    '🎨 스킨'],
          ['points',   '💎 포인트'],
          ['settings', '⚙️ 설정'],
        ].map(([key, label]) => (
          <button
            key       ={key}
            className ={`tab-btn ${tab === key ? 'active' : ''}`}
            onClick   ={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>


      {/* ════════════════════════════════
          📊 통계 탭
          ════════════════════════════════ */}
      {tab === 'stats' && (
        <div className="tab-content tab-content--stats">

          {/* ── 요약 통계 카드 4개 ── */}
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
                {/* 분 → 시간·분 분리 표시 */}
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


          {/* ── 주간 집중 점수 막대 차트 ── */}
          <div className="stat-card stat-card--wide">
            <h4>최근 7일 집중 점수</h4>
            {weeklyChart ? (
              <div style={{ height: 200, marginTop: 12 }}>
                <Bar
                  data    ={weeklyChart}
                  options ={{
                    responsive          : true,
                    maintainAspectRatio : false,
                    plugins : { legend: { display: false } }, // 범례 숨김 (단일 데이터셋)
                    scales  : { y: { min: 0, max: 100 } },   // Y축 범위 고정 (점수 기준)
                  }}
                />
              </div>
            ) : (
              // 집중 기록이 없을 때 empty-state 표시
              <div className="empty-state empty-state--sm">
                <span className="empty-state__icon">📊</span>
                <p>아직 집중 기록이 없습니다.</p>
                <p style={{ fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
                  집중 세션을 완료하면 차트가 표시돼요!
                </p>
              </div>
            )}
          </div>


          {/* ── 자세 패턴 분석 : 취약 자세 Top 3 ── */}
          <div className="pose-stats-section">
            <h4 className="pose-stats__title">🧘 내 취약 자세 Top 3</h4>

            {/*
              POSE_LABEL_MAP에 없는 항목(GOOD·BAD·WARNING 등)을 필터링하여
              정의된 자세 유형만 표시합니다.
            */}
            {poseStats.filter(p => POSE_LABEL_MAP[p.pose_type]).length === 0 ? (
              // 불량 자세가 없는 경우 칭찬 메시지 표시
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
                  .filter(p => POSE_LABEL_MAP[p.pose_type]) // 매핑된 자세만 필터링
                  .slice(0, 3)                               // 최대 3개만 표시
                  .map((p, idx) => {
                    const info = POSE_LABEL_MAP[p.pose_type];

                    // 1위 자세 대비 비율로 바 너비(%)를 계산합니다.
                    const validStats = poseStats.filter(p => POSE_LABEL_MAP[p.pose_type]);
                    const maxCount   = validStats[0]?.total_count || 1; // 0 나누기 방지
                    const percent    = Math.round((p.total_count / maxCount) * 100);

                    return (
                      <div
                        key       ={p.pose_type}
                        className ="pose-stat-item"
                        style     ={{ background: info.color, borderLeft: `4px solid ${info.border}` }}
                      >
                        {/* 좌측 : 순위·아이콘·자세명 */}
                        <div className="pose-stat-item__left">
                          <span className="pose-stat-item__rank">#{idx + 1}</span>
                          <span className="pose-stat-item__icon">{info.icon}</span>
                          <span className="pose-stat-item__label">{info.label}</span>
                        </div>

                        {/* 우측 : 비율 바 + 감지 횟수 */}
                        <div className="pose-stat-item__right">
                          <div className="pose-stat-bar">
                            <div
                              className ="pose-stat-bar__fill"
                              style     ={{ width: `${percent}%`, background: info.border }}
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


          {/* ── 출석 스트릭 섹션 ── */}
          {/*
            streak !== null 이면 데이터 유무와 관계없이 항상 표시합니다.
            (total_count === 0이어도 빈 캘린더로 렌더링)
          */}
          {streak !== null && (
            <div className="streak-section">

              {/* 스트릭 요약 카드 3개 */}
              <div className="streak-summary">

                <div className="streak-summary__card">
                  <div className="streak-summary__icon">🔥</div>
                  <div className="streak-summary__val">{streak.current_streak}</div>
                  <div className="streak-summary__label">현재 연속 출석</div>
                  <div className="streak-summary__sub">일</div>
                </div>

                {/* highlight 카드 : 최장 연속 기록 강조 표시 */}
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

              {/* 동기부여 메시지 : 현재 스트릭에 따라 다른 메시지 표시 */}
              <div className="streak-motivation">
                {streak.current_streak === 0 && (
                  <span>💡 오늘 로그인하면 스트릭이 시작돼요!</span>
                )}
                {streak.current_streak >= 1 && streak.current_streak < 7 && (
                  <span>
                    🌱 {streak.current_streak}일 연속 출석 중!
                    7일 보너스까지 {7 - streak.current_streak}일 남았어요!
                  </span>
                )}
                {streak.current_streak >= 7 && streak.current_streak < 30 && (
                  <span>
                    🔥 {streak.current_streak}일 연속 출석 중!
                    30일 보너스까지 {30 - streak.current_streak}일 남았어요!
                  </span>
                )}
                {streak.current_streak >= 30 && (
                  <span>👑 {streak.current_streak}일 연속 출석! 대단한 집중력이에요!</span>
                )}
              </div>

              {/* 출석 캘린더 (잔디 그래프) */}
              <div className="streak-calendar-wrap">
                <div className="streak-calendar-wrap__header">
                  <h4>📆 최근 12주 출석 현황</h4>
                  <span className="streak-total-badge">
                    누적 {streak.total_count}일 출석
                  </span>
                </div>

                {/*
                  attendance_dates가 없을 경우 빈 배열([])로 폴백하여
                  캘린더는 항상 렌더링합니다. (출석 없으면 빈 잔디)
                */}
                <StreakCalendar
                  attendanceDates ={streak.attendance_dates ?? []}
                  weeks           ={12}
                />

                {/* 출석 기록이 아예 없을 때 안내 문구 */}
                {streak.total_count === 0 && (
                  <p style={{
                    textAlign  : 'center',
                    fontSize   : '.8rem',
                    color      : 'var(--color-text-muted)',
                    marginTop  : 'var(--spacing-sm)',
                  }}>
                    아직 출석 기록이 없어요. 매일 로그인하면 잔디가 채워져요! 🌱
                  </p>
                )}
              </div>

            </div>
          )}

        </div>
      )}


      {/* ════════════════════════════════
          🏆 랭킹 탭
          ════════════════════════════════ */}
      {tab === 'ranking' && (
        <div className="tab-content tab-content--ranking">

          {/* 랭킹 로딩 중 */}
          {rankingLoading && <Spinner text="랭킹 불러오는 중..." />}

          {!rankingLoading && ranking && (
            <>
              {/* 랭킹 헤더 : 제목·점수 설명·마지막 갱신 시각 */}
              <div className="ranking-header">
                <h4 className="ranking-header__title">🏆 집중력 랭킹 Top 10</h4>
                <p className="ranking-header__desc">
                  복합 점수 = 최대 집중 시간 + 총 집중 시간
                </p>
                {/* 마지막 갱신 시각 : ranking.updatedAt이 있을 때만 표시 */}
                {ranking.updatedAt && (
                  <p className="ranking-header__updated">
                    🕐 마지막 갱신 : {new Date(ranking.updatedAt).toLocaleString('ko-KR')}
                    <span className="ranking-update-badge">매일 자정에 한 번 자동 갱신</span>
                  </p>
                )}
              </div>

              {/* Top 10 랭킹 목록 */}
              <div className="ranking-list">
                {ranking.top10.map((r) => (
                  <div
                    key       ={r.user_idx}
                    className ={[
                      'ranking-item',
                      r.is_me  ? 'ranking-item--me'           : '',  // 본인 강조
                      r.rank <= 3 ? `ranking-item--top${r.rank}` : '', // 1~3위 특별 스타일
                    ].join(' ')}
                  >
                    {/* 순위 : 1~3위는 메달 이모지, 4위 이하는 #번호 */}
                    <div className="ranking-item__rank">
                      {r.rank === 1 && <span className="ranking-medal">🥇</span>}
                      {r.rank === 2 && <span className="ranking-medal">🥈</span>}
                      {r.rank === 3 && <span className="ranking-medal">🥉</span>}
                      {r.rank  > 3 && <span className="ranking-num">#{r.rank}</span>}
                    </div>

                    {/* 아바타 : 본인이면 강조 스타일 */}
                    <div className={`ranking-item__avatar ${r.is_me ? 'ranking-item__avatar--me' : ''}`}>
                      {r.nick[0].toUpperCase()}
                    </div>

                    {/* 닉네임 + 점수 breakdown */}
                    <div className="ranking-item__info">
                      <span className="ranking-item__nick">
                        {r.nick}
                        {r.is_me && <span className="ranking-me-badge">나</span>}
                      </span>
                      {/* 복합 점수 구성 : 최대 집중 시간 + 총 집중 시간 = 복합 점수 */}
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

                    {/* 복합 점수 (우측) */}
                    <div className="ranking-item__score">
                      <span className="ranking-item__score-val">{r.composite_score}</span>
                      <span className="ranking-item__score-label">점</span>
                    </div>

                  </div>
                ))}
              </div>

              {/* 내 순위 (Top 10 밖일 때만 별도 표시) */}
              {!ranking.isInTop10 && ranking.myData && (
                <>
                  {/* 구분선 : Top 10과 내 순위 사이의 간격을 시각적으로 표현 */}
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


      {/* ════════════════════════════════
          🏅 뱃지 탭
          ════════════════════════════════ */}
      {tab === 'badges' && (
        <div className="tab-content tab-content--badges">

          {/* 뱃지 로딩 중 */}
          {badgeLoading && <Spinner text="뱃지 목록 불러오는 중..." />}

          {/* 뱃지가 없을 때 empty-state */}
          {!badgeLoading && badges.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">🏅</span>
              <p>아직 뱃지가 없습니다.</p>
              <p style={{ fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
                집중 세션을 완료하면 뱃지를 획득할 수 있어요!
              </p>
            </div>
          )}

          {/* 뱃지 카드 그리드 */}
          {!badgeLoading && badges.length > 0 && (
            <div className="badge-grid">
              {badges.map(b => (
                <div
                  key       ={b.badge_idx}
                  className ={`badge-card ${b.is_owned ? 'owned' : 'locked'}`}
                >
                  {/* 보유 중이면 체크 표시 */}
                  {b.is_owned && <span className="badge-card__owned">✅</span>}

                  {/* 뱃지 이모지 : 이름의 첫 단어를 아이콘으로 사용 */}
                  <div style={{ fontSize: '2rem' }}>
                    {b.badge_name.split(' ')[0]}
                  </div>

                  {/* 뱃지 이름 : 이모지를 제외한 나머지 텍스트 */}
                  <div className="badge-card__name">
                    {b.badge_name.slice(b.badge_name.indexOf(' ') + 1)}
                  </div>

                  <div className="badge-card__desc">{b.badge_desc}</div>

                  {/* 구매 가능한 뱃지 : 가격 + 구매 버튼 */}
                  {b.badge_point > 0 && !b.is_owned && (
                    <div className="badge-card__cost">
                      {b.badge_point}P
                      <button
                        className ="btn btn--primary btn--sm"
                        style     ={{ marginLeft: 6 }}
                        onClick   ={() => handlePurchase(b.badge_idx, b.badge_name)}
                      >
                        구매
                      </button>
                    </div>
                  )}

                  {/* 조건 달성 시 자동 지급되는 뱃지 */}
                  {b.badge_point === 0 && !b.is_owned && (
                    <div className="badge-card__cost" style={{ color: 'var(--color-text-muted)' }}>
                      조건 달성 시 자동 지급
                    </div>
                  )}

                  {/* 이미 보유한 뱃지 : 획득 날짜 표시 */}
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


      {/* ════════════════════════════════
          🎨 스킨 탭
          컬러 테마·배경 테마를 구매·적용합니다.
          ════════════════════════════════ */}
      {tab === 'skins' && (
        <div className="tab-content tab-content--skins">

          {/* 스킨 로딩 중 */}
          {skinLoading && <Spinner text="스킨 목록 불러오는 중..." />}

          {!skinLoading && (
            <>
              {/* ── 컬러 테마 섹션 ── */}
              <div className="skin-section">
                <h4 className="skin-section__title">🎨 컬러 테마</h4>
                <div className="skin-grid">
                  {skins.filter(s => s.skin_type === 'COLOR').map(s => (
                    <div
                      key       ={s.skin_idx}
                      className ={[
                        'skin-card',
                        s.is_active                          ? 'skin-card--active' : '',
                        !s.is_owned && s.skin_price > 0      ? 'skin-card--locked' : '',
                      ].join(' ')}
                    >
                      {/* 색상 미리보기 : skin_preview CSS 값으로 배경색 적용 */}
                      <div
                        className ="skin-card__preview"
                        style     ={{ background: s.skin_preview }}
                      />

                      <div className="skin-card__info">
                        <div className="skin-card__name">{s.skin_name}</div>
                        <div className="skin-card__desc">{s.skin_desc}</div>
                      </div>

                      {/* 상태별 액션 버튼 */}
                      <div className="skin-card__action">
                        {Number(s.is_active) === 1 ? (
                          // 현재 적용 중인 스킨
                          <span className="skin-active-badge">✅ 적용 중</span>
                        ) : s.is_owned || s.skin_price === 0 ? (
                          // 보유 중이거나 무료 스킨 : 적용 버튼
                          <button
                            className ="btn btn--outline btn--sm"
                            onClick   ={() => handleApplySkin(s.skin_idx)}
                          >
                            적용
                          </button>
                        ) : (
                          // 미보유 스킨 : 구매 버튼 (가격 표시)
                          <button
                            className ="btn btn--primary btn--sm"
                            onClick   ={() => handlePurchaseSkin(s.skin_idx, s.skin_name, s.skin_price)}
                          >
                            {s.skin_price}P 구매
                          </button>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              </div>

              {/* ── 배경 테마 섹션 ── */}
              <div className="skin-section">
                <h4 className="skin-section__title">🖼️ 배경 테마</h4>
                <div className="skin-grid">
                  {skins.filter(s => s.skin_type === 'BG').map(s => (
                    <div
                      key       ={s.skin_idx}
                      className ={[
                        'skin-card',
                        s.is_active                     ? 'skin-card--active' : '',
                        !s.is_owned && s.skin_price > 0 ? 'skin-card--locked' : '',
                      ].join(' ')}
                    >
                      <div
                        className ="skin-card__preview"
                        style     ={{ background: s.skin_preview }}
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
                            className ="btn btn--outline btn--sm"
                            onClick   ={() => handleApplySkin(s.skin_idx)}
                          >
                            적용
                          </button>
                        ) : (
                          <button
                            className ="btn btn--primary btn--sm"
                            onClick   ={() => handlePurchaseSkin(s.skin_idx, s.skin_name, s.skin_price)}
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


      {/* ════════════════════════════════
          💎 포인트 탭
          적립·사용 내역을 시간순으로 표시합니다.
          ════════════════════════════════ */}
      {tab === 'points' && (
        <div className="tab-content tab-content--points">

          {/* 현재 보유 포인트 + 내역 합계 요약 카드 */}
          <div className="point-total">
            <div>
              <div className="point-total__label">현재 보유 포인트</div>
              <div className="point-total__value">
                {profile?.total_points?.toLocaleString() ?? 0} P
              </div>
              {/* 내역 합계 : 포인트 목록의 총합을 비교 표시 */}
              {points.list.length > 0 && (
                <div style={{ fontSize: '.75rem', opacity: .8, marginTop: 4 }}>
                  내역 합계: {pointSum.toLocaleString()}P
                </div>
              )}
            </div>
            <span style={{ fontSize: '2.5rem' }}>💎</span>
          </div>

          {/* 포인트 내역 목록 */}
          <div className="point-list">
            {points.list.length === 0 ? (
              // 내역이 없을 때 empty-state
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
                  key       ={p.point_idx}
                  className ={`point-item point-item--${p.reward_point >= 0 ? 'plus' : 'minus'}`}
                >
                  <div>
                    {/* 포인트 유형 라벨 */}
                    <div className="point-item__type">{pointLabel(p.reward_type)}</div>
                    {/* 적립·사용 일시 */}
                    <div className="point-item__date">
                      {new Date(p.earned_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  {/* 포인트 증감 : 양수는 '+', 음수는 '-' 기호 표시 */}
                  <div className={`point-item__val ${p.reward_point >= 0 ? 'plus' : 'minus'}`}>
                    {p.reward_point >= 0 ? '+' : ''}{p.reward_point}P
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      )}


      {/* ════════════════════════════════
          ⚙️ 설정 탭
          닉네임·비밀번호 변경 + 로그아웃
          ════════════════════════════════ */}
      {tab === 'settings' && (
        <div className="tab-content tab-content--settings">

          {/* ── 닉네임 변경 폼 ── */}
          <form className="settings-form" onSubmit={handleNickSubmit}>
            <h4>닉네임 변경</h4>

            {/* 닉네임 폼 피드백 메시지 (성공·에러) */}
            {nickMsg.text && (
              <p
                className ={nickMsg.type === 'error' ? 'auth-error' : 'auth-success'}
                style     ={{ margin: 0, fontSize: '.875rem' }}
              >
                {nickMsg.text}
              </p>
            )}

            <div className="form-group">
              <label>닉네임</label>
              <input
                type        ="text"
                value       ={nickForm.nick}
                onChange    ={e => setNickForm(p => ({ ...p, nick: e.target.value }))}
                placeholder ="변경할 닉네임을 입력해주세요"
              />
            </div>

            <button className="btn btn--primary" type="submit" disabled={nickLoading}>
              {nickLoading ? '저장 중...' : '닉네임 저장'}
            </button>
          </form>


          {/* ── 비밀번호 변경 폼 ── */}
          <form className="settings-form" onSubmit={handlePwdSubmit}>
            <h4>비밀번호 변경</h4>

            {/* 비밀번호 폼 피드백 메시지 (성공·에러) */}
            {pwdMsg.text && (
              <p
                className ={pwdMsg.type === 'error' ? 'auth-error' : 'auth-success'}
                style     ={{ margin: 0, fontSize: '.875rem' }}
              >
                {pwdMsg.text}
              </p>
            )}

            <div className="form-group">
              <label>현재 비밀번호</label>
              <input
                type        ="password"
                value       ={pwdForm.currentPwd}
                onChange    ={e => setPwdForm(p => ({ ...p, currentPwd: e.target.value }))}
                placeholder ="현재 비밀번호를 입력해주세요"
              />
            </div>

            <div className="form-group">
              <label>새 비밀번호</label>
              <input
                type        ="password"
                value       ={pwdForm.newPwd}
                onChange    ={e => setPwdForm(p => ({ ...p, newPwd: e.target.value }))}
                placeholder ="새 비밀번호를 입력해주세요"
              />
            </div>

            <div className="form-group">
              <label>새 비밀번호 확인</label>
              <input
                type        ="password"
                value       ={pwdForm.newPwdConfirm}
                onChange    ={e => setPwdForm(p => ({ ...p, newPwdConfirm: e.target.value }))}
                placeholder ="새 비밀번호를 다시 입력해주세요"
              />
            </div>

            <button className="btn btn--primary" type="submit" disabled={pwdLoading}>
              {pwdLoading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>


          {/* ── 계정 관리 : 로그아웃 ── */}
          <div className="settings-form">
            <h4>계정 관리</h4>
            <button
              className ="btn btn--danger btn--sm"
              onClick   ={() => {
                if (window.confirm('로그아웃 하시겠습니까?')) logout();
              }}
            >
              로그아웃
            </button>
          </div>

        </div>
      )}

    </div>
  );
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default : 이 컴포넌트를 다른 파일에서 import하여 사용할 수 있게 합니다.
  사용 예시 (라우터 설정):
    import MyPage from '@/pages/MyPage/MyPage';
    <Route path="/mypage" element={<MyPage />} />
*/
export default MyPage;
