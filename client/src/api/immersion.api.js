// ─────────────────────────────────────────────────────────
// 📦 src/api/immersion.api.js  ─  몰입 세션 관련 API 함수 모음
// ─────────────────────────────────────────────────────────
// 몰입 세션의 시작 / 종료 / 목록 조회 / 단건 조회 요청을
// 서버로 전달하는 역할을 합니다.
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
// ⏱️ 몰입 세션 API 함수 정의
// ────────────────────────────────────────────────

/*
  ▼ 공통 구조 설명 ▼

  각 함수는 axiosInstance의 HTTP 메서드를 호출하고
  서버 응답(Promise)을 그대로 반환합니다.
  호출부에서 await 또는 .then()으로 응답 결과를 받아야 합니다.

  ▼ 사용하는 HTTP 메서드 ▼
    - POST  : 새로운 데이터를 '생성'할 때 사용합니다.
              (예: 새 몰입 세션 시작)
    - PATCH : 기존 데이터의 일부만 '수정'할 때 사용합니다.
              PUT이 데이터 전체를 교체하는 것과 달리,
              PATCH는 변경이 필요한 필드만 골라서 업데이트합니다.
              (예: 세션 종료 시간과 점수만 업데이트)
    - GET   : 서버에서 데이터를 '조회'할 때 사용합니다. (서버 데이터 변경 없음)

  ▼ 엔드포인트 설명 ▼
    - '/immersions'                      : 세션 생성 및 목록 조회 엔드포인트
    - '/immersions?page=${page}'         : 페이지 번호를 쿼리 파라미터로 전달하여
                                           해당 페이지의 목록을 조회합니다.
    - '/immersions/${imm_idx}/end'       : 특정 세션 종료 처리 엔드포인트
    - '/immersions/${imm_idx}'           : 특정 세션 단건 조회 엔드포인트
                                           imm_idx를 URL에 직접 포함시켜
                                           어떤 세션을 조회/수정할지 서버에 전달합니다.
                                           (REST API의 URL 파라미터 방식)
*/

// ── 세션 시작 API ────────────────────────────────
// 새로운 몰입 세션을 생성합니다.
// @param {object} data - 세션 시작 정보
// data 예시 : { imm_date: '2026-04-16', start_time: '09:00:00', goal: '집중 공부' }
// 반환 예시 : { imm_idx: 42, message: '세션 시작 완료', ... }
export const startSessionAPI = (data)          => axiosInstance.post('/immersions', data);

// ── 세션 종료 API ────────────────────────────────
// 진행 중인 몰입 세션을 종료하고 결과를 업데이트합니다.
// @param {number} imm_idx - 종료할 세션의 고유 식별자(ID)
// @param {object} data    - 세션 종료 정보 (변경이 필요한 필드만 전달)
// data 예시 : { end_time: '10:30:00', imm_score: 85 }
// 반환 예시 : { success: true, message: '세션 종료 완료', ... }
export const endSessionAPI   = (imm_idx, data) => axiosInstance.patch(`/immersions/${imm_idx}/end`, data);

// ── 세션 목록 조회 API ───────────────────────────
// 로그인한 유저의 몰입 세션 목록을 페이지 단위로 가져옵니다.
// @param {number} page - 조회할 페이지 번호 (기본값: 1)
//   기본값이 1로 설정되어 있어, 인자를 생략하면 첫 번째 페이지를 조회합니다.
//   예) getImmListAPI()    → '/immersions?page=1'
//       getImmListAPI(3)   → '/immersions?page=3'
// 반환 예시 : { list: [ { imm_idx: 1, ... }, ... ], totalPage: 5, currentPage: 1 }
export const getImmListAPI   = (page = 1)      => axiosInstance.get(`/immersions?page=${page}`);

// ── 세션 단건 조회 API ───────────────────────────
// 특정 몰입 세션 하나의 상세 정보를 가져옵니다.
// @param {number} imm_idx - 조회할 세션의 고유 식별자(ID)
// 반환 예시 : { imm_idx: 42, start_time: '09:00:00', end_time: '10:30:00', imm_score: 85, ... }
export const getImmOneAPI    = (imm_idx)       => axiosInstance.get(`/immersions/${imm_idx}`);
