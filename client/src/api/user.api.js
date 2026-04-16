// ─────────────────────────────────────────────────────────
// 📦 src/api/user.api.js  ─  유저 관련 API 함수 모음
// ─────────────────────────────────────────────────────────
// 내 정보 조회 / 전체 정보 수정 / 통계 조회 /
// 자세 통계 조회 / 랭킹 조회 / 연속 출석 조회 요청을
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
// 👤 유저 API 함수 정의
// ────────────────────────────────────────────────

/*
  ▼ 공통 구조 설명 ▼

  각 함수는 axiosInstance의 HTTP 메서드를 호출하고
  서버 응답(Promise)을 그대로 반환합니다.
  호출부에서 await 또는 .then()으로 응답 결과를 받아야 합니다.

  ▼ 사용하는 HTTP 메서드 ▼
    - GET : 서버에서 데이터를 '조회'할 때 사용합니다. (서버 데이터 변경 없음)
    - PUT : 기존 데이터를 '전체 교체'할 때 사용합니다.
            일부 필드만 변경하는 PATCH와 달리, PUT은 전달한 데이터로
            리소스 전체를 덮어씁니다.
            (예: 유저 프로필 전체를 새 데이터로 업데이트)

  ▼ '/me' 엔드포인트 공통 설명 ▼
    이 파일의 대부분의 엔드포인트는 '/users/me'를 기준으로 구성됩니다.
    '/me'는 "현재 로그인한 나"를 의미하는 REST API 관례적 표현으로,
    요청 헤더에 자동 첨부된 JWT 토큰을 통해 서버가 유저를 식별합니다.
    따라서 URL에 user_idx를 직접 포함할 필요가 없습니다.

  ▼ 엔드포인트 설명 ▼
    - '/users/me'             : 현재 유저의 기본 정보 조회 및 전체 수정 엔드포인트
    - '/users/me/stats'       : 현재 유저의 몰입 관련 종합 통계 조회 엔드포인트
    - '/users/me/pose-stats'  : 현재 유저의 자세 분석 통계 조회 엔드포인트
    - '/users/me/streak'      : 현재 유저의 연속 몰입 출석 현황 조회 엔드포인트
    - '/users/ranking'        : 전체 유저 랭킹 조회 엔드포인트
                                '/me'가 없으므로 특정 유저가 아닌 전체 대상 조회입니다.
*/

// ── 내 기본 정보 조회 API ────────────────────────
// 현재 로그인한 유저의 기본 프로필 정보를 가져옵니다.
// 파라미터 없음 : 서버가 JWT 토큰으로 현재 유저를 직접 식별합니다.
// 반환 예시 : { user_idx: 1, nick: '닉네임', email: 'user@example.com', point: 1500, ... }
export const getMeAPI          = ()     => axiosInstance.get('/users/me');

// ── 내 정보 전체 수정 API ────────────────────────
// 현재 로그인한 유저의 프로필 정보를 전달한 데이터로 전체 교체합니다.
// @param {object} data - 수정할 유저 정보 전체를 담은 객체
//   PUT은 전체 교체 방식이므로 변경하지 않는 필드도 기존 값을 포함하여 전달해야 합니다.
//   data 예시 : { nick: '새닉네임', email: 'new@example.com', profile_img: 'img_url' }
// 반환 예시 : { success: true, message: '정보 수정 완료', ... }
export const updateMeAPI       = (data) => axiosInstance.put('/users/me', data);

// ── 내 종합 통계 조회 API ────────────────────────
// 현재 로그인한 유저의 몰입 관련 종합 통계를 가져옵니다.
// 파라미터 없음 : 서버가 JWT 토큰으로 현재 유저를 직접 식별합니다.
// 반환 예시 : { total_sessions: 42, total_minutes: 3000, avg_score: 78, best_score: 95, ... }
export const getMyStatsAPI     = ()     => axiosInstance.get('/users/me/stats');

// ── 내 자세 통계 조회 API ────────────────────────
// 현재 로그인한 유저의 세션별 자세 분석 결과 통계를 가져옵니다.
// 파라미터 없음 : 서버가 JWT 토큰으로 현재 유저를 직접 식별합니다.
// 반환 예시 : { good_pose_rate: 82, bad_pose_count: 15, most_common_pose: 'forward_head', ... }
export const getMyPoseStatsAPI = ()     => axiosInstance.get('/users/me/pose-stats');

// ── 전체 유저 랭킹 조회 API ──────────────────────
// 전체 유저의 몰입 점수 기반 랭킹 목록을 가져옵니다.
// 파라미터 없음 : 특정 유저가 아닌 전체 대상 조회이므로 식별자가 필요 없습니다.
//   서버의 rankingCache에 저장된 캐시 데이터를 반환하므로
//   매 요청마다 DB를 조회하지 않아 응답 속도가 빠릅니다.
//   (캐시 갱신 주기는 server/src/cache/ranking.cache.js 참고)
// 반환 예시 : { top10: [{ rank: 1, nick: '유저A', composite_score: 520, ... }],
//              myRank: 3, myData: null, isInTop10: true, updatedAt: '2026-04-16T00:00:00' }
export const getRankingAPI     = ()     => axiosInstance.get('/users/ranking');

// ── 내 연속 출석 조회 API ────────────────────────
// 현재 로그인한 유저의 연속 몰입 출석 현황을 가져옵니다.
// 파라미터 없음 : 서버가 JWT 토큰으로 현재 유저를 직접 식별합니다.
// 반환 예시 : { current_streak: 5, max_streak: 14, last_imm_date: '2026-04-16', ... }
export const getMyStreakAPI    = ()     => axiosInstance.get('/users/me/streak');
