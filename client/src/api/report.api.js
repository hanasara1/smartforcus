// ─────────────────────────────────────────────────────────
// 📦 src/api/report.api.js  ─  리포트 관련 API 함수 모음
// ─────────────────────────────────────────────────────────
// 몰입 세션 리포트의 목록 조회 / 단건 조회 /
// AI 피드백 생성 요청을 서버로 전달하는 역할을 합니다.
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  axiosInstance란?
  baseURL, 토큰 자동 첨부, 401 자동 로그아웃 처리 등
  공통 설정이 미리 적용된 커스텀 axios 객체입니다.
  (자세한 설정 내용은 src/api/axiosInstance.js 참고)
*/
import axiosInstance from './axiosInstance';


// ────────────────────────────────────────────────
// 📋 리포트 API 함수 정의
// ────────────────────────────────────────────────

/*
  ▼ 공통 구조 설명 ▼

  각 함수는 axiosInstance의 HTTP 메서드를 호출하고
  서버 응답(Promise)을 그대로 반환합니다.
  호출부에서 await 또는 .then()으로 응답 결과를 받아야 합니다.

  ▼ 사용하는 HTTP 메서드 ▼
    - GET  : 서버에서 데이터를 '조회'할 때 사용합니다. (서버 데이터 변경 없음)
    - POST : 서버에 작업 실행을 '요청'할 때 사용합니다.
             피드백 생성은 전달할 body 데이터는 없지만,
             서버 측에서 AI 호출 및 DB 저장 등 데이터 변경이 발생하므로
             GET이 아닌 POST를 사용합니다.

  ▼ 엔드포인트 설명 ▼
    - '/reports?page=${page}&limit=${limit}' : 리포트 목록 조회 엔드포인트
                                               page(페이지 번호)와 limit(페이지당 항목 수)를
                                               쿼리 파라미터로 전달하여 원하는 범위의 목록을 조회합니다.
    - '/reports/${imm_idx}'                  : 특정 세션의 리포트 단건 조회 엔드포인트
    - '/reports/${imm_idx}/feedback'         : 특정 세션의 AI 피드백 생성 엔드포인트
                                               imm_idx를 URL에 직접 포함시켜
                                               어떤 세션의 피드백을 생성할지 서버에 전달합니다.
                                               (REST API의 URL 파라미터 방식)
*/

// ── 리포트 목록 조회 API ─────────────────────────
// 로그인한 유저의 몰입 세션 리포트 목록을 페이지 단위로 가져옵니다.
// @param {number} page  - 조회할 페이지 번호 (기본값: 1)
// @param {number} limit - 한 페이지에 표시할 리포트 수 (기본값: 10)
//   두 파라미터 모두 기본값이 설정되어 있어, 인자를 생략하면 첫 페이지의 10개를 조회합니다.
//   예) getReportListAPI()       → '/reports?page=1&limit=10'
//       getReportListAPI(2)      → '/reports?page=2&limit=10'
//       getReportListAPI(2, 5)   → '/reports?page=2&limit=5'
// 반환 예시 : { list: [{ imm_idx: 1, imm_date: '2026-04-16', imm_score: 85, ... }, ...], totalPage: 3, currentPage: 1 }
export const getReportListAPI = (page = 1, limit = 10) =>
  axiosInstance.get(`/reports?page=${page}&limit=${limit}`);

// ── 리포트 단건 조회 API ─────────────────────────
// 특정 몰입 세션 하나의 리포트 상세 정보를 가져옵니다.
// @param {number} imm_idx - 조회할 세션의 고유 식별자(ID)
// 반환 예시 : { imm_idx: 42, imm_date: '2026-04-16', start_time: '09:00:00',
//              end_time: '10:30:00', imm_score: 85, feedback: '...', ... }
export const getReportAPI   = (imm_idx) => axiosInstance.get(`/reports/${imm_idx}`);

// ── AI 피드백 생성 API ───────────────────────────
// 특정 몰입 세션에 대한 AI 피드백을 새로 생성하도록 서버에 요청합니다.
// @param {number} imm_idx - 피드백을 생성할 세션의 고유 식별자(ID)
//   요청 본문(body)은 없지만, 서버 측에서 AI 호출 및 피드백 DB 저장이
//   발생하므로 데이터 변경을 수반하는 POST 메서드를 사용합니다.
//   (이미 피드백이 존재하는 세션에 재요청 시 서버 정책에 따라 처리됩니다.)
// 반환 예시 : { success: true, feedback: '오늘 세션은 집중도가 높았습니다. ...', ... }
export const genFeedbackAPI = (imm_idx) => axiosInstance.post(`/reports/${imm_idx}/feedback`);
