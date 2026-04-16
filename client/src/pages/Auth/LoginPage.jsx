// client/src/pages/Auth/LoginPage.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React    : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
// useState : 폼 입력값, 에러 메시지, 로딩 상태 등을 관리하는 훅
import React, { useState } from 'react';

// Link        : 페이지 이동 없이 클라이언트 사이드 라우팅을 제공하는 컴포넌트
//               예: '회원가입 하기' 링크 → /register 페이지로 이동
// useNavigate : 로그인 성공 후 /camera 페이지로 강제 이동시키는 훅
import { Link, useNavigate } from 'react-router-dom';

// loginAPI : 이메일·비밀번호를 서버로 전송하여 JWT 토큰을 받아오는 API 함수
import { loginAPI } from '../../api/auth.api';

// useAuth : AuthContext에서 login 함수를 가져오는 커스텀 훅
//           로그인 성공 시 토큰과 유저 정보를 전역 상태 및 localStorage에 저장합니다.
import { useAuth } from '../../context/AuthContext';

// Auth.css : 로그인·회원가입 페이지 공통 레이아웃 스타일
import './Auth.css';


// ────────────────────────────────────────────────
// 🔑 LoginPage 컴포넌트
// ────────────────────────────────────────────────

/*
  LoginPage란?
  이메일과 비밀번호를 입력받아 로그인을 처리하는 페이지 컴포넌트입니다.
  좌측의 브랜드 소개 패널과 우측의 로그인 폼 패널로 구성됩니다.

  ▼ 로그인 성공 흐름 ▼
    1. loginAPI 호출 → 서버로부터 token, user, 출석 정보 수신
    2. login() 호출  → 전역 상태 및 localStorage에 인증 정보 저장
    3-a. 오늘 첫 출석이고 포인트가 있는 경우:
         출석 메시지를 1.5초 노출 후 /camera로 이동합니다.
    3-b. 그 외:
         즉시 /camera로 이동합니다.

  ▼ 상태(state) 목록 ▼
    - form      : 이메일·비밀번호 입력값 객체 { email, pwd }
    - error     : 로그인 실패 시 표시할 에러 메시지
    - dailyMsg  : 출석 체크 성공 시 표시할 축하 메시지
    - loading   : API 호출 중 여부 (중복 제출 방지 및 버튼 비활성화용)
*/
const LoginPage = () => {
  const navigate    = useNavigate();
  const { login }   = useAuth();

  // 폼 입력값 : email과 pwd를 하나의 객체로 관리합니다.
  const [form, setForm]         = useState({ email: '', pwd: '' });

  // 로그인 실패 시 표시할 에러 메시지 (빈 문자열이면 숨김)
  const [error, setError]       = useState('');

  // 출석 체크 성공 시 표시할 안내 메시지 (빈 문자열이면 숨김)
  const [dailyMsg, setDailyMsg] = useState('');

  // API 요청 중 여부 (true이면 버튼 비활성화 및 '처리 중...' 표시)
  const [loading, setLoading]   = useState(false);


  // ── 입력값 변경 핸들러 ────────────────────────

  /*
    onChange란?
    모든 input 요소가 공유하는 단일 변경 핸들러입니다.
    e.target.name(input의 name 속성)을 키로 사용하여
    해당 필드의 값만 선택적으로 업데이트합니다.

    [e.target.name]: e.target.value
      → 계산된 프로퍼티명(Computed Property Name) 문법입니다.
         name="email" 이면 { email: '입력값' } 으로, name="pwd" 이면 { pwd: '입력값' }으로 업데이트됩니다.

    ...p : 기존 form 객체의 나머지 필드를 그대로 유지합니다. (스프레드 연산자)
  */
  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));


  // ── 폼 제출 핸들러 ────────────────────────────

  /*
    onSubmit이 하는 일:
      1. 브라우저 기본 폼 제출(페이지 새로고침)을 막습니다.
      2. 이전 에러·출석 메시지를 초기화합니다.
      3. loginAPI로 서버에 인증 요청을 보냅니다.
      4. 성공 시 전역 로그인 상태를 저장하고 페이지를 이동합니다.
      5. 실패 시 서버 에러 메시지를 화면에 표시합니다.
      6. 성공·실패 모두 loading 상태를 false로 복원합니다. (finally)
  */
  const onSubmit = async e => {
    e.preventDefault();             // 브라우저 기본 폼 제출 방지
    setError('');                   // 이전 에러 메시지 초기화
    setDailyMsg('');                // 이전 출석 메시지 초기화
    setLoading(true);               // 버튼 비활성화 시작

    try {
      const { data } = await loginAPI(form); // 서버에 로그인 요청

      // 전역 상태(AuthContext)와 localStorage에 인증 정보를 저장합니다.
      login(data.data.token, data.data.user);


      // ── 출석 포인트 합산 ────────────────────────

      /*
        earned_points : 오늘 출석으로 지급된 포인트 목록 배열입니다.
        ?? [] : earned_points가 null·undefined인 경우 빈 배열로 폴백합니다.
        reduce : 배열의 모든 포인트를 합산합니다.
                 예: [{ point: 50 }, { point: 30 }] → 80
      */
      const totalDailyPoint = (data.data.earned_points ?? [])
        .reduce((sum, p) => sum + p.point, 0);


      // ── 출석 메시지 표시 또는 즉시 이동 ─────────

      /*
        daily_checked : 오늘 처음 로그인(출석 체크)인지 여부 (boolean)
        totalDailyPoint > 0 : 지급된 포인트가 실제로 있는 경우에만 메시지 표시

        두 조건을 모두 만족할 때:
          축하 메시지를 1.5초 노출 후 /camera로 이동합니다.
          → 사용자가 메시지를 확인할 시간을 줍니다.
        그 외:
          즉시 /camera로 이동합니다.
      */
      if (data.data.daily_checked && totalDailyPoint > 0) {
        setDailyMsg(
          `🔥 ${data.data.daily_streak}일 연속 출석! 출석 포인트 +${totalDailyPoint}P 지급!`
        );
        setTimeout(() => navigate('/camera'), 1500); // 1.5초 후 이동
      } else {
        navigate('/camera'); // 즉시 이동
      }

    } catch (err) {
      /*
        err.response?.data?.message : 서버가 반환한 에러 메시지를 우선 표시합니다.
        서버 응답이 없거나 메시지가 없는 경우 기본 메시지로 폴백합니다.
      */
      setError(err.response?.data?.message || '로그인에 실패했습니다.');

    } finally {
      // 성공·실패 여부와 관계없이 항상 로딩 상태를 해제합니다.
      setLoading(false);
    }
  };


  // ── JSX 렌더링 ───────────────────────────────

  return (
    <div className="auth-page">

      {/* ════════════════════════════════
          🧠 왼쪽 브랜드 소개 패널
          ════════════════════════════════ */}
      <div className="auth-brand">
        <span className="auth-brand__logo">🧠</span>
        <h1 className="auth-brand__title">고민중독</h1>
        <p className="auth-brand__sub">
          MediaPipe 기반 실시간 자세 분석으로<br />
          당신의 집중력을 극대화하세요
        </p>

        {/* 주요 기능 목록 */}
        <ul className="auth-brand__features">
          <li>📷 실시간 자세 분석 및 교정</li>
          <li>🔊 소음 환경 자동 감지</li>
          <li>📊 집중 리포트 &amp; 타임랩스</li>
          <li>🏅 포인트 &amp; 뱃지 시스템</li>
        </ul>
      </div>


      {/* ════════════════════════════════
          📋 오른쪽 로그인 폼 패널
          ════════════════════════════════ */}
      <div className="auth-form-panel">
        <div className="auth-card">

          {/* 카드 헤더 : 제목 + 안내 문구 */}
          <div className="auth-card__header">
            <h2>다시 만나요 👋</h2>
            <p>계정에 로그인하고 집중 세션을 시작하세요</p>
          </div>

          {/*
            noValidate : 브라우저 기본 유효성 검사 UI를 비활성화합니다.
                         커스텀 에러 메시지(auth-error)로 대체하여 일관된 UI를 유지합니다.
          */}
          <form className="auth-form" onSubmit={onSubmit} noValidate>

            {/* 에러 메시지 : error 상태가 있을 때만 렌더링 */}
            {error    && <p className="auth-error">{error}</p>}

            {/* 출석 메시지 : dailyMsg 상태가 있을 때만 렌더링 */}
            {dailyMsg && <p className="auth-success">🎉 {dailyMsg}</p>}

            {/* 이메일 입력 필드 */}
            <div className="form-group">
              <label htmlFor="email">이메일</label>
              <input
                id          ="email"
                type        ="email"
                name        ="email"           // onChange에서 키로 사용
                placeholder ="example@email.com"
                value       ={form.email}
                onChange    ={onChange}
                required
              />
            </div>

            {/* 비밀번호 입력 필드 */}
            <div className="form-group">
              <label htmlFor="pwd">비밀번호</label>
              <input
                id          ="pwd"
                type        ="password"
                name        ="pwd"             // onChange에서 키로 사용
                placeholder ="비밀번호를 입력하세요"
                value       ={form.pwd}
                onChange    ={onChange}
                required
              />
            </div>

            {/*
              로그인 제출 버튼
              disabled={loading} : API 요청 중 중복 제출을 방지합니다.
              opacity/cursor 인라인 스타일 : 로딩 중에는 버튼이 비활성화된 것처럼 보입니다.
            */}
            <button
              className ="btn btn--primary btn--full btn--lg"
              type      ="submit"
              disabled  ={loading}
              style     ={{
                opacity : loading ? 0.7 : 1,             // 로딩 중 흐리게
                cursor  : loading ? 'not-allowed' : 'pointer', // 로딩 중 금지 커서
              }}
            >
              {loading
                ? <span>⏳ 처리 중...</span> // 로딩 중 텍스트
                : '로그인'                   // 기본 텍스트
              }
            </button>

          </form>

          {/* 회원가입 페이지 이동 링크 */}
          <p className="auth-footer">
            계정이 없으신가요? <Link to="/register">회원가입 하기</Link>
          </p>

        </div>
      </div>

    </div>
  );
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default : 이 컴포넌트를 다른 파일에서 import하여 사용할 수 있게 합니다.
  사용 예시 (라우터 설정):
    import LoginPage from '@/pages/Auth/LoginPage';
    <Route path="/login" element={<LoginPage />} />
*/
export default LoginPage;
