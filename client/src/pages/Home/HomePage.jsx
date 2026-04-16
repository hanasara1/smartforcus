// client/src/pages/Home/HomePage.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
import React from 'react';

// Link        : 페이지 이동 없이 클라이언트 사이드 라우팅을 제공하는 컴포넌트
//               예: '무료로 시작하기' → /register, '로그인' → /login
// useNavigate : 로그인 상태에서 '집중 시작하기' 클릭 시 /camera로 이동시키는 훅
import { Link, useNavigate } from 'react-router-dom';

// useAuth : 전역 인증 상태에서 token을 가져오는 커스텀 훅
//           로그인 여부에 따라 CTA 버튼과 하단 섹션을 다르게 렌더링합니다.
import { useAuth } from '../../context/AuthContext';

// HomePage.css : 히어로, 기능 카드, CTA 섹션의 레이아웃 스타일
import './HomePage.css';


// ────────────────────────────────────────────────
// 📋 주요 기능 소개 데이터
// ────────────────────────────────────────────────

/*
  features 배열이란?
  '주요 기능' 섹션에 렌더링할 기능 카드의 데이터를 정의합니다.
  컴포넌트 외부에 선언하여 렌더링 시마다 재생성되지 않도록 합니다.

  ▼ 각 항목 구조 ▼
    - icon  : 기능을 표현하는 이모지 아이콘
    - title : 기능 카드의 제목 (key로도 사용)
    - desc  : 기능에 대한 짧은 설명 문구
*/
const features = [
  {
    icon  : '📷',
    title : '실시간 자세 분석',
    desc  : 'MediaPipe 랜드마크로 자세를 실시간 감지하고 즉각 피드백을 제공합니다.',
  },
  {
    icon  : '🔊',
    title : '소음 환경 감지',
    desc  : 'Web Audio API로 주변 소음을 분석해 집중에 방해되는 환경을 알려줍니다.',
  },
  {
    icon  : '📊',
    title : '집중 리포트',
    desc  : '세션별 자세/소음 그래프, AI 피드백, 타임랩스로 집중 패턴을 파악하세요.',
  },
  {
    icon  : '🏅',
    title : '게이미피케이션',
    desc  : '집중할수록 포인트가 쌓이고, 뱃지를 수집하며 성장을 확인할 수 있습니다.',
  },
];


// ────────────────────────────────────────────────
// 🏠 HomePage 컴포넌트 (서비스 소개 랜딩 페이지)
// ────────────────────────────────────────────────

/*
  HomePage란?
  서비스의 첫인상을 결정하는 랜딩 페이지 컴포넌트입니다.
  로그인 여부에 따라 CTA(Call To Action) 버튼이 다르게 표시됩니다.

  ▼ 페이지 구성 ▼
    1. 히어로 섹션  : 서비스 소개 문구 + CTA 버튼 + 시각적 데모 카드
    2. 기능 섹션    : 4가지 주요 기능을 카드 그리드로 소개
    3. CTA 섹션     : 비로그인 사용자에게만 표시되는 회원가입 유도 배너

  ▼ 로그인 상태에 따른 CTA 분기 ▼
    - 로그인 O : '집중 시작하기' 버튼 → /camera 이동
    - 로그인 X : '무료로 시작하기' → /register, '로그인' → /login
*/
const HomePage = () => {
  const { token } = useAuth(); // 로그인 여부 확인 (token 존재 시 로그인 상태)
  const navigate  = useNavigate();


  // ── JSX 렌더링 ───────────────────────────────

  return (
    <div className="home-page">

      {/* ════════════════════════════════
          🚀 히어로 섹션
          서비스 핵심 메시지 + CTA 버튼 + 데모 카드
          ════════════════════════════════ */}
      <section className="home-hero">

        {/* 좌측 : 텍스트 콘텐츠 영역 */}
        <div className="home-hero__content">

          {/* 서비스 카테고리 배지 */}
          <div className="home-hero__badge">✨ AI 기반 자세 분석 플랫폼</div>

          {/* 메인 헤드라인 */}
          <h1 className="home-hero__title">
            공부할 때 자세,<br />
            {/* 브랜드명을 강조 색상으로 표시 */}
            <span className="home-hero__title--accent">고민중독</span>이 지켜줍니다
          </h1>

          {/* 서브 설명 문구 */}
          <p className="home-hero__desc">
            MediaPipe 기반 실시간 자세 분석으로 집중력을 극대화하고<br />
            올바른 학습 습관을 만들어 보세요.
          </p>

          {/* CTA 버튼 : 로그인 여부에 따라 다르게 렌더링 */}
          <div className="home-hero__cta">
            {token ? (
              // 로그인 상태 : 바로 집중 시작 버튼 (navigate로 이동)
              <button
                className="btn btn--primary btn--lg"
                onClick={() => navigate('/camera')}
              >
                🚀 집중 시작하기
              </button>
            ) : (
              // 비로그인 상태 : 회원가입 + 로그인 버튼 (Link로 이동)
              <>
                <Link to="/register" className="btn btn--primary btn--lg">
                  무료로 시작하기
                </Link>
                <Link to="/login" className="btn btn--outline btn--lg">
                  로그인
                </Link>
              </>
            )}
          </div>
        </div>

        {/* 우측 : 서비스 데모 시각 카드 */}
        <div className="home-hero__visual">
          <div className="visual-card">

            {/* 집중 점수 표시 */}
            <div className="visual-score">
              <span className="visual-score__num">87</span>
              <span className="visual-score__label">집중 점수</span>
            </div>

            {/* 획득 뱃지 목록 미리보기 */}
            <div className="visual-badges">
              <span>🌱</span>
              <span>⭐</span>
              <span>🦅</span>
            </div>

            {/* 현재 자세 상태 표시 */}
            <div className="visual-status good">✅ 바른 자세 유지 중</div>

          </div>
        </div>

      </section>


      {/* ════════════════════════════════
          📋 주요 기능 소개 섹션
          features 배열을 카드 그리드로 렌더링합니다.
          ════════════════════════════════ */}
      <section className="home-features">
        <h2 className="home-section-title">주요 기능</h2>

        <div className="features-grid">
          {/*
            features.map() : 각 기능 데이터를 카드로 렌더링합니다.
            key={f.title}  : 제목은 고유값이므로 React 리스트 키로 사용합니다.
          */}
          {features.map(f => (
            <div key={f.title} className="feature-card">
              <span className="feature-card__icon">{f.icon}</span>
              <h3 className="feature-card__title">{f.title}</h3>
              <p className="feature-card__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>


      {/* ════════════════════════════════
          🎯 하단 CTA 섹션
          비로그인 사용자에게만 회원가입을 유도하는 배너입니다.
          token이 있으면 렌더링하지 않습니다. (조건부 렌더링)
          ════════════════════════════════ */}
      {!token && (
        <section className="home-cta">
          <h2>지금 바로 시작해보세요</h2>
          <p>회원가입 시 웰컴 포인트 30P를 드립니다!</p>
          <Link to="/register" className="btn btn--primary btn--lg">
            무료 회원가입
          </Link>
        </section>
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
    import HomePage from '@/pages/Home/HomePage';
    <Route path="/" element={<HomePage />} />
*/
export default HomePage;
