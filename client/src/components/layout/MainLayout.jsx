// client/src/components/layout/MainLayout.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React       : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
// useEffect   : 컴포넌트가 렌더링된 후 특정 작업(API 호출 등)을 실행하는 훅
//               의존성 배열의 값이 바뀔 때마다 다시 실행됩니다.
// useState    : 컴포넌트 내부에서 상태(state) 값을 관리하는 훅
//               상태가 바뀌면 컴포넌트가 자동으로 다시 렌더링됩니다.
import React, { useEffect, useState } from 'react';

// Outlet      : 중첩 라우트의 자식 페이지 컴포넌트를 렌더링하는 자리표시자
//               예: /camera, /report, /mypage 각 페이지가 이 위치에 그려집니다.
// NavLink     : react-router-dom의 링크 컴포넌트로, 현재 경로와 일치하면
//               isActive를 제공하여 활성화 스타일을 적용할 수 있습니다.
// useNavigate : 특정 경로로 프로그래밍 방식으로 이동시키는 훅
//               예: 로그아웃 후 /login으로 강제 이동
// useLocation : 현재 브라우저 URL 경로(pathname) 정보를 가져오는 훅
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';

// useAuth : 로그인한 유저 정보(user)와 로그아웃 함수(logout)를 제공하는 커스텀 훅
//           AuthContext에서 전역으로 관리되는 인증 상태를 읽어옵니다.
import { useAuth } from '../../context/AuthContext';

// getMeAPI : 현재 로그인한 유저의 최신 정보(포인트 등)를 서버에서 가져오는 API 함수
import { getMeAPI } from '../../api/user.api';

// MainLayout.css : 사이드 네비, 헤더, 콘텐츠 영역의 레이아웃 스타일
import './MainLayout.css';


// ────────────────────────────────────────────────
// 📋 페이지별 타이틀 매핑 상수
// ────────────────────────────────────────────────

/*
  현재 URL 경로(pathname)에 따라 헤더에 표시할 페이지 제목을 정의합니다.
  Object.entries()와 startsWith()를 조합하여 경로를 탐색합니다.
  매핑에 없는 경로는 기본값 '고민중독'으로 폴백(fallback) 처리됩니다.
*/
const PAGE_TITLES = {
  '/camera' : '📷 집중 모드',
  '/report' : '📊 분석 리포트',
  '/mypage' : '👤 마이페이지',
};


// ────────────────────────────────────────────────
// 🏗️ MainLayout 컴포넌트 (전체 페이지 레이아웃)
// ────────────────────────────────────────────────

/*
  MainLayout이란?
  로그인 후 진입하는 모든 페이지에 공통으로 적용되는 레이아웃 컴포넌트입니다.
  왼쪽의 사이드 네비게이션과 오른쪽의 콘텐츠 영역(헤더 + 페이지 본문)으로 구성됩니다.

  ▼ 전체 구조 ▼
    layout-root
    ├── nav.layout-nav          (사이드 네비게이션)
    │   ├── 브랜드 로고
    │   ├── 메뉴 섹션 × 3       (메인 / 기록 / 내 정보)
    │   └── 유저 정보 + 로그아웃
    └── div.layout-content      (우측 콘텐츠 영역)
        ├── header.layout-header (현재 페이지 제목 + 인사말)
        └── main.layout-main    (Outlet → 각 페이지 컴포넌트)
*/
const MainLayout = () => {
  const { user, logout }  = useAuth();   // 전역 인증 상태에서 유저 정보와 로그아웃 함수 추출
  const navigate          = useNavigate();
  const location          = useLocation();

  // totalPoints : 사이드바 하단에 표시할 유저의 누적 포인트
  const [totalPoints, setTotalPoints] = useState(0);


  // ── 포인트 최신화 (페이지 이동 시마다 갱신) ──────

  /*
    location.pathname이 바뀔 때마다 (= 다른 페이지로 이동할 때마다)
    getMeAPI()를 호출하여 서버에서 최신 포인트를 받아와 상태를 갱신합니다.
    .catch(() => {}) : API 실패 시 오류를 무시하고 기존 포인트 값을 유지합니다.
  */
  useEffect(() => {
    getMeAPI()
      .then(({ data }) => setTotalPoints(data.data.total_points))
      .catch(() => {});
  }, [location.pathname]); // 경로가 바뀔 때마다 재실행


  // ── 로그아웃 처리 ───────────────────────────────

  /*
    logout() : AuthContext의 상태를 초기화하고 저장된 토큰을 제거합니다.
    navigate('/login') : 로그아웃 후 로그인 페이지로 즉시 이동합니다.
  */
  const handleLogout = () => {
    logout();
    navigate('/login');
  };


  // ── 현재 페이지 제목 계산 ────────────────────────

  /*
    Object.entries(PAGE_TITLES) : { '/camera': '...' } 형태를 [키, 값] 배열로 변환합니다.
    find(([k]) => ...) : 현재 pathname이 키로 시작하는 항목을 탐색합니다.
      startsWith 사용 이유: '/camera/session' 같은 하위 경로도 '집중 모드'로 표시하기 위함입니다.
    ?.[1] : 일치하는 항목이 있으면 값(타이틀)을 추출하고, 없으면 undefined를 반환합니다.
    || '고민중독' : 일치하는 경로가 없을 때 기본 타이틀로 폴백합니다.
  */
  const pageTitle = Object.entries(PAGE_TITLES)
    .find(([k]) => location.pathname.startsWith(k))?.[1] || '고민중독';


  // ── JSX 렌더링 ───────────────────────────────────

  return (
    <div className="layout-root">

      {/* ════════════════════════════════
          🧭 사이드 네비게이션
          ════════════════════════════════ */}
      <nav className="layout-nav">

        {/* 브랜드 로고 영역 */}
        <div className="nav-brand">
          <span className="nav-brand__icon">🧠</span>
          <span className="nav-brand__name">고민중독</span>
        </div>

        {/* 메뉴 섹션 : 메인 */}
        <div className="nav-section">
          <p className="nav-section__label">메인</p>
          <ul className="nav-menu">
            <li>
              {/*
                NavLink의 className 콜백 방식:
                현재 경로가 '/camera'와 일치하면 'active' 클래스를 추가합니다.
                CSS에서 .active 클래스로 활성화된 메뉴 아이템을 강조합니다.
              */}
              <NavLink to="/camera" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">📷</span>
                <span>집중 시작</span>
              </NavLink>
            </li>
          </ul>
        </div>

        {/* 메뉴 섹션 : 기록 */}
        <div className="nav-section">
          <p className="nav-section__label">기록</p>
          <ul className="nav-menu">
            <li>
              <NavLink to="/report" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">📊</span>
                <span>분석 리포트</span>
              </NavLink>
            </li>
          </ul>
        </div>

        {/* 메뉴 섹션 : 내 정보 */}
        <div className="nav-section">
          <p className="nav-section__label">내 정보</p>
          <ul className="nav-menu">
            <li>
              <NavLink to="/mypage" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">👤</span>
                <span>마이페이지</span>
              </NavLink>
            </li>
          </ul>
        </div>

        {/* 네비 하단 : 유저 정보 + 로그아웃 버튼 */}
        <div className="nav-footer">
          <div className="nav-user">

            {/*
              아바타 : 유저 닉네임의 첫 글자를 대문자로 표시합니다.
              user?.nick?.[0]?.toUpperCase()
                - user가 없거나 nick이 없으면 옵셔널 체이닝(?.)으로 undefined 처리
                - undefined이면 || '?' 로 폴백하여 '?'를 표시합니다.
            */}
            <div className="nav-avatar">
              {user?.nick?.[0]?.toUpperCase() || '?'}
            </div>

            <div className="nav-user-info">
              <p className="nav-user-name">{user?.nick}</p>
              {/*
                toLocaleString() : 숫자에 천 단위 쉼표를 자동으로 추가합니다.
                예: 12500 → '12,500'
              */}
              <p className="nav-user-point">💎 {totalPoints.toLocaleString()}P</p>
            </div>
          </div>

          {/* 로그아웃 버튼 : 클릭 시 handleLogout 실행 */}
          <button
            className="btn btn--ghost btn--sm btn--full"
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>

      </nav>


      {/* ════════════════════════════════
          📄 우측 콘텐츠 영역
          ════════════════════════════════ */}
      <div className="layout-content">

        {/* 상단 헤더 : 현재 페이지 제목 + 유저 인사말 */}
        <header className="layout-header">
          <span className="layout-header__title">{pageTitle}</span>
          <div className="layout-header__actions">
            <span style={{ fontSize: '.85rem', color: 'var(--color-text-muted)' }}>
              {user?.nick} 님 안녕하세요 👋
            </span>
          </div>
        </header>

        {/*
          페이지 본문 영역
          <Outlet /> : 현재 경로에 맞는 자식 컴포넌트가 이 자리에 렌더링됩니다.
          예: /camera → CameraPage, /report → ReportPage
        */}
        <main className="layout-main">
          <Outlet />
        </main>

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
    import MainLayout from '@/components/layout/MainLayout';
    <Route element={<MainLayout />}>
      <Route path="/camera" element={<CameraPage />} />
      <Route path="/report" element={<ReportPage />} />
      <Route path="/mypage" element={<MyPage />}    />
    </Route>
*/
export default MainLayout;
