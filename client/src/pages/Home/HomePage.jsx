// client/src/pages/Home/HomePage.jsx
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './HomePage.css';

const features = [
  { icon: '📷', title: '실시간 자세 분석',  desc: 'MediaPipe 랜드마크로 자세를 실시간 감지하고 즉각 피드백을 제공합니다.' },
  { icon: '🔊', title: '소음 환경 감지',     desc: 'Web Audio API로 주변 소음을 분석해 집중에 방해되는 환경을 알려줍니다.' },
  { icon: '📊', title: '집중 리포트',        desc: '세션별 자세/소음 그래프, AI 피드백, 타임랩스로 집중 패턴을 파악하세요.' },
  { icon: '🏅', title: '게이미피케이션',     desc: '집중할수록 포인트가 쌓이고, 뱃지를 수집하며 성장을 확인할 수 있습니다.' },
];

const HomePage = () => {
  const { token } = useAuth();
  const navigate  = useNavigate();

  return (
    <div className="home-page">
      {/* 히어로 */}
      <section className="home-hero">
        <div className="home-hero__content">
          <div className="home-hero__badge">✨ AI 기반 자세 분석 플랫폼</div>
          <h1 className="home-hero__title">
            공부할 때 자세,<br />
            <span className="home-hero__title--accent">고민중독</span>이 지켜줍니다
          </h1>
          <p className="home-hero__desc">
            MediaPipe 기반 실시간 자세 분석으로 집중력을 극대화하고<br />
            올바른 학습 습관을 만들어 보세요.
          </p>
          <div className="home-hero__cta">
            {token ? (
              <button className="btn btn--primary btn--lg" onClick={() => navigate('/camera')}>
                🚀 집중 시작하기
              </button>
            ) : (
              <>
                <Link to="/register" className="btn btn--primary btn--lg">무료로 시작하기</Link>
                <Link to="/login"    className="btn btn--outline btn--lg">로그인</Link>
              </>
            )}
          </div>
        </div>
        <div className="home-hero__visual">
          <div className="visual-card">
            <div className="visual-score">
              <span className="visual-score__num">87</span>
              <span className="visual-score__label">집중 점수</span>
            </div>
            <div className="visual-badges">
              <span>🌱</span><span>⭐</span><span>🦅</span>
            </div>
            <div className="visual-status good">✅ 바른 자세 유지 중</div>
          </div>
        </div>
      </section>

      {/* 기능 카드 */}
      <section className="home-features">
        <h2 className="home-section-title">주요 기능</h2>
        <div className="features-grid">
          {features.map(f => (
            <div key={f.title} className="feature-card">
              <span className="feature-card__icon">{f.icon}</span>
              <h3 className="feature-card__title">{f.title}</h3>
              <p className="feature-card__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA 섹션 */}
      {!token && (
        <section className="home-cta">
          <h2>지금 바로 시작해보세요</h2>
          <p>회원가입 시 웰컴 포인트 30P를 드립니다!</p>
          <Link to="/register" className="btn btn--primary btn--lg">무료 회원가입</Link>
        </section>
      )}
    </div>
  );
};

export default HomePage;
