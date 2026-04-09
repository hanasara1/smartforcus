// ─────────────────────────────────────────────────────────
// src/context/AuthContext.jsx
// ─────────────────────────────────────────────────────────
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getActiveSkinAPI } from '../api/skin.api';
import { setLogoutHandler } from '../api/axiosInstance';

const AuthContext = createContext(null);

export const applySkinToBody = (skinKey) => {
  document.body.setAttribute('data-skin', skinKey || 'default');
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
  });

  // ✅ login, logout을 useEffect보다 먼저 선언
  const login = useCallback((newToken, userInfo) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userInfo));
    setToken(newToken);
    setUser(userInfo);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    applySkinToBody('default');
  }, []);

  // ✅ useEffect 1번 - 스킨 로드 (login, logout 선언 이후에 위치)
  useEffect(() => {
    if (!token) {
      applySkinToBody('default');
      return;
    }
    getActiveSkinAPI()
      .then(({ data }) => {
        applySkinToBody(data.data.skin_key);
      })
      .catch(() => {
        applySkinToBody('default');
      });
  }, [token]);

  // ✅ useEffect 2번 - logout 핸들러 등록 (logout 선언 이후에 위치)
  useEffect(() => {
    setLogoutHandler(logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 내부에서만 사용 가능합니다.');
  return ctx;
};
