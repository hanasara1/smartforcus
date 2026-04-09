// client/src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ── 베이스 스타일 (순서 중요)
import './styles/base/reset.css';
import './styles/base/variables.css';
import './styles/base/typography.css';
import './styles/base/global.css';

// ✅ 모든 스킨 CSS를 한꺼번에 import
// (data-skin 속성으로 활성화/비활성화)
import './styles/skins/skin-default.css';
import './styles/skins/skin-dark.css';
import './styles/skins/skin-ocean.css';
import './styles/skins/skin-sunset.css';
import './styles/skins/skin-forest.css';
import './styles/skins/skin-bg-space.css';
import './styles/skins/skin-bg-nature.css';
import './styles/skins/skin-bg-minimal.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <App />
    ,
);
