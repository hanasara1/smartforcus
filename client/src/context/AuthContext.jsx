// client/src/context/AuthContext.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React         : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
// createContext : 전역 상태를 공유할 Context 객체를 생성하는 함수
// useContext    : 생성된 Context의 값을 컴포넌트에서 읽어오는 훅
// useState      : 컴포넌트 내부 상태(토큰, 유저 정보)를 관리하는 훅
// useCallback   : 함수를 메모이제이션하여 불필요한 재생성을 방지하는 훅
//                 의존성 배열의 값이 바뀔 때만 함수를 새로 만듭니다.
// useEffect     : 컴포넌트 렌더링 후 사이드 이펙트(API 호출, 핸들러 등록 등)를 실행하는 훅
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// getActiveSkinAPI  : 현재 로그인한 유저의 적용 중인 스킨 정보를 가져오는 API 함수
import { getActiveSkinAPI } from '../api/skin.api';

// setLogoutHandler  : axios 인터셉터에 로그아웃 함수를 등록하는 함수
//                     401(인증 만료) 응답 시 자동으로 로그아웃 처리하기 위해 사용합니다.
import { setLogoutHandler } from '../api/axiosInstance';


// ────────────────────────────────────────────────
// 🌐 Context 객체 생성
// ────────────────────────────────────────────────

/*
  createContext(null) : 초기값이 null인 AuthContext를 생성합니다.
  이 Context를 통해 하위 컴포넌트 어디서든 token, user, login, logout에
  접근할 수 있습니다. (props 없이 전역으로 공유)
*/
const AuthContext = createContext(null);


// ────────────────────────────────────────────────
// 🎨 스킨 적용 유틸 함수
// ────────────────────────────────────────────────

/*
  applySkinToBody란?
  <body> 태그의 data-skin 속성을 변경하여 전체 페이지 테마(스킨)를 바꾸는 함수입니다.
  CSS에서 [data-skin="dark"] 등의 속성 선택자로 테마별 스타일을 적용합니다.

  @param {string} skinKey - 적용할 스킨 키 ('default', 'dark', 'ocean' 등)
                            falsy한 값이 들어오면 'default' 스킨으로 초기화합니다.
*/
export const applySkinToBody = (skinKey) => {
  document.body.setAttribute('data-skin', skinKey || 'default');
};


// ────────────────────────────────────────────────
// 🔐 AuthProvider 컴포넌트 (인증 상태 전역 공급자)
// ────────────────────────────────────────────────

/*
  AuthProvider란?
  앱 전체에 인증 상태(token, user)와 인증 관련 함수(login, logout)를
  Context를 통해 공급하는 최상위 Provider 컴포넌트입니다.
  일반적으로 App.jsx의 최상단을 감싸도록 배치합니다.

  ▼ 제공하는 값 (Context value) ▼
    - token  : 현재 저장된 JWT 인증 토큰 (없으면 null)
    - user   : 로그인한 유저 정보 객체 (없으면 null)
    - login  : 로그인 처리 함수
    - logout : 로그아웃 처리 함수
*/
export const AuthProvider = ({ children }) => {

  // ── 초기 상태 : localStorage에서 복원 ──────────

  /*
    useState의 초기화 함수 (() => ...) 형태를 사용하는 이유:
    컴포넌트가 최초 마운트될 때 딱 한 번만 실행되어 성능을 최적화합니다.
    (매 렌더링마다 localStorage를 읽지 않도록 방지)
  */

  // 페이지 새로고침 후에도 로그인 상태를 유지하기 위해 localStorage에서 토큰 복원
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  // 유저 정보는 JSON 문자열로 저장되어 있으므로 파싱이 필요합니다.
  // 파싱 실패(저장값 손상 등) 시 null로 초기화합니다.
  const [user, setUser] = useState(() => {
    try   { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
  });


  // ── 로그인 처리 함수 ─────────────────────────────

  /*
    login 함수가 하는 일:
      1. localStorage에 토큰과 유저 정보를 저장합니다. (새로고침 후 복원 목적)
      2. Context 상태(token, user)를 업데이트하여 하위 컴포넌트에 즉시 반영합니다.

    useCallback 적용 이유:
      의존성이 없는 함수이므로 컴포넌트가 리렌더링되어도 같은 함수 참조를 유지합니다.
      이를 통해 이 함수를 props로 받는 하위 컴포넌트의 불필요한 리렌더링을 방지합니다.

    @param {string} newToken  - 서버로부터 발급받은 JWT 토큰
    @param {object} userInfo  - 로그인한 유저 정보 객체
  */
  const login = useCallback((newToken, userInfo) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userInfo)); // 객체 → JSON 문자열로 변환 후 저장
    setToken(newToken);
    setUser(userInfo);
  }, []); // 의존성 없음 → 최초 생성 후 재생성되지 않음


  // ── 로그아웃 처리 함수 ───────────────────────────

  /*
    logout 함수가 하는 일:
      1. localStorage에서 토큰과 유저 정보를 완전히 삭제합니다.
      2. Context 상태를 null로 초기화합니다.
      3. 스킨을 기본값('default')으로 되돌립니다.

    ⚠️ 선언 순서 주의:
      아래의 useEffect들이 login, logout 함수를 의존성으로 참조하므로
      반드시 useEffect보다 먼저 선언되어야 합니다.
  */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    applySkinToBody('default'); // 로그아웃 시 스킨을 기본값으로 초기화
  }, []); // 의존성 없음 → 최초 생성 후 재생성되지 않음


  // ── useEffect ① : 스킨 로드 ─────────────────────

  /*
    token이 바뀔 때마다 (로그인 / 로그아웃 시) 스킨을 갱신합니다.

    ▼ 동작 흐름 ▼
      - token이 없음(로그아웃 상태) → 기본 스킨 적용 후 종료
      - token이 있음(로그인 상태)   → 서버에서 유저의 활성 스킨을 가져와 적용
      - API 실패 시                  → 기본 스킨으로 폴백 처리
  */
  useEffect(() => {
    if (!token) {
      applySkinToBody('default'); // 비로그인 상태 → 기본 스킨
      return;
    }

    getActiveSkinAPI()
      .then(({ data }) => {
        applySkinToBody(data.data.skin_key); // 유저의 스킨 적용
      })
      .catch(() => {
        applySkinToBody('default');          // API 실패 시 기본 스킨으로 폴백
      });
  }, [token]); // token이 바뀔 때만 실행 (로그인·로그아웃 시점)


  // ── useEffect ② : axios 로그아웃 핸들러 등록 ────

  /*
    setLogoutHandler(logout) :
    axios 인터셉터에 logout 함수를 등록합니다.
    이후 API 응답에서 401(인증 만료·토큰 없음) 에러가 발생하면
    인터셉터가 자동으로 logout()을 호출하여 강제 로그아웃 처리합니다.

    logout을 의존성으로 지정하는 이유:
    logout 함수가 재생성되는 경우에도 최신 함수가 인터셉터에 등록되도록 보장합니다.
    (useCallback으로 메모이제이션했으므로 실제로 재생성되지 않지만, 안전을 위해 명시)
  */
  useEffect(() => {
    setLogoutHandler(logout);
  }, [logout]); // logout 함수가 바뀔 때만 재등록


  // ── Context 값 공급 ──────────────────────────────

  /*
    AuthContext.Provider : value로 전달한 객체를 하위 모든 컴포넌트에서
    useAuth() 훅을 통해 접근할 수 있게 합니다.
  */
  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};


// ────────────────────────────────────────────────
// 🪝 useAuth 커스텀 훅 (Context 접근용)
// ────────────────────────────────────────────────

/*
  useAuth란?
  AuthContext의 값을 편리하게 읽어오는 커스텀 훅입니다.
  useContext(AuthContext)를 직접 쓰는 대신 이 훅을 사용하면
  Provider 범위 외부에서 실수로 사용하는 경우를 조기에 감지할 수 있습니다.

  ▼ 사용 예시 ▼
    const { user, login, logout } = useAuth();

  @throws {Error} AuthProvider 외부에서 호출 시 오류를 발생시킵니다.
  @returns {{ token, user, login, logout }} Context에서 제공하는 인증 상태와 함수
*/
export const useAuth = () => {
  const ctx = useContext(AuthContext);

  // ctx가 null이면 AuthProvider 외부에서 호출된 것이므로 즉시 오류를 발생시킵니다.
  if (!ctx) throw new Error('useAuth 는 AuthProvider 내부에서만 사용 가능합니다.');

  return ctx;
};
