// client/src/components/layout/MainLayout.jsx
import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMeAPI } from '../../api/user.api';
import './MainLayout.css';

const PAGE_TITLES = {
  '/camera':  '📷 집중 모드',
  '/report':  '📊 분석 리포트',
  '/mypage':  '👤 마이페이지',
};

const MainLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [totalPoints, setTotalPoints] = useState(0);

  useEffect(() => {
    getMeAPI().then(({ data }) => setTotalPoints(data.data.total_points)).catch(() => {});
  }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const pageTitle = Object.entries(PAGE_TITLES).find(([k]) => location.pathname.startsWith(k))?.[1] || '고민중독';

  return (
    <div className="layout-root">
      {/* ── 사이드 네비 */}
      <nav className="layout-nav">
        <div className="nav-brand">
          <span className="nav-brand__icon">🧠</span>
          <span className="nav-brand__name">고민중독</span>
        </div>

        <div className="nav-section">
          <p className="nav-section__label">메인</p>
          <ul className="nav-menu">
            <li>
              <NavLink to="/camera" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">📷</span><span>집중 시작</span>
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="nav-section">
          <p className="nav-section__label">기록</p>
          <ul className="nav-menu">
            <li>
              <NavLink to="/report" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">📊</span><span>분석 리포트</span>
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="nav-section">
          <p className="nav-section__label">내 정보</p>
          <ul className="nav-menu">
            <li>
              <NavLink to="/mypage" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">👤</span><span>마이페이지</span>
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="nav-footer">
          <div className="nav-user">
            <div className="nav-avatar">{user?.nick?.[0]?.toUpperCase() || '?'}</div>
            <div className="nav-user-info">
              <p className="nav-user-name">{user?.nick}</p>
              <p className="nav-user-point">💎 {totalPoints.toLocaleString()}P</p>
            </div>
          </div>
          <button className="btn btn--ghost btn--sm btn--full" onClick={handleLogout}>로그아웃</button>
        </div>
      </nav>

      {/* ── 콘텐츠 영역 */}
      <div className="layout-content">
        <header className="layout-header">
          <span className="layout-header__title">{pageTitle}</span>
          <div className="layout-header__actions">
            <span style={{ fontSize: '.85rem', color: 'var(--color-text-muted)' }}>
              {user?.nick} 님 안녕하세요 👋
            </span>
          </div>
        </header>
        <main className="layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
