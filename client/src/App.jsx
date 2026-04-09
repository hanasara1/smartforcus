// client/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import LoginPage    from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import HomePage     from './pages/Home/HomePage';
import CameraPage   from './pages/Camera/CameraPage';
import ReportPage   from './pages/Report/ReportPage';
import MyPage       from './pages/MyPage/MyPage';
import MainLayout   from './components/layout/MainLayout';

const PrivateRoute = ({ children }) => {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
};

const App = () => (
  // ✅ AuthProvider를 BrowserRouter 바깥으로 이동!
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<HomePage />} />
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
          <Route path="/camera"          element={<CameraPage />} />
          <Route path="/report"          element={<ReportPage />} />
          <Route path="/report/:imm_idx" element={<ReportPage />} />
          <Route path="/mypage"          element={<MyPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
