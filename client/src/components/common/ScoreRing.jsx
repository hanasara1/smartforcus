// client/src/components/common/ScoreRing.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
import React from 'react';


// ────────────────────────────────────────────────
// 🔵 ScoreRing 컴포넌트 (집중 점수를 원형 게이지로 시각화)
// ────────────────────────────────────────────────

/*
  ScoreRing이란?
  0~100 사이의 점수를 SVG 원형 게이지(도넛 차트) 형태로 보여주는 컴포넌트입니다.
  점수에 따라 게이지의 채워진 길이와 색상이 달라집니다.

  ▼ Props(속성) ▼
    @param {number} score - 표시할 집중 점수 (0~100), 기본값: 0
    @param {number} size  - SVG의 가로/세로 크기(px),  기본값: 120

  ▼ 색상 기준 ▼
    - 80점 이상 : success 색상 (초록 계열 - 우수)
    - 50점 이상 : primary 색상 (브랜드 색상 - 보통)
    - 50점 미만 : error   색상 (빨강 계열 - 미흡)
*/
const ScoreRing = ({ score = 0, size = 120 }) => {

  // ── 원 크기 계산 ─────────────────────────────

  /*
    r (반지름) 계산 방식:
      SVG 전체 크기(size)에서 테두리(strokeWidth=8)가 양쪽으로 걸리므로
      총 16px을 뺀 뒤 절반으로 나눕니다.
      → 원이 SVG 영역을 벗어나지 않도록 안전하게 맞추기 위함입니다.
  */
  const r    = (size - 16) / 2;

  /*
    circ (원의 둘레) 계산:
      원의 둘레 공식 : 2 × π × r
      → 게이지가 꽉 찼을 때(100점)의 전체 선 길이입니다.
  */
  const circ = 2 * Math.PI * r;

  /*
    dash (게이지 채움 길이) 계산:
      전체 둘레(circ)에서 점수 비율(score / 100)만큼만 선을 그립니다.
      예: score=75 이면 전체 둘레의 75%만 색이 채워집니다.
  */
  const dash = circ * (score / 100);


  // ── 점수 구간별 색상 결정 ────────────────────

  /*
    CSS 변수(var(--color-...))를 사용하여 테마 색상을 적용합니다.
    삼항 연산자를 중첩하여 3단계 조건 분기를 처리합니다.
  */
  const color =
    score >= 80 ? 'var(--color-success)' :  // 80점 이상 : 초록 (우수)
    score >= 50 ? 'var(--color-primary)' :  // 50점 이상 : 브랜드 색 (보통)
                  'var(--color-error)';      // 50점 미만 : 빨강 (미흡)


  // ── SVG 렌더링 ───────────────────────────────

  /*
    SVG로 원형 게이지를 구성하는 방식:
      1. 회색 배경 원   : 항상 꽉 찬 상태로 표시되는 트랙(track) 역할
      2. 색상 게이지 원 : strokeDasharray로 실제 점수만큼만 선을 그림
      3. 점수 숫자 텍스트
      4. '점' 단위 텍스트

    ▼ strokeDasharray 원리 ▼
      strokeDasharray="{dash} {circ - dash}" 형식으로 지정하면
      '채워진 길이 / 빈 길이'를 조절하여 부분적으로만 선을 그릴 수 있습니다.

    ▼ transform rotate(-90) 적용 이유 ▼
      SVG 원은 기본적으로 3시 방향(오른쪽)에서 시작됩니다.
      -90도 회전하면 12시 방향(위쪽)에서 게이지가 시작되어
      시계 방향으로 채워지는 자연스러운 형태가 됩니다.

    ▼ transition 애니메이션 ▼
      stroke-dasharray 값이 바뀔 때 0.8초 동안 부드럽게 전환됩니다.
  */
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>

      {/* 배경 트랙 원 : 게이지가 비어있는 부분을 회색으로 표시 */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="var(--color-border)"  // 테마의 테두리 색상
        strokeWidth="8"
      />

      {/* 점수 게이지 원 : 실제 점수만큼만 색상으로 채워지는 원호 */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}                              // 점수 구간에 따른 색상
        strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`}         // 채워진 길이 / 빈 길이
        strokeLinecap="round"                       // 선 끝을 둥글게 처리
        transform={`rotate(-90 ${size / 2} ${size / 2})`}  // 12시 방향에서 시작
        style={{ transition: 'stroke-dasharray .8s ease' }} // 부드러운 채움 애니메이션
      />

      {/* 점수 숫자 : 원 중앙에 크게 표시 */}
      <text
        x="50%" y="50%"
        dominantBaseline="middle" textAnchor="middle"  // 가로/세로 모두 중앙 정렬
        fill={color}                   // 점수 구간 색상과 동일하게 적용
        fontSize={size * 0.22}         // SVG 크기에 비례한 폰트 크기
        fontWeight="700"               // 굵게 표시
      >
        {score}
      </text>

      {/* '점' 단위 텍스트 : 숫자 아래에 작게 표시 */}
      <text
        x="50%" y="65%"
        dominantBaseline="middle" textAnchor="middle"
        fill="var(--color-text-muted)"  // 흐린 텍스트 색상(보조 정보임을 표현)
        fontSize={size * 0.12}          // 점수 숫자보다 작은 폰트 크기
      >
        점
      </text>

    </svg>
  );
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default : 이 컴포넌트를 다른 파일에서 import하여 사용할 수 있게 합니다.
  사용 예시:
    import ScoreRing from '@/components/common/ScoreRing';
    <ScoreRing score={87} size={140} />
*/
export default ScoreRing;
