// server/src/utils/dateUtil.js

/**
 * JavaScript Date 객체를 MySQL DATETIME 형식으로 변환
 * '2026-03-24T01:28:42.275Z'  →  '2026-03-24 01:28:42'
 * @param {Date} date - 변환할 Date 객체 (기본값: 현재 시간)
 * @returns {string} MySQL DATETIME 형식 문자열
 */
const toMySQLDatetime = (date = new Date()) => {
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

module.exports = { toMySQLDatetime };