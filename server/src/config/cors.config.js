// server/src/config/cors.config.js

// ────────────────────────────────────────────────
// 📦 CORS 설정 파일
// ────────────────────────────────────────────────

/*
  CORS(Cross-Origin Resource Sharing)란?
  브라우저는 보안상의 이유로 "다른 출처(Origin)"의 서버에
  함부로 요청을 보내지 못하도록 막습니다. 이것을 "동일 출처 정책(Same-Origin Policy)"이라 합니다.

  예시:
    프론트엔드 주소 : http://localhost:3000  (출처 A)
    백엔드 API 주소 : http://localhost:5000  (출처 B)
    → 포트가 다르므로 "다른 출처"로 간주 → 브라우저가 요청을 차단!

  CORS 설정은 서버가 "이 출처는 내가 신뢰하니 요청을 허용해줘"라고
  브라우저에게 알려주는 방식입니다.
*/


// ────────────────────────────────────────────────
// ✅ 허용할 출처(Origin) 목록 구성
// ────────────────────────────────────────────────

/*
  환경 변수(process.env.ALLOWED_ORIGINS)에서 허용할 출처 목록을 읽어옵니다.
  환경 변수가 없을 경우 기본값으로 'http://localhost:3000'을 사용합니다.

  환경 변수 예시 (.env 파일):
    ALLOWED_ORIGINS=https://example.com,https://www.example.com

  처리 흐름:
    1. .split(',')          → 쉼표 기준으로 나눠 배열로 만듭니다
                               예: ['https://example.com', ' https://www.example.com']
    2. .map(o => o.trim())  → 각 항목의 앞뒤 공백을 제거합니다
                               예: ['https://example.com', 'https://www.example.com']
    3. .replace(/\/$/, '')  → 주소 끝의 슬래시(/)를 제거합니다
                               예: 'https://example.com/' → 'https://example.com'
                               (슬래시 유무에 따라 비교 실패를 방지하기 위함)
*/
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''));


// ────────────────────────────────────────────────
// ⚙️ CORS 옵션 객체 정의
// ────────────────────────────────────────────────

const corsOptions = {

    // ── 출처(Origin) 허용 여부 판별 함수 ────────────
    /*
      요청이 들어올 때마다 이 함수가 자동으로 호출됩니다.

      @param {string | undefined} origin
        - 요청을 보낸 클라이언트의 출처 (예: 'https://example.com')
        - 브라우저가 아닌 서버 간 요청(Postman, curl 등)은 origin이 undefined입니다.

      @param {function} callback
        - CORS 허용 여부를 최종적으로 알려주는 함수입니다.
        - callback(null, true)         → 요청 허용
        - callback(new Error('...'))   → 요청 차단 (에러 메시지와 함께)
    */
    origin(origin, callback) {

        // ── origin이 없는 경우 (서버-서버 요청, Postman 등) ──
        if (!origin) {
            if (process.env.NODE_ENV === 'production') {
                // 운영(production) 환경에서는 출처가 없는 요청을 차단합니다.
                // 실제 서비스에서는 출처가 없는 요청이 오면 보안 위협일 수 있습니다.
                return callback(new Error('Origin 없는 요청은 운영 환경에서 허용되지 않습니다.'));
            }
            // 개발(development) 환경에서는 Postman 등 편의를 위해 허용합니다.
            return callback(null, true);
        }

        // ── 요청 출처의 끝 슬래시(/) 제거 후 비교 ──────
        /*
          브라우저마다 origin 끝에 슬래시를 붙이는 방식이 다를 수 있습니다.
          예: 'https://example.com' vs 'https://example.com/'
          끝의 슬래시를 제거하고 비교해야 정확하게 일치 여부를 판단할 수 있습니다.
        */
        const normalizedOrigin = origin.replace(/\/$/, '');

        // allowedOrigins 배열에 현재 요청 출처가 포함되어 있으면 허용합니다
        if (allowedOrigins.includes(normalizedOrigin)) {
            return callback(null, true);
        }

        // 허용 목록에 없는 출처는 차단하고 명확한 에러 메시지를 반환합니다
        return callback(new Error(`CORS 정책 위반: ${origin} 은 허용되지 않는 출처입니다.`));
    },


    // ── 허용할 HTTP 메서드 목록 ──────────────────────
    /*
      클라이언트가 사용할 수 있는 HTTP 메서드를 명시합니다.
        - GET     : 데이터 조회
        - POST    : 데이터 생성
        - PUT     : 데이터 전체 수정
        - PATCH   : 데이터 일부 수정
        - DELETE  : 데이터 삭제
        - OPTIONS : 브라우저가 실제 요청 전에 서버에 허용 여부를 먼저 물어보는 사전 요청(Preflight)
    */
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],


    // ── 허용할 요청 헤더 목록 ───────────────────────
    /*
      클라이언트가 요청 시 포함할 수 있는 HTTP 헤더를 명시합니다.
        - Content-Type    : 요청 본문의 데이터 형식 (예: application/json)
        - Authorization   : 인증 토큰 (예: Bearer eyJhbGci...)
        - X-Requested-With: Ajax 요청임을 표시하는 관례적인 헤더
        - Accept          : 클라이언트가 받을 수 있는 응답 데이터 형식
    */
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
    ],


    // ── 자격 증명(쿠키, 인증 헤더 등) 허용 여부 ────
    /*
      true로 설정하면 요청에 쿠키나 Authorization 헤더 등
      인증 관련 정보를 포함할 수 있습니다.
      단, credentials: true를 사용하려면 origin을 '*'(전체 허용)로
      설정할 수 없고 반드시 구체적인 출처를 명시해야 합니다.
    */
    credentials: true,


    // ── Preflight 요청 캐시 시간 (초 단위) ─────────
    /*
      Preflight(사전 요청)란?
      브라우저가 실제 요청을 보내기 전에 OPTIONS 메서드로
      "이 요청 보내도 돼?"라고 서버에 먼저 물어보는 과정입니다.

      maxAge: 86400 → 86400초 = 24시간 동안 Preflight 결과를 캐시합니다.
      같은 출처에서 반복 요청 시 매번 Preflight를 보내지 않아도 되므로
      불필요한 네트워크 요청을 줄여 성능을 개선합니다.
    */
    maxAge: 86400,
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  이 설정 객체를 다른 파일(예: app.js)에서 불러와 아래처럼 사용합니다.

  사용 예시:
    const cors = require('cors');
    const corsOptions = require('./config/cors.config');
    app.use(cors(corsOptions));
*/
module.exports = corsOptions;
