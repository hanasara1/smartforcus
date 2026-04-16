// client/src/components/common/StreakCalendar.jsx

// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// React    : JSX 문법을 사용하기 위해 반드시 불러와야 하는 핵심 라이브러리
// useMemo  : 연산 결과를 메모이제이션(캐싱)하여 불필요한 재계산을 방지하는 훅
//            의존성 배열의 값이 바뀔 때만 다시 계산합니다.
import React, { useMemo } from 'react';

// StreakCalendar.css : 잔디 셀, 월 라벨, 범례 등의 스타일이 정의된 CSS 파일
import './StreakCalendar.css';


// ────────────────────────────────────────────────
// 🌿 StreakCalendar 컴포넌트 (GitHub 잔디 스타일 출석 캘린더)
// ────────────────────────────────────────────────

/*
  StreakCalendar란?
  GitHub의 contribution 그래프처럼 날짜별 출석 여부를 잔디(셀) 형태로
  시각화하는 컴포넌트입니다.
  오늘 기준으로 과거 N주간의 출석 기록을 열(주) × 행(요일) 그리드로 표시합니다.

  ▼ Props(속성) ▼
    @param {string[]} attendanceDates - 'YYYY-MM-DD' 형식의 출석 날짜 문자열 배열
                                        예: ['2025-03-01', '2025-03-03', ...]
    @param {number}   weeks           - 표시할 주 수, 기본값: 12 (= 84일치)

  ▼ 그리드 구조 ▼
    - 열(column) : 주(week) 단위, 왼쪽이 과거 → 오른쪽이 최근
    - 행(row)    : 요일 단위, 위가 일요일(0) → 아래가 토요일(6)

  ▼ 셀 상태 종류 ▼
    - streak-cell--attended : 출석한 날 (색상으로 강조)
    - streak-cell--today    : 오늘 날짜 (테두리 등으로 강조)
    - streak-cell--future   : 아직 오지 않은 미래 날짜 (흐리게 표시)
*/
const StreakCalendar = ({ attendanceDates = [], weeks = 12 }) => {

    // ── 출석 날짜 고속 조회용 Set 생성 ──────────

    /*
      Set이란?
      배열(Array)과 달리 중복 없이 값을 저장하는 자료구조입니다.
      has() 메서드로 특정 값의 존재 여부를 O(1) 상수 시간에 확인할 수 있어
      날짜 배열을 순회하며 includes()로 검색하는 것보다 훨씬 빠릅니다.

      useMemo 적용 이유:
        attendanceDates 배열이 바뀌지 않는 한 Set을 새로 만들지 않습니다.
    */
    const attendSet = useMemo(
        () => new Set(attendanceDates),
        [attendanceDates] // attendanceDates가 바뀔 때만 Set을 재생성
    );


    // ── 날짜 그리드 데이터 생성 ──────────────────

    /*
      grid 배열이란?
      오늘 기준으로 weeks × 7일치 날짜 정보를 담은 객체 배열입니다.
      각 셀(cell) 하나가 아래 구조의 객체로 표현됩니다.

      ▼ 각 날짜 객체의 필드 ▼
        - dateStr   : 'YYYY-MM-DD' 형식의 날짜 문자열 (셀의 고유 키로도 사용)
        - isToday   : 오늘 날짜 여부 (true/false)
        - isFuture  : 미래 날짜 여부 (true/false)
        - attended  : 출석 여부 (미래 날짜는 항상 false)
        - dayOfWeek : 요일 숫자 (0=일요일 ~ 6=토요일)
        - month     : 월 (1~12), 월 라벨 계산에 사용
        - day       : 일 (1~31)

      ▼ 기준점(endDay) 설정 이유 ▼
        이번 주 토요일을 마지막 날로 잡아야 그리드의 마지막 열이
        항상 토요일로 끝나는 정렬된 형태가 됩니다.
        today.getDay()는 현재 요일(0~6)을 반환하므로
        (6 - today.getDay())를 더하면 이번 주 토요일 날짜를 구할 수 있습니다.
    */
    const grid = useMemo(() => {
        const today = new Date();

        // 이번 주 토요일을 그리드의 마지막 날(기준점)로 설정
        const endDay = new Date(today);
        endDay.setDate(today.getDate() + (6 - today.getDay()));

        const totalDays = weeks * 7; // 전체 표시할 날짜 수
        const days = [];

        /*
          i를 totalDays-1 부터 0까지 역순으로 순회하여
          endDay에서 i일 전 날짜를 계산합니다.
          → 배열 앞쪽이 과거, 뒤쪽이 최근 날짜가 됩니다.
        */
        for (let i = totalDays - 1; i >= 0; i--) {
            const d = new Date(endDay);
            d.setDate(endDay.getDate() - i);

            // toISOString() : 'YYYY-MM-DDTHH:mm:ss.sssZ' 형식으로 변환
            // split('T')[0] : 날짜 부분('YYYY-MM-DD')만 추출
            const dateStr  = d.toISOString().split('T')[0];
            const isToday  = dateStr === today.toISOString().split('T')[0];
            const isFuture = d > today;

            days.push({
                dateStr,
                isToday,
                isFuture,
                attended  : !isFuture && attendSet.has(dateStr), // 미래는 출석 불가
                dayOfWeek : d.getDay(),      // 0(일) ~ 6(토)
                month     : d.getMonth() + 1, // getMonth()는 0부터 시작하므로 +1
                day       : d.getDate(),
            });
        }
        return days;
    }, [attendSet, weeks]); // attendSet 또는 weeks가 바뀔 때만 재계산


    // ── 월 라벨 계산 ─────────────────────────────

    /*
      monthLabels 배열이란?
      그리드 상단에 표시할 월(月) 라벨의 위치와 값을 담은 배열입니다.
      weeks 길이를 가지며, 각 인덱스는 열(주) 하나에 대응합니다.

      ▼ 계산 방식 ▼
        - 각 주(w)의 첫 번째 날(grid[w * 7])의 month를 확인합니다.
        - 이전 주와 월이 달라질 때만 라벨 객체 { col, month }를 추가합니다.
        - 같은 월이 이어지는 주는 null로 채워 빈 칸으로 렌더링합니다.
        → 월이 바뀌는 첫 주 위치에만 '몇 월' 텍스트가 표시됩니다.
    */
    const monthLabels = useMemo(() => {
        const labels    = [];
        let lastMonth   = null;

        for (let w = 0; w < weeks; w++) {
            const day = grid[w * 7]; // 해당 주의 첫 번째 날(일요일)
            if (!day) continue;

            if (day.month !== lastMonth) {
                // 새로운 월이 시작되는 주 → 라벨 추가
                labels.push({ col: w, month: day.month });
                lastMonth = day.month;
            } else {
                // 이전과 같은 월 → 빈 칸(null)으로 자리 유지
                labels.push(null);
            }
        }
        return labels;
    }, [grid, weeks]); // grid 또는 weeks가 바뀔 때만 재계산


    // ── 요일 라벨 상수 ───────────────────────────

    /*
      인덱스(0~6)가 요일 숫자(dayOfWeek)와 일치하도록 정의합니다.
      렌더링 시 월(1)·수(3)·금(5) 인덱스에만 텍스트를 표시합니다.
      → 너무 촘촘하지 않게 3개만 표시하여 가독성을 높입니다.
    */
    const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];


    // ── JSX 렌더링 ───────────────────────────────

    return (
        <div className="streak-calendar">

            {/* ── 월 라벨 행 : 그리드 상단에 몇 월인지 표시 ── */}
            <div
                className="streak-calendar__months"
                style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }} // 주 수만큼 열 생성
            >
                {monthLabels.map((label, i) =>
                    label ? (
                        // 월이 바뀌는 첫 주에만 'N월' 텍스트 렌더링
                        <span key={i} className="streak-calendar__month-label">
                            {label.month}월
                        </span>
                    ) : (
                        // 같은 월이 이어지는 주는 빈 span으로 자리만 차지
                        <span key={i} />
                    )
                )}
            </div>

            {/* ── 캘린더 본체: 요일 라벨 + 잔디 그리드 ── */}
            <div className="streak-calendar__body">

                {/* 요일 라벨 열 : 그리드 왼쪽에 세로로 7행 표시 */}
                <div className="streak-calendar__day-labels">
                    {[0, 1, 2, 3, 4, 5, 6].map(d => (
                        <span key={d} className="streak-calendar__day-label">
                            {/* 월(1)·수(3)·금(5)만 텍스트 표시, 나머지는 빈 문자열로 공간 유지 */}
                            {[1, 3, 5].includes(d) ? DAY_LABELS[d] : ''}
                        </span>
                    ))}
                </div>

                {/* 잔디 셀 그리드 : weeks열 × 7행 구조 */}
                <div
                    className="streak-calendar__grid"
                    style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }} // 주 수만큼 열 생성
                >
                    {grid.map((day) => (
                        /*
                          각 날짜 셀(div)에 상태에 따른 클래스를 조합하여 적용합니다.
                          배열로 클래스명을 모은 뒤 join(' ')으로 문자열화하고
                          trim()으로 앞뒤 공백을 제거합니다.

                          title 속성 : 마우스 호버 시 날짜와 출석 여부를 툴팁으로 표시
                        */
                        <div
                            key={day.dateStr}
                            className={[
                                'streak-cell',
                                day.attended  ? 'streak-cell--attended' : '', // 출석한 날
                                day.isToday   ? 'streak-cell--today'    : '', // 오늘
                                day.isFuture  ? 'streak-cell--future'   : '', // 미래
                            ].join(' ').trim()}
                            title={`${day.dateStr}${day.attended ? ' ✅ 출석' : ''}`}
                        />
                    ))}
                </div>

            </div>

            {/* ── 범례 : 셀 색상의 의미를 하단에 안내 ── */}
            <div className="streak-calendar__legend">
                <span className="legend-label">적음</span>
                <div className="streak-cell streak-cell--legend streak-cell--lv0" />     {/* 미출석 샘플 셀 */}
                <div className="streak-cell streak-cell--legend streak-cell--attended" />{/* 출석 샘플 셀 */}
                <span className="legend-label">출석</span>
            </div>

        </div>
    );
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  export default : 이 컴포넌트를 다른 파일에서 import하여 사용할 수 있게 합니다.
  사용 예시:
    import StreakCalendar from '@/components/common/StreakCalendar';
    <StreakCalendar attendanceDates={['2025-03-01', '2025-03-03']} />
    <StreakCalendar attendanceDates={dates} weeks={24} />  → 24주치 표시
*/
export default StreakCalendar;
