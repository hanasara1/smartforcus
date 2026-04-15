// ─────────────────────────────────────────────────────────
// server/src/utils/logger.js — Winston 로거
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  winston : Node.js에서 가장 널리 사용되는 로깅 라이브러리입니다.
            console.log 대신 winston을 사용하면 로그 레벨 분류, 파일 저장,
            형식 커스터마이징 등 다양한 기능을 활용할 수 있습니다.

  createLogger : 로거 인스턴스를 생성하는 함수입니다.
  format       : 로그 출력 형식을 정의하는 포매터 모음입니다.
  transports   : 로그를 어디에 출력할지 결정하는 전송 채널 모음입니다.
                 (예: 콘솔 출력, 파일 저장 등)
*/
const { createLogger, format, transports } = require('winston');

// path : 파일 경로를 OS에 맞게 안전하게 조합하기 위해 사용합니다
const path = require('path');


// ────────────────────────────────────────────────
// 🎨 로그 포맷 정의
// ────────────────────────────────────────────────

/*
  format 구성 요소 설명:

  combine    : 여러 포매터를 순서대로 조합합니다. 파이프라인처럼 앞 포매터의 결과가 다음으로 전달됩니다.
  timestamp  : 로그에 현재 시각을 추가합니다. format 옵션으로 출력 형식을 지정합니다.
  printf     : 로그 출력 문자열을 직접 정의하는 커스텀 포매터입니다.
  colorize   : 로그 레벨(info, warn, error 등)에 색상을 입혀 콘솔에서 구분하기 쉽게 합니다.
  errors     : 에러 객체의 스택 트레이스(stack)를 로그에 포함시킵니다.
               stack: true 옵션이 없으면 에러 메시지만 출력됩니다.
*/
const { combine, timestamp, printf, colorize, errors } = format;

/*
  logFormat :
    로그 한 줄의 출력 형식을 정의합니다.
    { level, message, timestamp, stack } 구조를 받아 문자열로 조합합니다.

    ts    : timestamp 포매터가 주입한 시각 문자열
    stack : errors 포매터가 주입한 에러 스택 트레이스
            에러가 아닌 일반 로그는 stack이 undefined이므로 message를 사용합니다.

    출력 예시:
      [2026-03-24 01:28:42] info: 서버가 시작되었습니다.
      [2026-03-24 01:28:43] error: DB 연결 실패\n    at Pool.query (...)
*/
const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `[${ts}] ${level}: ${stack || message}`;
  // stack이 있으면(에러 객체) 스택 트레이스를 출력하고, 없으면 일반 메시지를 출력합니다
});


// ────────────────────────────────────────────────
// 📝 로거 인스턴스 생성
// ────────────────────────────────────────────────

/*
  createLogger 옵션 설명:

  level :
    이 레벨 이상의 로그만 출력합니다.
    Winston 로그 레벨 우선순위: error(0) > warn(1) > info(2) > http(3) > verbose(4) > debug(5) > silly(6)
    LOG_LEVEL 환경 변수로 런타임에 레벨을 조정할 수 있습니다. (기본값: 'info')
    (예: LOG_LEVEL=debug → debug 이상 모든 로그 출력)

  format :
    모든 transport에 공통으로 적용되는 기본 포맷입니다.
    timestamp → errors(스택 포함) → logFormat 순서로 처리됩니다.

  transports :
    로그를 동시에 여러 채널에 출력할 수 있습니다.
    아래 3가지 채널을 등록합니다.
*/
const logger = createLogger({
  level  : process.env.LOG_LEVEL || 'info',
  format : combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),  // 날짜·시각 전체 포함
    errors({ stack: true }),                         // 에러 스택 트레이스 포함
    logFormat,                                       // 커스텀 출력 형식 적용
  ),
  transports: [

    // ── 콘솔 출력 (컬러 + 시각 간략 표시) ───────────
    /*
      개발 환경에서 터미널에 로그를 출력합니다.
      colorize() : 레벨별 색상 적용 (info=초록, warn=노랑, error=빨강)
      timestamp  : 콘솔에서는 'HH:mm:ss' 형식으로 간략하게 표시합니다.
    */
    new transports.Console({
      format: combine(
        colorize(),                              // 레벨에 색상 적용
        timestamp({ format: 'HH:mm:ss' }),       // 시·분·초만 간략 표시
        logFormat,                               // 커스텀 출력 형식 적용
      ),
    }),

    // ── 에러 로그 파일 저장 ──────────────────────────
    /*
      level: 'error' : error 레벨 이상의 로그만 이 파일에 저장합니다.
      서비스 운영 중 발생한 심각한 오류만 별도 파일로 관리하여
      빠른 오류 탐지와 대응이 가능합니다.
      저장 경로: {프로젝트 루트}/logs/error.log
    */
    new transports.File({
      filename : path.join('logs', 'error.log'),
      level    : 'error',
    }),

    // ── 전체 로그 파일 저장 ──────────────────────────
    /*
      level 제한 없이 모든 로그를 파일에 저장합니다.
      서버 동작 이력 전체를 보관하여 문제 발생 시 원인 추적에 활용합니다.
      저장 경로: {프로젝트 루트}/logs/combined.log
    */
    new transports.File({
      filename: path.join('logs', 'combined.log'),
    }),
  ],
});


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 생성된 로거 인스턴스를 다른 파일에서 require()로 사용할 수 있게 합니다.
                   console.log / console.error 대신 아래 메서드를 사용합니다.

  ▼ 사용 예시 ▼
    const logger = require('../utils/logger');
    logger.info('서버 시작');          → info 레벨 로그
    logger.warn('캐시 미준비');        → warn 레벨 로그
    logger.error('DB 연결 실패', err); → error 레벨 로그 (스택 트레이스 포함)
*/
module.exports = logger;
