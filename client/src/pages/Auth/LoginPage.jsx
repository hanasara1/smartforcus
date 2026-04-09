// client/src/pages/Auth/LoginPage.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginAPI } from '../../api/auth.api';
import { useAuth } from '../../context/AuthContext';
import './Auth.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', pwd: '' });
  const [error, setError] = useState('');
  const [dailyMsg, setDailyMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  // client/src/pages/Auth/LoginPage.jsx 수정
  const onSubmit = async e => {
    e.preventDefault();
    setError(''); setDailyMsg('');
    setLoading(true);
    try {
      const { data } = await loginAPI(form);
      login(data.data.token, data.data.user);

      // ✅ earned_points 배열에서 총 포인트 합산
      const totalDailyPoint = (data.data.earned_points ?? [])
        .reduce((sum, p) => sum + p.point, 0);

      if (data.data.daily_checked && totalDailyPoint > 0) {
        setDailyMsg(
          `🔥 ${data.data.daily_streak}일 연속 출석! 출석 포인트 +${totalDailyPoint}P 지급!`
        );
        setTimeout(() => navigate('/camera'), 1500);
      } else {
        navigate('/camera');
      }
    } catch (err) {
      setError(err.response?.data?.message || '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="auth-page">
      {/* 왼쪽 브랜드 패널 */}
      <div className="auth-brand">
        <span className="auth-brand__logo">🧠</span>
        <h1 className="auth-brand__title">고민중독</h1>
        <p className="auth-brand__sub">MediaPipe 기반 실시간 자세 분석으로<br />당신의 집중력을 극대화하세요</p>
        <ul className="auth-brand__features">
          <li>📷 실시간 자세 분석 및 교정</li>
          <li>🔊 소음 환경 자동 감지</li>
          <li>📊 집중 리포트 & 타임랩스</li>
          <li>🏅 포인트 & 뱃지 시스템</li>
        </ul>
      </div>

      {/* 오른쪽 폼 패널 */}
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card__header">
            <h2>다시 만나요 👋</h2>
            <p>계정에 로그인하고 집중 세션을 시작하세요</p>
          </div>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {error && <p className="auth-error">{error}</p>}
            {dailyMsg && <p className="auth-success">🎉 {dailyMsg}</p>}

            <div className="form-group">
              <label htmlFor="email">이메일</label>
              <input id="email" type="email" name="email"
                placeholder="example@email.com"
                value={form.email} onChange={onChange} required />
            </div>

            <div className="form-group">
              <label htmlFor="pwd">비밀번호</label>
              <input id="pwd" type="password" name="pwd"
                placeholder="비밀번호를 입력하세요"
                value={form.pwd} onChange={onChange} required />
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
            계정이 없으신가요? <Link to="/register">회원가입 하기</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
