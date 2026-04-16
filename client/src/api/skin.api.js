// ─────────────────────────────────────────────────────────
// 📦 src/api/skin.api.js  ─  스킨 관련 API 함수 모음
// ─────────────────────────────────────────────────────────
// 스킨 목록 조회 / 적용 중인 스킨 조회 /
// 스킨 구매 / 스킨 적용 요청을 서버로 전달하는 역할을 합니다.
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
// 🎨 스킨 API 함수 정의
// ────────────────────────────────────────────────

/*
  ▼ 공통 구조 설명 ▼

  각 함수는 axiosInstance의 HTTP 메서드를 호출하고
  서버 응답(Promise)을 그대로 반환합니다.
  호출부에서 await 또는 .then()으로 응답 결과를 받아야 합니다.

  ▼ 사용하는 HTTP 메서드 ▼
    - GET   : 서버에서 데이터를 '조회'할 때 사용합니다. (서버 데이터 변경 없음)
    - POST  : 새로운 데이터를 '생성'할 때 사용합니다.
              (예: 스킨 구매 내역 생성)
    - PATCH : 기존 데이터의 일부만 '수정'할 때 사용합니다.
              (예: 현재 적용 중인 스킨 항목만 변경)

  ▼ skin_idx 전달 방식 비교 ▼
    이 파일의 purchaseSkinAPI, applySkinAPI는 badge.api.js의 purchaseBadgeAPI와
    달리 skin_idx를 URL 파라미터가 아닌 요청 본문(body)으로 전달합니다.

    - URL 파라미터 방식  : axiosInstance.post(`/skins/${skin_idx}`)
                           → 식별자가 URL에 노출되며, 단일 리소스를 직접 특정할 때 주로 사용합니다.

    - 요청 본문 방식     : axiosInstance.post('/skins/purchase', { skin_idx })
                           → 식별자를 body에 담아 전달하며, 구매/적용처럼
                             동작의 대상을 함께 전송할 때 주로 사용합니다.

  ▼ 엔드포인트 설명 ▼
    - '/skins'          : 전체 스킨 목록 조회 엔드포인트
    - '/skins/active'   : 현재 로그인한 유저가 적용 중인 스킨 조회 엔드포인트
                          JWT 토큰으로 유저를 식별하므로 별도 파라미터가 필요 없습니다.
    - '/skins/purchase' : 스킨 구매 처리 엔드포인트
                          구매할 skin_idx를 요청 본문(body)으로 전달합니다.
    - '/skins/apply'    : 스킨 적용(변경) 처리 엔드포인트
                          적용할 skin_idx를 요청 본문(body)으로 전달합니다.
*/

// ── 전체 스킨 목록 조회 API ──────────────────────
// 구매 가능한 모든 스킨 정보를 가져옵니다.
// 파라미터 없음 : 전체 목록 조회이므로 별도 식별자가 필요 없습니다.
// 반환 예시 : [{ skin_idx: 1, name: '다크모드', price: 500, thumbnail: '...' }, ...]
export const getSkinListAPI   = ()         => axiosInstance.get('/skins');

// ── 적용 중인 스킨 조회 API ──────────────────────
// 현재 로그인한 유저가 적용 중인 스킨 정보를 가져옵니다.
// 파라미터 없음 : 서버가 JWT 토큰으로 현재 유저를 직접 식별합니다.
// 반환 예시 : { skin_idx: 2, name: '다크모드', thumbnail: '...', applied_at: '2026-04-16' }
export const getActiveSkinAPI = ()         => axiosInstance.get('/skins/active');

// ── 스킨 구매 API ────────────────────────────────
// 특정 스킨을 구매하고 보유 목록에 추가합니다.
// @param {number} skin_idx - 구매할 스킨의 고유 식별자(ID)
//   skin_idx는 URL이 아닌 요청 본문(body) { skin_idx }에 담아 전달합니다.
// 반환 예시 : { success: true, message: '구매 완료', balance: 1500, ... }
export const purchaseSkinAPI  = (skin_idx) => axiosInstance.post('/skins/purchase', { skin_idx });

// ── 스킨 적용 API ────────────────────────────────
// 보유 중인 스킨 중 하나를 현재 적용 스킨으로 변경합니다.
// @param {number} skin_idx - 적용할 스킨의 고유 식별자(ID)
//   skin_idx는 URL이 아닌 요청 본문(body) { skin_idx }에 담아 전달합니다.
//   전체 스킨 데이터를 교체하는 것이 아니라 적용 항목 하나만 변경하므로
//   PUT 대신 PATCH를 사용합니다.
// 반환 예시 : { success: true, message: '스킨 적용 완료', applied_skin_idx: 3, ... }
export const applySkinAPI     = (skin_idx) => axiosInstance.patch('/skins/apply', { skin_idx });
