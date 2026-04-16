// ─────────────────────────────────────────────────────────
// 📦 src/api/auth.api.js
// ─────────────────────────────────────────────────────────
// 인증(Authentication) 관련 API 요청 함수 모음
// 로그인 / 회원가입 요청을 서버로 전달하는 역할을 합니다.
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  axiosInstance란?
  axios는 서버에 HTTP 요청(GET, POST 등)을 보내는 라이브러리입니다.
  axiosInstance는 기본 URL, 공통 헤더(토큰 등) 설정이 미리 적용된
  커스텀 axios 객체로, 매 요청마다 반복 설정을 하지 않아도 됩니다.
*/
import axiosInstance from './axiosInstance';


// ────────────────────────────────────────────────
// 🔐 인증 API 함수 정의
// ────────────────────────────────────────────────

/*
  ▼ 공통 구조 설명 ▼

  (data) => axiosInstance.post(엔드포인트, data) 형태로 작성됩니다.
    - data     : 서버로 전달할 요청 본문(body) 객체입니다.
    - post     : 서버에 데이터를 '생성/전달'할 때 사용하는 HTTP 메서드입니다.
    - 반환값   : axios가 Promise를 반환하므로, 호출부에서 await 또는
                 .then()으로 응답을 받아야 합니다.

  ▼ 엔드포인트 설명 ▼
    - '/auth/login'    : 로그인 처리 엔드포인트
    - '/auth/register' : 회원가입 처리 엔드포인트
*/

// 로그인 API 요청 함수
// data 예시 : { email: 'user@example.com', password: '1234' }
export const loginAPI    = (data) => axiosInstance.post('/auth/login', data);

// 회원가입 API 요청 함수
// data 예시 : { email: 'user@example.com', password: '1234', nick: '닉네임' }
export const registerAPI = (data) => axiosInstance.post('/auth/register', data);
