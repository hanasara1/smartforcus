// ─────────────────────────────────────────────────────────
// src/api/axiosInstance.js  ─  Axios 공통 인스턴스
// ─────────────────────────────────────────────────────────
import axios from 'axios';

// ✅ logout 함수를 외부에서 주입받을 수 있도록 setter 패턴 사용
let _logoutFn = null;
export const setLogoutHandler = (fn) => { _logoutFn = fn; };

const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── 요청 인터셉터: localStorage 토큰 자동 첨부
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// ── 응답 인터셉터: 401 → 로그인 페이지 리다이렉트
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (_logoutFn) {
        _logoutFn(); // ✅ AuthContext의 logout() 호출
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default axiosInstance;
