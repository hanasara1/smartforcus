import React, { useMemo } from 'react';
import './StreakCalendar.css';

/**
 * GitHub 잔디 스타일 출석 캘린더 컴포넌트
 * @param {string[]} attendanceDates - 'YYYY-MM-DD' 형식의 출석 날짜 배열
 * @param {number}   weeks           - 표시할 주 수 (기본값 12주)
 */
const StreakCalendar = ({ attendanceDates = [], weeks = 12 }) => {
    const attendSet = useMemo(
        () => new Set(attendanceDates),
        [attendanceDates]
    );

    // ── 오늘 기준으로 weeks × 7일의 날짜 배열 생성
    const grid = useMemo(() => {
        const today = new Date();
        // 이번 주 토요일(마지막 날)을 기준점으로 설정
        const endDay = new Date(today);
        endDay.setDate(today.getDate() + (6 - today.getDay()));

        const totalDays = weeks * 7;
        const days = [];

        for (let i = totalDays - 1; i >= 0; i--) {
            const d = new Date(endDay);
            d.setDate(endDay.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const isToday = dateStr === today.toISOString().split('T')[0];
            const isFuture = d > today;

            days.push({
                dateStr,
                isToday,
                isFuture,
                attended: !isFuture && attendSet.has(dateStr),
                dayOfWeek: d.getDay(), // 0=일 ~ 6=토
                month: d.getMonth() + 1,
                day: d.getDate(),
            });
        }
        return days;
    }, [attendSet, weeks]);

    // ── 월 라벨 계산 (그리드 상단 표시용)
    const monthLabels = useMemo(() => {
        const labels = [];
        let lastMonth = null;

        // 7일 단위(주) 기준으로 월 라벨 위치 계산
        for (let w = 0; w < weeks; w++) {
            const day = grid[w * 7];
            if (!day) continue;
            if (day.month !== lastMonth) {
                labels.push({ col: w, month: day.month });
                lastMonth = day.month;
            } else {
                labels.push(null);
            }
        }
        return labels;
    }, [grid, weeks]);

    // ── 요일 라벨 (월·수·금만 표시)
    const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

    return (
        <div className="streak-calendar">
            {/* 월 라벨 행 */}
            <div
                className="streak-calendar__months"
                style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}
            >
                {monthLabels.map((label, i) =>
                    label ? (
                        <span key={i} className="streak-calendar__month-label">
                            {label.month}월
                        </span>
                    ) : (
                        <span key={i} />
                    )
                )}
            </div>

            {/* 캘린더 본체: 요일 라벨 + 잔디 그리드 */}
            <div className="streak-calendar__body">
                {/* 요일 라벨 (7행) */}
                <div className="streak-calendar__day-labels">
                    {[0, 1, 2, 3, 4, 5, 6].map(d => (
                        <span key={d} className="streak-calendar__day-label">
                            {[1, 3, 5].includes(d) ? DAY_LABELS[d] : ''}
                        </span>
                    ))}
                </div>

                {/* 잔디 셀 그리드: weeks열 × 7행 */}
                <div
                    className="streak-calendar__grid"
                    style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}
                >
                    {grid.map((day) => (
                        <div
                            key={day.dateStr}
                            className={[
                                'streak-cell',
                                day.attended ? 'streak-cell--attended' : '',
                                day.isToday ? 'streak-cell--today' : '',
                                day.isFuture ? 'streak-cell--future' : '',
                            ].join(' ').trim()}
                            title={`${day.dateStr}${day.attended ? ' ✅ 출석' : ''}`}
                        />
                    ))}
                </div>
            </div>

            {/* 범례 */}
            <div className="streak-calendar__legend">
                <span className="legend-label">적음</span>
                <div className="streak-cell streak-cell--legend streak-cell--lv0" />
                <div className="streak-cell streak-cell--legend streak-cell--attended" />
                <span className="legend-label">출석</span>
            </div>
        </div>
    );
};

export default StreakCalendar;
