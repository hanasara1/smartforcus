// ─────────────────────────────────────────────────────────
// server/src/utils/dateUtil.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📅 MySQL DATETIME 변환 유틸리티 함수
// ────────────────────────────────────────────────

/*
  toMySQLDatetime(date)

  [역할]
  JavaScript의 Date 객체를 MySQL DATETIME 컬럼에 저장 가능한 문자열 형식으로 변환합니다.
  DB에 날짜를 저장할 때마다 반복되는 변환 로직을 하나의 함수로 통일하여 재사용합니다.

  ▼ 변환이 필요한 이유 ▼
    JS의 Date 객체를 MySQL에 직접 전달하면 드라이버나 환경에 따라
    형식이 달라지거나 타임존 변환 오류가 발생할 수 있습니다.
    문자열로 명시적으로 변환하면 항상 일관된 형식으로 저장됩니다.

  ▼ 변환 과정 ▼
    1. date.toISOString() : Date 객체를 ISO 8601 형식 문자열로 변환합니다.
                            (예: '2026-03-24T01:28:42.275Z')
    2. .slice(0, 19)      : 밀리초(.275)와 타임존(Z) 부분을 잘라냅니다.
                            (예: '2026-03-24T01:28:42')
    3. .replace('T', ' ') : ISO 형식의 날짜·시각 구분자 'T'를 공백으로 교체합니다.
                            MySQL DATETIME 형식은 'T' 대신 공백을 사용합니다.
                            (예: '2026-03-24 01:28:42')

  ▼ 사용 예시 ▼
    toMySQLDatetime()               → 현재 시각을 MySQL 형식으로 반환
    toMySQLDatetime(new Date(...))  → 특정 시각을 MySQL 형식으로 변환

  @param {Date}   date - 변환할 Date 객체 (기본값: 현재 시각)
  @returns {string}    MySQL DATETIME 형식 문자열 ('YYYY-MM-DD HH:MM:SS')
*/
const toMySQLDatetime = (date = new Date()) => {
  return date.toISOString()   // 'YYYY-MM-DDTHH:MM:SS.mmmZ'
    .slice(0, 19)             // 'YYYY-MM-DDTHH:MM:SS' (밀리초·타임존 제거)
    .replace('T', ' ');       // 'YYYY-MM-DD HH:MM:SS' (MySQL DATETIME 형식)
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수를 다른 파일에서 require()로 사용할 수 있게 합니다.
    - toMySQLDatetime : DB에 날짜를 저장할 때 MySQL DATETIME 형식 문자열이 필요한 곳에서 호출
                        (예: feedbacks, noises, timelapses 테이블 INSERT 시)
*/
module.exports = { toMySQLDatetime };
