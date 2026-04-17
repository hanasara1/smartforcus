// client/src/index.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

import React from 'react';

// ReactDOM.createRoot : React 18의 새로운 렌더링 방식입니다.
// 기존 ReactDOM.render() 대신 사용하며, 동시성 기능(Concurrent Mode)을 활성화합니다.
import ReactDOM from 'react-dom/client';

// App : 전체 라우팅과 전역 Context Provider가 정의된 앱 최상위 컴포넌트
import App from './App';


// ────────────────────────────────────────────────
// 🎨 베이스 스타일 (import 순서 중요)
// ────────────────────────────────────────────────

/*
  CSS import 순서가 중요한 이유:
  CSS는 나중에 선언된 스타일이 이전 스타일을 덮어씁니다.(cascade)
  따라서 기반이 되는 스타일을 먼저, 구체적인 스타일을 나중에 불러와야 합니다.

  ▼ 올바른 import 순서 ▼
    1. reset.css     : 브라우저 기본 스타일 초기화 (가장 먼저 적용)
    2. variables.css : CSS 변수(토큰) 정의 (다른 파일에서 var()로 참조)
    3. typography.css: 텍스트 공통 스타일 (variables.css의 변수를 사용)
    4. global.css    : 버튼·폼 등 공통 컴포넌트 스타일 (위 세 파일 모두 참조)
*/
import './styles/base/reset.css';      // 1. 브라우저 기본 스타일 초기화
import './styles/base/variables.css';  // 2. CSS 변수(토큰) 정의
import './styles/base/typography.css'; // 3. 텍스트 공통 스타일
import './styles/base/global.css';     // 4. 버튼·폼·배지 등 공통 컴포넌트 스타일


// ────────────────────────────────────────────────
// 🖌️ 스킨(Skin) CSS 일괄 불러오기
// ────────────────────────────────────────────────

/*
  스킨 시스템 동작 방식:
  모든 스킨 CSS 파일을 한꺼번에 import하여 브라우저에 로드합니다.
  각 스킨은 [data-skin="스킨명"] 선택자로 정의되어 있어
  평소에는 적용되지 않다가, HTML 최상위 요소에
  data-skin 속성이 지정될 때만 해당 스킨이 활성화됩니다.

  예: <html data-skin="dark"> → dark 스킨 활성화
      <html data-skin="ocean"> → ocean 스킨 활성화

  ▼ 스킨 목록 ▼
    - skin-default    : 기본 라이트 테마 (인디고 강조색)
    - skin-dark       : 다크 모드 (슬레이트 계열)
    - skin-ocean      : 오션 테마 (하늘색·청록색)
    - skin-sunset     : 선셋 테마 (주황·레드 계열)
    - skin-forest     : 포레스트 테마 (짙은 초록 계열)
    - skin-bg-space   : 우주 배경 테마 (별 패턴 + 인디고 다크)
    - skin-bg-nature  : 자연 배경 테마 (그라디언트 + 에메랄드)
    - skin-bg-minimal : 미니멀 배경 테마 (슬레이트 라이트)
*/
import './styles/skins/skin-default.css';    // 기본 라이트 테마
import './styles/skins/skin-dark.css';       // 다크 모드
import './styles/skins/skin-ocean.css';      // 오션 테마
import './styles/skins/skin-sunset.css';     // 선셋 테마
import './styles/skins/skin-forest.css';     // 포레스트 테마
import './styles/skins/skin-bg-space.css';   // 우주 배경 테마
import './styles/skins/skin-bg-nature.css';  // 자연 배경 테마
import './styles/skins/skin-bg-minimal.css'; // 미니멀 배경 테마


// ────────────────────────────────────────────────
// 🚀 React 앱 초기화 및 렌더링
// ────────────────────────────────────────────────

/*
  document.getElementById('root') : public/index.html에 정의된
  <div id="root"></div> 요소를 React 앱의 마운트 지점으로 지정합니다.

  createRoot()  : React 18의 동시성 렌더링을 활성화하는 루트를 생성합니다.
  root.render() : 생성된 루트에 App 컴포넌트를 마운트하여 앱을 시작합니다.
*/
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <App />
);
