// client/src/components/common/ScoreRing.jsx
// 집중 점수를 원형 게이지로 표시
import React from 'react';

const ScoreRing = ({ score = 0, size = 120 }) => {
  const r     = (size - 16) / 2;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * (score / 100);

  const color =
    score >= 80 ? 'var(--color-success)' :
    score >= 50 ? 'var(--color-primary)' :
                  'var(--color-error)';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="var(--color-border)" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray .8s ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        fill={color} fontSize={size * 0.22} fontWeight="700">
        {score}
      </text>
      <text x="50%" y="65%" dominantBaseline="middle" textAnchor="middle"
        fill="var(--color-text-muted)" fontSize={size * 0.12}>
        점
      </text>
    </svg>
  );
};

export default ScoreRing;
