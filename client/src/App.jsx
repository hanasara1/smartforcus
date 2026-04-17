// client/src/App.jsx


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

import React from 'react';

// BrowserRouter : HTML5 History API 기반의 라우터 컨테이너
// Routes        : Route 목록을 감싸는 컨테이너 (매칭된 첫 번째 Route만 렌더링)
// Route         : URL 경로와 컴포넌트를 1:1로 연결하는 라우팅 단위
// Navigate      : 특정 경로로 즉시 리다이렉트하는 컴포넌트
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// AuthProvider : 로그인 토큰 등 인증 상태를 앱 전체에 공급하는 Context Provider
// useAuth      : AuthContext의 인증 상태(token 등)를 읽어오는 커스텀 Hook
import { AuthProvider, useAuth } from './context/AuthContext';

// ── 페이지 컴포넌트
import LoginPage    from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import HomePage     from './pages/Home/HomePage';
import CameraPage   from './pages/Camera/CameraPage';
import ReportPage   from './pages/Report/ReportPage';
import MyPage       from './pages/MyPage/MyPage';

// MainLayout : 로그인이 필요한 페이지들의 공통 레이아웃 (사이드바, 헤더 등)
import MainLayout from './components/layout/MainLayout';


// ────────────────────────────────────────────────
// 🔒 인증 보호 라우트 컴포넌트
// ────────────────────────────────────────────────

/*
  PrivateRoute란?
  로그인이 필요한 페이지를 보호하는 래퍼(wrapper) 컴포넌트입니다.
  token이 있으면 children(자식 컴포넌트)을 그대로 렌더링하고,
  token이 없으면 로그인 페이지(/login)로 즉시 리다이렉트합니다.

  replace 옵션이란?
  현재 히스토리 항목을 교체하여 뒤로가기 시 보호된 페이지가 아닌
  그 이전 페이지로 이동하도록 합니다.
  (replace 없이 push하면 뒤로가기 → 보호 페이지 → 다시 /login 무한 루프 발생 가능)

  @param {ReactNode} children - 인증 성공 시 렌더링할 자식 컴포넌트
*/
const PrivateRoute = ({ children }) => {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
};


// ────────────────────────────────────────────────
// 🗺️ 앱 라우팅 구조 정의
// ────────────────────────────────────────────────

/*
  AuthProvider를 BrowserRouter 바깥에 배치한 이유:
  AuthProvider 내부에서 useNavigate() 등 라우터 Hook을 사용할 경우를 대비하여
  BrowserRouter보다 상위에 위치시킵니다.
  이렇게 하면 인증 로직에서도 라우터 기능을 자유롭게 사용할 수 있습니다.

  ▼ 라우팅 구조 3단계 ▼
    1단계 - 공개 라우트 : 로그인 없이 누구나 접근 가능한 페이지
    2단계 - 보호 라우트 : PrivateRoute로 감싸진 로그인 필수 페이지
                         MainLayout을 공통 부모로 하여 사이드바/헤더 공유
    3단계 - 폴백 라우트 : 정의되지 않은 모든 경로를 홈(/)으로 리다이렉트
*/
const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>

        {/* ── 1단계: 공개 라우트 (로그인 불필요) */}
        <Route path="/"         element={<HomePage />} />     {/* 랜딩/홈 페이지       */}
        <Route path="/login"    element={<LoginPage />} />    {/* 로그인 페이지         */}
        <Route path="/register" element={<RegisterPage />} /> {/* 회원가입 페이지       */}

        {/* ── 2단계: 보호 라우트 (로그인 필수)
            PrivateRoute로 전체를 감싸고, MainLayout을 공통 레이아웃으로 사용합니다.
            element에 레이아웃을 지정하면 하위 Route들이 레이아웃 안에서 렌더링됩니다. */}
        <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
          <Route path="/camera"          element={<CameraPage />} />  {/* 집중 카메라 페이지          */}
          <Route path="/report"          element={<ReportPage />} />  {/* 리포트 목록 페이지          */}
          <Route path="/report/:imm_idx" element={<ReportPage />} />  {/* 특정 세션 리포트 상세 페이지 */}
          <Route path="/mypage"          element={<MyPage />} />      {/* 마이페이지                  */}
        </Route>

        {/* ── 3단계: 폴백 라우트
            위의 모든 경로에 매칭되지 않는 URL은 홈(/)으로 리다이렉트합니다.
            (예: /없는경로, /typo 등 404 상황 처리) */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
