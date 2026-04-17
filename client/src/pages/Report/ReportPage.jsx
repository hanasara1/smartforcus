// client/src/pages/Report/ReportPage.jsx


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';

// useParams  : URL의 파라미터(예: /report/:imm_idx)를 읽어오는 Hook
// useNavigate: 특정 경로로 페이지를 이동시키는 Hook
import { useParams, useNavigate } from 'react-router-dom';

// Chart.js 핵심 모듈과 react-chartjs-2 래퍼
// Chart.js는 캔버스 기반 차트 라이브러리이며,
// 사용할 척도(Scale), 요소(Element), 플러그인을 개별로 등록해야 합니다.
import {
  Chart as ChartJS,
  CategoryScale,  // X축 카테고리 척도
  LinearScale,    // Y축 선형 척도
  BarElement,     // 막대 차트 요소
  ArcElement,     // 도넛/파이 차트 요소
  LineElement,    // 선 차트 요소
  PointElement,   // 선 차트의 각 점 요소
  Title,          // 차트 제목 플러그인
  Tooltip,        // 마우스 호버 시 툴팁 플러그인
  Legend,         // 범례 플러그인
  Filler,         // 선 차트 아래 영역 채우기 플러그인
} from 'chart.js';

// Bar : Chart.js를 React에서 사용하기 위한 막대 차트 컴포넌트
import { Bar } from 'react-chartjs-2';

// 리포트 관련 API 함수
// getReportListAPI : 세션 목록 조회
// getReportAPI     : 특정 세션의 상세 리포트 조회
// genFeedbackAPI   : AI 피드백 생성(재생성) 요청
import { getReportListAPI, getReportAPI, genFeedbackAPI } from '../../api/report.api';

// ScoreRing : 집중 점수를 원형 링 그래프로 표시하는 공통 컴포넌트
// Spinner   : 데이터 로딩 중 표시하는 로딩 애니메이션 컴포넌트
import ScoreRing from '../../components/common/ScoreRing';
import Spinner from '../../components/common/Spinner';

import './ReportPage.css';


// ────────────────────────────────────────────────
// ⚙️ Chart.js 플러그인 등록
// ────────────────────────────────────────────────

/*
  Chart.js는 트리 쉐이킹(Tree Shaking) 지원을 위해
  사용할 기능을 직접 등록해야 합니다.
  (트리 쉐이킹이란? 사용하지 않는 코드를 빌드 결과물에서 제거하는 최적화 기법)
  한 번만 등록하면 앱 전체에서 해당 차트 기능을 사용할 수 있습니다.
*/
ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  ArcElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler
);


// ────────────────────────────────────────────────
// 🛠️ 유틸리티 함수 (컴포넌트 외부에 정의)
// ────────────────────────────────────────────────

/*
  아래 함수들은 React Hook을 사용하지 않으므로
  컴포넌트 외부에 정의하여 불필요한 재생성을 방지합니다.
  컴포넌트가 렌더링될 때마다 새로 만들어질 필요가 없는 순수 함수들입니다.
*/

/*
  날짜 문자열을 'YYYY-MM-DD' 형식으로 변환합니다.

  @param {string} dateStr - 변환할 날짜 문자열 (ISO 형식 또는 일반 날짜 형식)
  @returns {string} 'YYYY-MM-DD' 형식의 날짜 문자열, 유효하지 않으면 원본 반환
*/
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr; // 파싱 실패 시 원본 문자열을 그대로 반환
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/*
  시간 문자열을 'HH:MM' 형식으로 변환합니다.

  @param {string} timeStr - 변환할 시간 문자열
                            ISO 형식('2024-01-01T14:30:00') 또는
                            시간 형식('14:30:00') 모두 처리 가능
  @returns {string} 'HH:MM' 형식의 시간 문자열
*/
const formatTime = (timeStr) => {
  if (!timeStr) return '';

  // ISO 날짜+시간 형식인 경우 Date 객체로 파싱하여 시/분 추출
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // 'HH:MM:SS' 형식인 경우 앞 5자리('HH:MM')만 잘라서 반환
  return timeStr.slice(0, 5);
};

/*
  AI가 반환한 피드백 원본 문자열을 JSON 객체로 파싱합니다.

  AI 응답에는 종종 ```json ... ``` 형태의 마크다운 코드블록이 포함되므로
  정규식으로 제거한 뒤 JSON.parse()를 시도합니다.

  @param {string} raw - AI가 반환한 피드백 원본 문자열
  @returns {object|null} 파싱 성공 시 피드백 객체, 실패 시 null
    반환 객체 예시:
    {
      오늘의총평 : '총평 내용',
      긍정분석   : '잘한 점 내용',
      보완사항   : '개선할 점 내용',
      집중태그   : '#집중 #몰입 ...',
    }
*/
const parseFeedback = (raw) => {
  if (!raw) return null;
  try {
    // 마크다운 코드블록 래퍼(```json, ```) 제거 후 앞뒤 공백 제거
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // 필수 키 중 하나라도 있어야 유효한 피드백으로 판단
    if (parsed.오늘의총평 || parsed.긍정분석 || parsed.보완사항) {
      return parsed;
    }
    return null;
  } catch {
    // JSON 파싱 실패 시 null 반환 → 호출부에서 원본 텍스트 그대로 표시
    return null;
  }
};

/*
  집중 태그 문자열을 파싱하여 태그 배지 목록 JSX를 반환합니다.
  '#' 으로 시작하는 단어만 태그로 인식합니다.

  @param {string} tagStr - 공백으로 구분된 태그 문자열 (예: '#집중 #몰입 #성취')
  @returns {JSX.Element|null} 태그 배지 목록 요소, 태그가 없으면 null
*/
const renderTags = (tagStr) => {
  if (!tagStr) return null;

  // 공백으로 분리 후 '#'으로 시작하는 단어만 필터링
  const tags = tagStr.split(' ').filter(t => t.startsWith('#'));

  return (
    <div className="feedback-tags">
      {tags.map((tag, i) => (
        <span key={i} className="feedback-tag">{tag}</span>
      ))}
    </div>
  );
};


// ────────────────────────────────────────────────
// 🤖 AI 피드백 카드 컴포넌트
// ────────────────────────────────────────────────

/*
  AI 피드백 원본 문자열을 받아 두 가지 형태로 렌더링합니다.

  ▼ 렌더링 방식 2가지 ▼
    - JSON 파싱 성공 시 : 총평 · 긍정 · 보완 · 태그로 구조화된 카드 형태
    - JSON 파싱 실패 시 : 원본 텍스트를 그대로 표시하는 단순 박스 형태

  Hook을 사용하지 않으므로 컴포넌트 외부에 정의합니다.

  @param {string} raw - AI가 반환한 피드백 원본 문자열
*/
const FeedbackCard = ({ raw }) => {
  const parsed = parseFeedback(raw);

  // ── 구조화된 카드 형태 (JSON 파싱 성공 시)
  if (parsed) {
    return (
      <div className="feedback-box feedback-box--structured">

        {/* 오늘의 총평 */}
        {parsed.오늘의총평 && (
          <div className="feedback-section__summary">
            <span className="feedback-section__badge">오늘의 총평</span>
            <p className="feedback-summary-text">{parsed.오늘의총평}</p>
          </div>
        )}

        {/* 긍정 분석 + 보완 사항 2컬럼 */}
        <div className="feedback-columns">
          {parsed.긍정분석 && (
            <div className="feedback-col feedback-col--positive">
              <div className="feedback-col__header">
                <span className="feedback-col__icon">✅</span>
                <span className="feedback-col__title">잘한 점</span>
              </div>
              {/* pre-line : 줄바꿈 문자(\n)를 그대로 렌더링 */}
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

        {/* 집중 키워드 태그 */}
        {parsed.집중태그 && renderTags(parsed.집중태그)}
      </div>
    );
  }

  // ── 단순 텍스트 박스 형태 (JSON 파싱 실패 시)
  return (
    <div className="feedback-box" style={{ whiteSpace: 'pre-line' }}>
      {raw}
    </div>
  );
};


// ────────────────────────────────────────────────
// 📄 ReportPage 메인 컴포넌트
// ────────────────────────────────────────────────

/*
  리포트 페이지의 최상위 컴포넌트입니다.
  왼쪽 세션 목록 사이드바와 오른쪽 상세 리포트 영역으로 구성됩니다.

  ▼ 주요 기능 ▼
    - 세션 목록 조회 및 무한 스크롤(더보기) 처리
    - 선택된 세션의 상세 리포트 조회
    - 자세별 오류 횟수 막대 차트 렌더링
    - AI 피드백 표시 및 재생성 요청
*/
const ReportPage = () => {

  // URL 파라미터에서 imm_idx(세션 고유 번호)를 추출합니다
  // 예: /report/42 → paramIdx = '42'
  const { imm_idx: paramIdx } = useParams();
  const navigate = useNavigate();


  // ────────────────────────────────────────────────
  // 🗄️ 상태(State) 선언
  // ────────────────────────────────────────────────

  const [sessions, setSessions]             = useState([]);              // 사이드바에 표시할 세션 목록
  const [selIdx, setSelIdx]                 = useState(paramIdx || null); // 현재 선택된 세션의 imm_idx
  const [report, setReport]                 = useState(null);            // 선택된 세션의 상세 리포트 데이터
  const [loading, setLoading]               = useState(false);           // 리포트 상세 조회 중 로딩 여부
  const [aiFeedback, setAiFeedback]         = useState('');              // AI 피드백 원본 문자열
  const [page, setPage]                     = useState(1);               // 세션 목록 현재 페이지 번호
  const [hasMore, setHasMore]               = useState(false);           // 다음 페이지 존재 여부 (더보기 버튼 표시 제어)
  const [isRegenerating, setIsRegenerating] = useState(false);           // AI 피드백 재생성 요청 중 여부


  // ────────────────────────────────────────────────
  // 🔄 AI 피드백 재생성 핸들러
  // ────────────────────────────────────────────────

  /*
    useCallback : 의존성 배열(selIdx, isRegenerating)이 바뀌지 않으면
                  이전에 만든 함수를 재사용합니다. (불필요한 리렌더링 방지)

    ▼ 동작 순서 ▼
      1. 이미 재생성 중이거나 선택된 세션이 없으면 즉시 종료
      2. 재생성 중 상태로 전환 → 버튼 비활성화
      3. AI 피드백 생성 API 호출
      4. 성공 시 새 피드백으로 상태 업데이트
      5. 완료 후(성공/실패 모두) 재생성 중 상태 해제
  */
  const handleRegenFeedback = useCallback(async () => {
    if (!selIdx || isRegenerating) return;
    setIsRegenerating(true);
    try {
      const { data } = await genFeedbackAPI(selIdx);
      setAiFeedback(data.data.feedback);
    } catch (err) {
      console.error('피드백 재생성 실패:', err);
    } finally {
      // 성공·실패와 무관하게 재생성 중 상태를 반드시 해제
      setIsRegenerating(false);
    }
  }, [selIdx, isRegenerating]);


  // ────────────────────────────────────────────────
  // 📋 세션 목록 조회 함수
  // ────────────────────────────────────────────────

  /*
    페이지 번호(page)에 따라 세션 목록을 API에서 가져옵니다.

    ▼ 동작 방식 ▼
      - page === 1 : 새 목록으로 교체 (초기 로드 또는 새로고침)
      - page >= 2  : 기존 목록 뒤에 추가 (더보기 버튼 클릭 시)

    selIdx가 아직 없고, 첫 세션이 존재하면 자동으로 첫 번째 세션을 선택합니다.
  */
  const fetchSessionList = useCallback(() => {
    getReportListAPI(page)
      .then(({ data }) => {
        if (page === 1) {
          setSessions(data.data);                          // 1페이지: 목록 초기화
        } else {
          setSessions(prev => [...prev, ...data.data]);    // 2페이지~: 기존 목록에 추가
        }
        setHasMore(page < data.meta.totalPages);           // 다음 페이지가 있는지 확인
        if (!selIdx && data.data.length > 0) {
          setSelIdx(String(data.data[0].imm_idx));         // 자동으로 첫 번째 세션 선택
        }
      })
      .catch(console.error);
  }, [page, selIdx]);

  /*
    컴포넌트 마운트 시 또는 URL의 paramIdx가 바뀔 때 세션 목록을 조회합니다.
    page가 아닌 paramIdx를 의존성으로 사용하여 URL 직접 접근 시에도 동작합니다.
  */
  useEffect(() => {
    fetchSessionList();
  }, [paramIdx]);


  // ────────────────────────────────────────────────
  // 📊 리포트 상세 조회
  // ────────────────────────────────────────────────

  /*
    selIdx(선택된 세션 번호)가 바뀔 때마다 해당 세션의 상세 리포트를 조회합니다.

    ▼ 동작 순서 ▼
      1. 로딩 상태 시작, 기존 리포트·피드백 초기화
      2. 리포트 상세 API 호출
      3. 성공 시 리포트 데이터 저장, 피드백이 있으면 첫 번째 피드백 표시
      4. 완료 후 로딩 상태 해제
  */
  useEffect(() => {
    if (!selIdx) return;

    setLoading(true);
    setReport(null);     // 이전 세션 리포트가 잠깐 보이는 현상 방지
    setAiFeedback('');   // 이전 세션 피드백 초기화

    getReportAPI(selIdx)
      .then(({ data }) => {
        setReport(data.data);
        // 피드백이 여러 개 있을 경우 가장 최근(인덱스 0) 피드백을 표시
        if (data.data.feedbacks?.length > 0) {
          setAiFeedback(data.data.feedbacks[0].fb_content);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selIdx]);


  // ────────────────────────────────────────────────
  // 📉 자세별 오류 횟수 막대 차트 데이터 생성
  // ────────────────────────────────────────────────

  /*
    report.summary.poseTypeStat 데이터를 Chart.js 형식으로 변환합니다.
    오류가 없는 항목(v === 0)과 정상 자세(NORMAL)는 제외합니다.
    감지된 오류가 하나도 없으면 null을 반환하여 차트 대신 완벽 자세 메시지를 표시합니다.

    @returns {object|null} Chart.js의 data 형식 객체, 표시할 데이터가 없으면 null
  */
  const buildPoseBarChart = useCallback(() => {
    if (!report?.summary?.poseTypeStat) return null;

    // 영문 자세 코드를 사용자가 읽기 쉬운 한국어로 변환하는 매핑 테이블
    const LABEL_MAP = {
      TURTLE : '거북목',
      SLUMP  : '엎드림',
      TILT   : '몸 기울어짐',
      CHIN   : '턱 괴기',
      STATIC : '장시간 고정',
    };

    // NORMAL(정상) 제외, 매핑 테이블에 없는 코드 제외, 횟수가 0인 항목 제외
    const entries = Object.entries(report.summary.poseTypeStat)
      .filter(([k, v]) => k !== 'NORMAL' && LABEL_MAP[k] && v > 0);

    // 표시할 오류 자세가 없으면 null 반환
    if (!entries.length) return null;

    return {
      labels: entries.map(([k]) => LABEL_MAP[k]),
      datasets: [{
        label: '감지 횟수',
        data: entries.map(([, v]) => v),
        // 각 막대에 서로 다른 색상을 순서대로 적용
        backgroundColor: [
          'rgba(239,68,68,.75)',    // 빨강 (거북목)
          'rgba(249,115,22,.75)',   // 주황 (엎드림)
          'rgba(234,179,8,.75)',    // 노랑 (몸 기울어짐)
          'rgba(168,85,247,.75)',   // 보라 (턱 괴기)
          'rgba(59,130,246,.75)',   // 파랑 (장시간 고정)
        ],
        borderRadius: 6,           // 막대 모서리를 둥글게
        borderWidth: 0,            // 막대 테두리 제거
      }],
    };
  }, [report]);

  /*
    모든 차트에 공통으로 적용되는 기본 옵션입니다.
    responsive   : 부모 컨테이너 너비에 맞게 자동으로 크기 조정
    maintainAspectRatio : false로 설정하면 height를 CSS로 자유롭게 제어 가능
  */
  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
  };


  // ────────────────────────────────────────────────
  // 🖥️ 렌더링
  // ────────────────────────────────────────────────

  return (
    <div className="report-page">

      {/* ════════════════════════════════════════
          왼쪽: 세션 목록 사이드바
      ════════════════════════════════════════ */}
      <aside className="report-sidebar">

        {/* ── 사이드바 헤더 (제목 + 세션 총 개수 배지) */}
        <div className="sidebar-header">
          <h3>📋 최근 세션 기록</h3>
          <span className="session-count">{sessions.length}개</span>
        </div>

        {/* ── 세션이 없을 때: 빈 상태 안내 */}
        {sessions.length === 0 ? (
          <div className="sidebar-empty">
            <p>아직 집중 기록이 없습니다</p>
            <button className="btn btn--primary btn--sm" onClick={() => navigate('/camera')}>
              🚀 집중 시작
            </button>
          </div>
        ) : (
          /* ── 세션 목록 (최대 5개 표시) */
          <ul className="session-list">
            {sessions.slice(0, 5).map((s, idx) => (
              <li
                key={s.imm_idx}
                // 현재 선택된 세션에 active 클래스 추가 → 왼쪽 강조 보더 표시
                className={`session-item ${String(s.imm_idx) === String(selIdx) ? 'active' : ''}`}
                onClick={() => {
                  setSelIdx(String(s.imm_idx));
                  navigate(`/report/${s.imm_idx}`); // URL도 함께 업데이트
                }}
              >
                {/* 순번 배지 (#1, #2 ...) */}
                <div className="session-item__rank">#{idx + 1}</div>

                <div className="session-item__info">
                  {/* 날짜 */}
                  <div className="session-item__date">📅 {formatDate(s.imm_date)}</div>

                  {/* 시작 ~ 종료 시간 */}
                  <div className="session-item__time">
                    🕐 {formatTime(s.start_time)} ~ {formatTime(s.end_time)}
                  </div>

                  {/* 점수 · 시간 배지 */}
                  <div className="session-item__stats">
                    <span className="stat-badge stat-badge--score">🏆 {s.imm_score}점</span>
                    <span className="stat-badge stat-badge--time">⏱ {s.duration_min ?? 0}분</span>
                  </div>

                  {/* 자세 오류 · 소음 감지 횟수 */}
                  <div className="session-item__meta">
                    <span>⚠️ 자세오류 {s.bad_pose_count ?? 0}회</span>
                    <span>🔊 소음 {s.noise_count ?? 0}회</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ── 더보기 버튼 (다음 페이지가 있을 때만 표시) */}
        {hasMore && (
          <button
            className="btn btn--ghost btn--sm"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={() => setPage(p => p + 1)} // 페이지 번호를 1 증가시켜 추가 로드
          >
            📋 더보기
          </button>
        )}
      </aside>


      {/* ════════════════════════════════════════
          오른쪽: 리포트 상세 영역
      ════════════════════════════════════════ */}
      <div className="report-detail">

        {/* ── 로딩 중: 스피너 표시 */}
        {loading && <Spinner text="리포트 불러오는 중..." />}

        {/* ── 세션 미선택 상태: 안내 메시지 표시 */}
        {!loading && !report && (
          <div className="report-empty">
            <span className="report-empty__icon">📊</span>
            <p>왼쪽에서 세션을 선택하면 리포트가 표시됩니다.</p>
            <button className="btn btn--primary" onClick={() => navigate('/camera')}>
              🚀 집중 시작하기
            </button>
          </div>
        )}

        {/* ── 리포트 데이터 로드 완료: 상세 내용 렌더링 */}
        {!loading && report && (() => {
          // report 객체를 각 영역별로 구조 분해 할당
          const { immersion, summary, timelapses } = report;
          const poseBarChart = buildPoseBarChart();

          // ── 최고 연속 바른 자세 시간을 분/초로 변환
          const streak    = immersion.max_good_streak || 0;
          const streakMin = Math.floor(streak / 60);
          const streakSec = String(streak % 60).padStart(2, '0'); // 1초 → '01'

          return (
            <>
              {/* ════════════════════════════════
                  1행: 요약 지표 카드 4개
              ════════════════════════════════ */}
              <div className="report-summary-row">

                {/* 집중 점수 카드 - 원형 링 그래프로 시각화 */}
                <div className="summary-card" style={{ borderTopColor: 'var(--color-primary)' }}>
                  <div className="summary-card__label">집중 점수</div>
                  <ScoreRing score={immersion.imm_score} size={60} />
                </div>

                {/* 집중 시간 카드 - 총 몰입 시간과 세션 시간대 표시 */}
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

                {/* 최고 연속 바른 자세 카드 - 연속 유지 시간에 따라 응원 메시지 변경 */}
                <div className="summary-card" style={{ borderTopColor: 'var(--color-info, #0ea5e9)' }}>
                  <div className="summary-card__label">최고 연속 바른 자세</div>
                  <div className="summary-card__value">
                    {streakMin}<small style={{ fontSize: '.9rem' }}>분 </small>
                    {streakSec}<small style={{ fontSize: '.9rem' }}>초</small>
                  </div>
                  {/* 연속 유지 시간(분)에 따라 3단계 응원 메시지 표시 */}
                  <div className="summary-card__sub">
                    {streakMin >= 5 ? '🏆 훌륭한 자세 유지력이에요!'
                      : streakMin >= 2 ? '👍 좋아요! 더 늘려봐요!'
                        : '💪 바른 자세를 더 유지해봐요!'}
                  </div>
                </div>

                {/* 평균 소음 카드 - 세션 중 평균 데시벨과 소음 감지 횟수 표시 */}
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


              {/* ════════════════════════════════
                  2행: 타임랩스 + 자세별 오류 횟수 차트
              ════════════════════════════════ */}
              <div className="report-main-row">

                {/* ── 타임랩스 섹션 */}
                {timelapses?.length > 0 ? (
                  /*
                    타임랩스가 있는 경우:
                    영상은 서버에 저장되지 않으므로 사용자가 직접 파일을 선택해야 합니다.
                    선택한 파일이 DB에 기록된 파일명과 일치하는지 검증 후 재생합니다.
                  */
                  <div className="timelapse-section">
                    <h3>🎬 타임랩스</h3>
                    <div className="timelapse-grid">
                      {timelapses.map(t => (
                        <div key={t.lapse_idx} className="timelapse-item">

                          {/* 영상 플레이어 (초기에는 src 없음, 파일 선택 시 동적으로 설정) */}
                          <div className="timelapse-player">
                            <video id={`video-${t.lapse_idx}`} controls />
                          </div>

                          {/* 파일 업로드 영역 */}
                          <div className="timelapse-upload-area">
                            {/* 실제 파일 input은 숨기고, label 클릭으로 파일 탐색기 열기 */}
                            <input
                              type="file"
                              accept="video/webm,video/*"
                              id={`file-${t.lapse_idx}`}
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (!file) return;

                                // 파일명 검증: DB에 저장된 파일명과 다르면 경고 후 취소
                                if (file.name !== t.file_name) {
                                  alert(`⚠️ 파일명이 다릅니다!\n\n필요한 파일: ${t.file_name}\n선택한 파일: ${file.name}`);
                                  e.target.value = '';
                                  return;
                                }

                                // URL.createObjectURL : 선택한 파일을 브라우저 메모리에서
                                // 임시 URL로 만들어 video 요소에 바로 재생 가능하게 합니다.
                                const url = URL.createObjectURL(file);
                                const videoEl = document.getElementById(`video-${t.lapse_idx}`);
                                if (videoEl) videoEl.src = url;
                              }}
                            />
                            {/* label의 htmlFor가 input의 id와 연결되어 클릭 시 파일 탐색기 열림 */}
                            <label htmlFor={`file-${t.lapse_idx}`} className="timelapse-upload-btn">
                              <span className="timelapse-upload-btn__icon">📂</span>
                              <span className="timelapse-upload-btn__text">파일 불러오기</span>
                              <span className="timelapse-upload-btn__desc">
                                저장된 타임랩스 파일을<br />선택해 주세요
                              </span>
                              {/* 선택해야 할 정확한 파일명을 안내 */}
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
                  /* 타임랩스가 없는 경우: 안내 메시지 표시 */
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

                {/* ── 자세별 오류 횟수 막대 차트 */}
                {poseBarChart ? (
                  /* 오류 자세가 있는 경우: 막대 차트 렌더링 */
                  <div className="chart-card timeline-card">
                    <h3>🧘 자세별 오류 횟수</h3>
                    <div className="chart-wrap">
                      <Bar
                        data={poseBarChart}
                        options={{
                          ...chartOpts,
                          // 이 차트는 범례가 없어도 색상으로 구분되므로 범례 숨김
                          plugins: { ...chartOpts.plugins, legend: { display: false } },
                          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, // Y축 최소값 0, 정수 단위
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  /* 오류 자세가 없는 경우: 완벽한 자세 축하 메시지 표시 */
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


              {/* ════════════════════════════════
                  3행: AI 피드백 섹션
              ════════════════════════════════ */}
              <div className="feedback-section">

                {/* ── 섹션 헤더: 제목 + 피드백 재생성 버튼 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                  <h3 style={{ margin: 0 }}>🤖 AI 피드백</h3>

                  {/* 피드백이 존재할 때만 재생성 버튼 표시 */}
                  {aiFeedback && (
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={handleRegenFeedback}
                      disabled={isRegenerating} // 재생성 중에는 버튼 비활성화
                    >
                      {isRegenerating ? '⏳ 재생성 중...' : '🔄 피드백 재생성'}
                    </button>
                  )}
                </div>

                {/* ── 피드백 본문: 있으면 FeedbackCard, 없으면 빈 상태 안내 */}
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
