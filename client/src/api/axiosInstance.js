// ─────────────────────────────────────────────────────────
// 📦 src/api/axiosInstance.js  ─  Axios 공통 인스턴스
// ─────────────────────────────────────────────────────────
// 모든 API 요청에서 공통으로 사용하는 axios 인스턴스를 생성하고
// 요청/응답에 공통 처리 로직(토큰 자동 첨부, 인증 만료 처리)을 등록합니다.
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  axios란?
  브라우저에서 서버로 HTTP 요청(GET, POST 등)을 보낼 때 사용하는 라이브러리입니다.
  fetch()보다 설정이 간편하고, 인터셉터(요청/응답 가로채기) 기능을 제공합니다.
*/
import axios from 'axios';


// ────────────────────────────────────────────────
// 🔌 로그아웃 함수 외부 주입 (Setter 패턴)
// ────────────────────────────────────────────────

/*
  왜 이 방식을 쓰나요? (의존성 주입 문제)

  axiosInstance는 앱 최상단에서 생성되는 모듈입니다.
  그런데 logout() 함수는 React의 AuthContext 안에 존재하기 때문에,
  axiosInstance가 직접 import하면 순환 참조(A→B→A) 문제가 발생합니다.

  이를 해결하기 위해 Setter 패턴을 사용합니다.
    1. 처음에는 _logoutFn을 null로 비워둡니다.
    2. AuthContext가 준비되면 setLogoutHandler(logout)을 호출하여 함수를 주입합니다.
    3. 이후 401 오류 발생 시 주입된 _logoutFn을 호출합니다.
*/

// 외부에서 주입받을 로그아웃 함수를 담아두는 변수 (초기값: null)
let _logoutFn = null;

// AuthContext 등 외부에서 logout 함수를 이 모듈에 등록할 때 호출합니다
export const setLogoutHandler = (fn) => { _logoutFn = fn; };


// ────────────────────────────────────────────────
// ⚙️ Axios 인스턴스 생성
// ────────────────────────────────────────────────

/*
  axios.create(설정 객체) : 공통 설정이 적용된 커스텀 axios 인스턴스를 만듭니다.
  이 인스턴스를 사용하면 모든 요청에 아래 설정이 자동으로 적용됩니다.

  ▼ 설정 항목 설명 ▼

  - baseURL : 모든 요청 URL의 앞에 자동으로 붙는 기본 주소입니다.
              환경변수(REACT_APP_API_URL)가 있으면 그 값을 사용하고,
              없으면 로컬 개발 서버 주소(localhost:5000)를 기본값으로 사용합니다.
              예) axiosInstance.get('/user') → 'http://localhost:5000/api/user'

  - timeout : 서버 응답을 기다리는 최대 시간(ms)입니다.
              10000ms = 10초 안에 응답이 없으면 요청을 자동으로 취소합니다.
              (무한 대기 방지)

  - headers : 모든 요청에 기본으로 포함되는 HTTP 헤더입니다.
              'Content-Type: application/json'은 요청 본문이
              JSON 형식임을 서버에 알려줍니다.
*/
const axiosInstance = axios.create({
  baseURL : process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout : 10000,
  headers : { 'Content-Type': 'application/json' },
});


// ────────────────────────────────────────────────
// 📤 요청 인터셉터 (Request Interceptor)
// ────────────────────────────────────────────────

/*
  인터셉터(Interceptor)란?
  요청이 서버로 떠나기 전, 또는 응답이 도착한 직후에
  자동으로 실행되는 가로채기 함수입니다.

  ▼ 요청 인터셉터가 하는 일 ▼

  모든 API 요청이 서버로 전송되기 직전에 실행됩니다.
  localStorage에 저장된 JWT 토큰을 꺼내어
  요청 헤더의 Authorization에 자동으로 첨부합니다.

  Authorization 헤더 형식 : 'Bearer {토큰값}'
    - 'Bearer'는 토큰 기반 인증 방식을 나타내는 표준 접두어입니다.
    - 서버는 이 헤더를 읽어 요청을 보낸 유저가 누구인지 확인합니다.

  토큰이 없으면 (비로그인 상태) 헤더를 추가하지 않고 그대로 전송합니다.
*/
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token'); // 저장된 JWT 토큰 조회
  if (token) config.headers['Authorization'] = `Bearer ${token}`; // 토큰이 있을 때만 헤더에 첨부
  return config; // 수정된 설정 객체를 반환해야 요청이 정상적으로 진행됩니다
});


// ────────────────────────────────────────────────
// 📥 응답 인터셉터 (Response Interceptor)
// ────────────────────────────────────────────────

/*
  ▼ 응답 인터셉터가 하는 일 ▼

  서버로부터 응답이 도착했을 때 자동으로 실행됩니다.
  두 번째 콜백 함수(error 처리)에서 HTTP 상태 코드를 확인하여
  401 오류 발생 시 자동으로 로그아웃 처리를 수행합니다.

  ▼ 401 Unauthorized란? ▼
    - 토큰이 만료되었거나, 유효하지 않은 토큰으로 요청했을 때 서버가 반환하는 상태 코드입니다.
    - 이 경우 현재 로그인 상태를 유지할 수 없으므로 강제 로그아웃 처리가 필요합니다.

  ▼ 401 처리 흐름 ▼
    1. _logoutFn이 주입되어 있으면 → AuthContext의 logout()을 호출합니다.
       (Redux/Context 상태 초기화까지 함께 처리)
    2. _logoutFn이 없으면 (주입 전 상태) → localStorage에서 직접 토큰을 삭제합니다.
       (최소한의 보안 처리)
    3. 두 경우 모두 로그인 페이지로 강제 이동합니다.

  ▼ error.response?.status ▼
    - '?.' 는 옵셔널 체이닝(Optional Chaining)입니다.
    - 네트워크 오류 등으로 error.response 자체가 없는 경우
      TypeError 없이 안전하게 undefined를 반환합니다.

  정상 응답(2xx)은 첫 번째 콜백 (response) => response 에서
  별도 처리 없이 그대로 반환합니다.

  Promise.reject(error) : 오류를 그대로 호출부로 전달하여
  각 API 함수의 catch 블록에서도 오류를 처리할 수 있게 합니다.
*/
axiosInstance.interceptors.response.use(
  // ── 정상 응답 처리 ───────────────────────────
  (response) => response, // 성공 응답은 그대로 반환합니다

  // ── 오류 응답 처리 ───────────────────────────
  (error) => {
    if (error.response?.status === 401) { // 인증 만료 또는 토큰 무효 상태
      if (_logoutFn) {
        _logoutFn(); // AuthContext의 logout() 호출 → 전역 상태 초기화
      } else {
        // logout 함수가 아직 주입되지 않은 경우 → 스토리지만 직접 비웁니다
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      window.location.href = '/login'; // 로그인 페이지로 강제 이동
    }
    return Promise.reject(error); // 401 외 오류는 호출부의 catch로 전달
  },
);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default axiosInstance
    - 이 파일을 import하는 모든 API 모듈에서 공통 설정이 적용된
      axiosInstance를 바로 사용할 수 있습니다.

  export const setLogoutHandler (위에서 선언 시 export)
    - AuthContext 등에서 로그아웃 함수를 이 모듈에 등록할 때 호출합니다.
      예) setLogoutHandler(logout);
*/
export default axiosInstance;
