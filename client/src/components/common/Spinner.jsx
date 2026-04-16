// client/src/components/common/Spinner.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
import React from 'react';

// Spinner.css : 회전 애니메이션 및 레이아웃 스타일이 정의된 CSS 파일
import './Spinner.css';


// ────────────────────────────────────────────────
// ⏳ Spinner 컴포넌트 (로딩 상태를 시각적으로 표시)
// ────────────────────────────────────────────────

/*
  Spinner란?
  데이터를 불러오거나 처리가 진행 중일 때 사용자에게 대기 중임을 알려주는
  로딩 인디케이터 컴포넌트입니다.
  크기(size)와 안내 문구(text)를 자유롭게 지정할 수 있습니다.

  ▼ Props(속성) ▼
    @param {string} size - 스피너 크기 변형 ('sm' / 'lg' 등 CSS에 정의된 modifier)
                           기본값: '' (기본 크기 사용)
    @param {string} text - 스피너 옆에 표시할 안내 문구
                           기본값: '불러오는 중...'
                           빈 문자열('') 전달 시 문구를 숨길 수 있습니다.

  ▼ CSS 클래스 규칙 (BEM 방식) ▼
    - spinner-wrap       : 스피너와 텍스트를 가로로 나란히 배치하는 래퍼
    - spinner            : 기본 스피너 원형 애니메이션 요소
    - spinner--{size}    : size prop이 있을 때만 추가되는 크기 변형 클래스
                           예: size="sm" → 'spinner spinner--sm'
                               size=""   → 'spinner' (변형 클래스 없음)
*/
const Spinner = ({ size = '', text = '불러오는 중...' }) => (

  // 스피너 + 텍스트를 감싸는 컨테이너
  <div className="spinner-wrap">

    {/* 회전 애니메이션 원형 요소 : size가 있을 때만 크기 변형 클래스를 추가 */}
    <div className={`spinner ${size ? `spinner--${size}` : ''}`} />

    {/*
      안내 문구 영역
      text가 빈 문자열이거나 falsy한 값이면 렌더링하지 않습니다. (조건부 렌더링)
      marginLeft로 스피너와 텍스트 사이에 간격을 줍니다.
    */}
    {text && (
      <span style={{
        marginLeft : 12,                        // 스피너와의 좌측 간격 (px)
        color      : 'var(--color-text-muted)', // 흐린 텍스트 색상 (보조 정보임을 표현)
        fontSize   : '.9rem',                   // 본문보다 약간 작은 폰트 크기
      }}>
        {text}
      </span>
    )}

  </div>
);


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default : 이 컴포넌트를 다른 파일에서 import하여 사용할 수 있게 합니다.
  사용 예시:
    import Spinner from '@/components/common/Spinner';
    <Spinner />                          → 기본 크기, '불러오는 중...' 문구
    <Spinner size="sm" />                → 소형 스피너
    <Spinner size="lg" text="저장 중" /> → 대형 스피너 + 커스텀 문구
    <Spinner text="" />                  → 문구 없이 스피너만 표시
*/
export default Spinner;
