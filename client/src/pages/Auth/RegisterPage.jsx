// client/src/pages/Auth/RegisterPage.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React    : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
// useState : 폼 입력값, 에러·성공 메시지, 로딩 상태 등을 관리하는 훅
import React, { useState } from 'react';

// Link        : 페이지 이동 없이 클라이언트 사이드 라우팅을 제공하는 컴포넌트
//               예: '로그인 하기' 링크 → /login 페이지로 이동
// useNavigate : 회원가입 성공 후 /login 페이지로 강제 이동시키는 훅
import { Link, useNavigate } from 'react-router-dom';

// registerAPI : 이메일·비밀번호·닉네임을 서버로 전송하여 회원가입을 처리하는 API 함수
import { registerAPI } from '../../api/auth.api';

// Auth.css : 로그인·회원가입 페이지 공통 레이아웃 스타일
import './Auth.css';


// ────────────────────────────────────────────────
// 📝 RegisterPage 컴포넌트
// ────────────────────────────────────────────────

/*
  RegisterPage란?
  닉네임·이메일·비밀번호를 입력받아 회원가입을 처리하는 페이지 컴포넌트입니다.
  좌측의 브랜드 소개 패널과 우측의 회원가입 폼 패널로 구성됩니다.

  ▼ 회원가입 성공 흐름 ▼
    1. 클라이언트 유효성 검사 (비밀번호 일치 여부, 최소 길이)
    2. registerAPI 호출 → 서버에서 회원 생성 처리
    3. 성공 메시지를 2초 노출 후 /login 페이지로 자동 이동합니다.

  ▼ 클라이언트 유효성 검사 항목 ▼
    - 비밀번호 === 비밀번호 확인 : 불일치 시 에러 메시지 표시
    - 비밀번호 8자 이상          : 미달 시 에러 메시지 표시

  ▼ 상태(state) 목록 ▼
    - form    : 닉네임·이메일·비밀번호·비밀번호 확인 입력값 객체
    - error   : 유효성 검사 실패 또는 API 오류 시 표시할 에러 메시지
    - success : 회원가입 성공 시 표시할 축하 메시지
    - loading : API 호출 중 여부 (중복 제출 방지 및 버튼 비활성화용)
*/
const RegisterPage = () => {
  const navigate = useNavigate();

  // ── 상태 초기화 ──────────────────────────────

  /*
    ⚠️ React 규칙 : 모든 훅(useState 등)은 컴포넌트 최상단에서만 호출해야 합니다.
    조건문·반복문·중첩 함수 안에서 호출하면 훅 순서가 달라져 버그가 발생합니다.
  */

  // 폼 입력값 : 4개 필드를 하나의 객체로 통합 관리합니다.
  const [form, setForm]       = useState({ email: '', pwd: '', pwdConfirm: '', nick: '' });

  // 에러 메시지 : 유효성 검사 실패 또는 API 오류 시 화면에 표시합니다. (빈 문자열이면 숨김)
  const [error, setError]     = useState('');

  // 성공 메시지 : 회원가입 성공 시 서버 응답 메시지를 표시합니다. (빈 문자열이면 숨김)
  const [success, setSuccess] = useState('');

  // 로딩 상태 : API 요청 중 버튼을 비활성화하고 '처리 중...' 텍스트를 표시합니다.
  const [loading, setLoading] = useState(false);


  // ── 입력값 변경 핸들러 ────────────────────────

  /*
    onChange란?
    모든 input 요소가 공유하는 단일 변경 핸들러입니다.
    e.target.name(input의 name 속성)을 키로 사용하여
    해당 필드의 값만 선택적으로 업데이트합니다.

    [e.target.name]: e.target.value
      → 계산된 프로퍼티명(Computed Property Name) 문법입니다.
         name="nick" 이면 { nick: '입력값' }으로, name="pwd" 이면 { pwd: '입력값' }으로 업데이트됩니다.

    ...p : 기존 form 객체의 나머지 필드를 그대로 유지합니다. (스프레드 연산자)
  */
  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));


  // ── 폼 제출 핸들러 ────────────────────────────

  /*
    onSubmit이 하는 일:
      1. 브라우저 기본 폼 제출(페이지 새로고침)을 막습니다.
      2. 이전 에러 메시지를 초기화합니다.
      3. 클라이언트 유효성 검사를 수행합니다.
         → 실패 시 에러 메시지를 표시하고 즉시 종료합니다. (서버 요청 생략)
      4. registerAPI로 서버에 회원가입을 요청합니다.
      5. 성공 시 성공 메시지를 표시하고 2초 후 /login으로 이동합니다.
      6. 실패 시 서버 에러 메시지를 화면에 표시합니다.
      7. 성공·실패 모두 loading 상태를 false로 복원합니다. (finally)
  */
  const onSubmit = async e => {
    e.preventDefault(); // 브라우저 기본 폼 제출 방지
    setError('');        // 이전 에러 메시지 초기화


    // ── 클라이언트 유효성 검사 ───────────────────

    // 비밀번호와 비밀번호 확인이 일치하지 않으면 즉시 에러 표시 후 종료
    if (form.pwd !== form.pwdConfirm) return setError('비밀번호가 일치하지 않습니다.');

    // 비밀번호가 8자 미만이면 즉시 에러 표시 후 종료
    if (form.pwd.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.');

    setLoading(true); // 버튼 비활성화 시작

    try {
      // 서버에 닉네임·이메일·비밀번호를 전송하여 회원가입을 요청합니다.
      // (pwdConfirm은 클라이언트 검증용이므로 서버에 전송하지 않습니다.)
      const { data } = await registerAPI({ email: form.email, pwd: form.pwd, nick: form.nick });

      // alert() 대신 success 상태에 저장하여 UI 내에서 부드럽게 표시합니다.
      setSuccess(data.message);

      // 2초 후 로그인 페이지로 자동 이동하여 사용자가 성공 메시지를 확인할 시간을 줍니다.
      setTimeout(() => navigate('/login'), 2000);

    } catch (err) {
      /*
        err.response?.data?.message : 서버가 반환한 에러 메시지를 우선 표시합니다.
        서버 응답이 없거나 메시지가 없는 경우 기본 메시지로 폴백합니다.
      */
      setError(err.response?.data?.message || '회원가입에 실패했습니다.');

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
          지금 가입하고<br />
          웰컴 포인트 30P를 받아보세요!
        </p>

        {/* 회원 혜택 목록 */}
        <ul className="auth-brand__features">
          <li>🎁 가입 즉시 웰컴 포인트 30P</li>
          <li>📅 매일 출석 포인트 10P</li>
          <li>⭐ 집중 점수로 포인트 적립</li>
          <li>🏅 다양한 뱃지 수집</li>
        </ul>
      </div>


      {/* ════════════════════════════════
          📋 오른쪽 회원가입 폼 패널
          ════════════════════════════════ */}
      <div className="auth-form-panel">
        <div className="auth-card">

          {/* 카드 헤더 : 제목 + 안내 문구 */}
          <div className="auth-card__header">
            <h2>회원가입 ✨</h2>
            <p>고민중독과 함께 집중력을 키워보세요</p>
          </div>

          {/*
            noValidate : 브라우저 기본 유효성 검사 UI를 비활성화합니다.
                         커스텀 에러 메시지(auth-error)로 대체하여 일관된 UI를 유지합니다.
          */}
          <form className="auth-form" onSubmit={onSubmit} noValidate>

            {/* 에러 메시지 : error 상태가 있을 때만 렌더링 */}
            {error   && <p className="auth-error">{error}</p>}

            {/* 성공 메시지 : success 상태가 있을 때만 렌더링 */}
            {success && <p className="auth-success">🎉 {success}</p>}


            {/* 닉네임 입력 필드 */}
            <div className="form-group">
              <label htmlFor="nick">닉네임</label>
              <input
                id          ="nick"
                type        ="text"
                name        ="nick"            // onChange에서 키로 사용
                placeholder ="2~12자, 한글/영문/숫자"
                maxLength   ={12}              // 입력 가능한 최대 글자 수 제한
                value       ={form.nick}
                onChange    ={onChange}
                required
              />
              {/* 입력 조건 안내 문구 */}
              <small style={{ color: 'var(--color-text-muted)', fontSize: '.75rem' }}>
                2~12자, 한글·영문·숫자만 사용 가능합니다
              </small>
            </div>

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
              {/* <small> : 최소 길이 조건을 라벨 옆에 작게 표시합니다. */}
              <label htmlFor="pwd">비밀번호 <small>(8자 이상)</small></label>
              <input
                id          ="pwd"
                type        ="password"
                name        ="pwd"             // onChange에서 키로 사용
                placeholder ="비밀번호 (8자 이상)"
                value       ={form.pwd}
                onChange    ={onChange}
                required
              />
            </div>

            {/* 비밀번호 확인 입력 필드 */}
            <div className="form-group">
              <label htmlFor="pwdConfirm">비밀번호 확인</label>
              <input
                id          ="pwdConfirm"
                type        ="password"
                name        ="pwdConfirm"      // onChange에서 키로 사용
                placeholder ="비밀번호를 다시 입력하세요"
                value       ={form.pwdConfirm}
                onChange    ={onChange}
                required
              />
            </div>

            {/*
              회원가입 제출 버튼
              disabled={loading} : API 요청 중 중복 제출을 방지합니다.
              opacity/cursor 인라인 스타일 : 로딩 중에는 버튼이 비활성화된 것처럼 보입니다.
            */}
            <button
              className ="btn btn--primary btn--full btn--lg"
              type      ="submit"
              disabled  ={loading}
              style     ={{
                opacity : loading ? 0.7 : 1,                  // 로딩 중 흐리게
                cursor  : loading ? 'not-allowed' : 'pointer', // 로딩 중 금지 커서
              }}
            >
              {loading
                ? <span>⏳ 처리 중...</span> // 로딩 중 텍스트
                : '회원가입'                 // 기본 텍스트
              }
            </button>

          </form>

          {/* 로그인 페이지 이동 링크 */}
          <p className="auth-footer">
            이미 계정이 있으신가요? <Link to="/login">로그인 하기</Link>
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
    import RegisterPage from '@/pages/Auth/RegisterPage';
    <Route path="/register" element={<RegisterPage />} />
*/
export default RegisterPage;
