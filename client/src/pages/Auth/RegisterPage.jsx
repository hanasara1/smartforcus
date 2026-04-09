// client/src/pages/Auth/RegisterPage.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerAPI } from '../../api/auth.api';
import './Auth.css';


const RegisterPage = () => {
  const navigate = useNavigate();

  // ✅ 모든 useState는 여기 최상단에!

  const [form, setForm] = useState({ email: '', pwd: '', pwdConfirm: '', nick: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const onSubmit = async e => {
    e.preventDefault();
    setError('');
    if (form.pwd !== form.pwdConfirm) return setError('비밀번호가 일치하지 않습니다.');
    if (form.pwd.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.');

    setLoading(true);
    try {
      const { data } = await registerAPI({ email: form.email, pwd: form.pwd, nick: form.nick });
      setSuccess(data.message); // ✅ alert 대신 success 상태에 저장
      setTimeout(() => navigate('/login'), 2000); // ✅ 2초 후 자동 이동
    } catch (err) {
      setError(err.response?.data?.message || '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <span className="auth-brand__logo">🧠</span>
        <h1 className="auth-brand__title">고민중독</h1>
        <p className="auth-brand__sub">지금 가입하고<br />웰컴 포인트 30P를 받아보세요!</p>
        <ul className="auth-brand__features">
          <li>🎁 가입 즉시 웰컴 포인트 30P</li>
          <li>📅 매일 출석 포인트 10P</li>
          <li>⭐ 집중 점수로 포인트 적립</li>
          <li>🏅 다양한 뱃지 수집</li>
        </ul>
      </div>

      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card__header">
            <h2>회원가입 ✨</h2>
            <p>고민중독과 함께 집중력을 키워보세요</p>
          </div>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {error && <p className="auth-error">{error}</p>}
            {success && <p className="auth-success">🎉 {success}</p>}

            <div className="form-group">
              <label htmlFor="nick">닉네임</label>
              <input id="nick" type="text" name="nick"
                placeholder="2~12자, 한글/영문/숫자"
                maxLength={12}
                value={form.nick} onChange={onChange} required />
              <small style={{ color: 'var(--color-text-muted)', fontSize: '.75rem' }}>
                2~12자, 한글·영문·숫자만 사용 가능합니다
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="email">이메일</label>
              <input id="email" type="email" name="email"
                placeholder="example@email.com"
                value={form.email} onChange={onChange} required />
            </div>

            <div className="form-group">
              <label htmlFor="pwd">비밀번호 <small>(8자 이상)</small></label>
              <input id="pwd" type="password" name="pwd"
                placeholder="비밀번호 (8자 이상)"
                value={form.pwd} onChange={onChange} required />
            </div>

            <div className="form-group">
              <label htmlFor="pwdConfirm">비밀번호 확인</label>
              <input id="pwdConfirm" type="password" name="pwdConfirm"
                placeholder="비밀번호를 다시 입력하세요"
                value={form.pwdConfirm} onChange={onChange} required />
            </div>

            <button
              className="btn btn--primary btn--full btn--lg"
              type="submit"
              disabled={loading}
              style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading
                ? <span>⏳ {/* 로그인 또는 가입 */} 처리 중...</span>
                : '로그인' // or '회원가입'
              }
            </button>
          </form>

          <p className="auth-footer">
            이미 계정이 있으신가요? <Link to="/login">로그인 하기</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
