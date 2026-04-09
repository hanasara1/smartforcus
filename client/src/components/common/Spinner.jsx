// client/src/components/common/Spinner.jsx
import React from 'react';
import './Spinner.css';

const Spinner = ({ size = '', text = '불러오는 중...' }) => (
  <div className="spinner-wrap">
    <div className={`spinner ${size ? `spinner--${size}` : ''}`} />
    {text && <span style={{ marginLeft: 12, color: 'var(--color-text-muted)', fontSize: '.9rem' }}>{text}</span>}
  </div>
);

export default Spinner;
