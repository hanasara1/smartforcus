// client/src/utils/smartFocus.js


// ────────────────────────────────────────────────
// 📦 모듈 수준 상태 변수
// ────────────────────────────────────────────────

/*
  자세 분석에 사용되는 모듈 전역 상태값입니다.
  컴포넌트가 아닌 모듈 수준에서 관리하여
  여러 프레임에 걸친 연속적인 자세 변화를 추적합니다.

    - lastNosePos       : 직전 프레임의 코(nose) 좌표 (부동 자세 감지용)
    - staticCheckStart  : 부동 자세 감지 시작 시각 (Date.now() 기준 밀리초)
*/
let lastNosePos = null;
let staticCheckStart = Date.now();


// ────────────────────────────────────────────────
// 🔄 부동 자세 추적 초기화 함수
// ────────────────────────────────────────────────

/*
  새로운 집중 세션이 시작될 때 호출하여
  이전 세션의 부동 자세 추적 데이터를 초기화합니다.
  호출하지 않으면 이전 세션의 정적 시간이 누적되어
  잘못된 부동 자세 경고가 발생할 수 있습니다.
*/
export function resetStaticTracking() {
    lastNosePos = null;
    staticCheckStart = Date.now();
}


// ────────────────────────────────────────────────
// 📐 두 랜드마크 사이의 유클리드 거리 계산 함수
// ────────────────────────────────────────────────

/*
  유클리드 거리(Euclidean Distance)란?
  2D 평면에서 두 점 사이의 직선 거리를 계산하는 공식입니다.

  $$d = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2}$$

  MediaPipe 랜드마크 좌표는 0.0 ~ 1.0 사이의 정규화된 값이므로
  반환값도 동일한 0.0 ~ 1.0 범위를 가집니다.

  @param {object} p1 - 첫 번째 랜드마크 좌표 ({ x, y })
  @param {object} p2 - 두 번째 랜드마크 좌표 ({ x, y })
  @returns {number} 두 점 사이의 거리값. 좌표가 없으면 1.0(최대 거리)을 반환합니다.
*/
const getDist = (p1, p2) => {
    // 좌표가 없으면 1.0(최대 거리)을 반환하여 오탐지를 방지
    if (!p1 || !p2) return 1.0;
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2)
    );
};


// ────────────────────────────────────────────────
// 🧠 스마트 자세 분석 메인 함수
// ────────────────────────────────────────────────

/*
  매 프레임마다 호출되어 랜드마크 데이터를 분석하고
  자세 상태와 소음 상태를 반환합니다.

  ▼ 판정 우선순위 (높은 순서대로) ▼
    1순위 : 부동 자세 (STATIC)  - 장시간 움직임 없음
    2순위 : 턱 괴기 (CHIN)     - 손목이 턱 근처에 위치
    3순위 : 엎드림 (SLUMP)     - 고개가 어깨 방향으로 크게 숙여짐
    4순위 : 거북목 (TURTLE)    - 귀가 어깨보다 앞으로 돌출
    5순위 : 몸 기울어짐 (TILT) - 좌우 어깨 높이 차이 발생

  @param {object} data - 카메라에서 수신한 분석 데이터
    {
      landmarks     : MediaPipe Pose 랜드마크 배열 (0~32번 인덱스)
      faceLandmarks : MediaPipe FaceMesh 랜드마크 배열 (0~467번 인덱스, 없을 수 있음)
      db            : 현재 소음 데시벨(dB) 값
      mode          : 카메라 방향 ('front' | 'side')
    }
  @param {object} calibration - 사용자 보정 데이터
    {
      distY : 바른 자세 기준 귀~어깨 Y축 거리 (정규화 좌표 기준)
    }
  @returns {object} 아래 형태의 자세·소음 판정 결과 객체를 반환합니다.
    {
      pose  : { type, status, load },
      noise : { status, val, msg }
    }
*/
export function evaluateSmartFocus(data, calibration) {

    // faceLandmarks : FaceMesh 턱끝(152번) 좌표 사용 시 정확도 향상
    const { landmarks, faceLandmarks, db, mode } = data;
    const now = Date.now();

    /*
      result : 이 함수의 최종 반환값 초기 상태입니다.
      판정 조건에 해당하면 아래 초기값을 덮어씁니다.

      ▼ pose 객체 필드 ▼
        - type   : 자세 유형 ('NORMAL' | 'STATIC' | 'CHIN' | 'SLUMP' | 'TURTLE' | 'TILT')
        - status : 심각도  ('NORMAL' | 'CAUTION' | 'WARNING')
        - load   : 경추 부하 또는 상태 설명 문자열

      ▼ noise 객체 필드 ▼
        - status : 소음 심각도 ('NORMAL' | 'CAUTION' | 'WARNING')
        - val    : 현재 데시벨 수치
        - msg    : 사용자에게 표시할 소음 안내 메시지
    */
    const result = {
        pose  : { type: 'NORMAL', status: 'NORMAL', load: '5kg' },
        noise : { status: 'NORMAL', val: db, msg: '' }
    };

    // 랜드마크가 없으면 판정 불가 → 기본 NORMAL 결과 반환
    if (!landmarks || !landmarks[0]) return result;


    // ══════════════════════════════════════════
    // 📍 랜드마크 변수 선언
    // MediaPipe Pose 랜드마크 인덱스 참조:
    //   0  : 코(nose)
    //   7  : 왼쪽 귀
    //   8  : 오른쪽 귀
    //   11 : 왼쪽 어깨
    //   12 : 오른쪽 어깨
    //   15 : 왼쪽 손목
    //   16 : 오른쪽 손목
    // ══════════════════════════════════════════
    const lm         = landmarks;
    const nose        = lm[0];
    const leftEar     = lm[7];
    const rightEar    = lm[8];
    const leftSh      = lm[11];
    const rightSh     = lm[12];
    const leftWrist   = lm[15];
    const rightWrist  = lm[16];

    // ── 자주 사용되는 중간값 사전 계산 ───────────
    const shoulderMidY = (leftSh.y + rightSh.y) / 2;         // 양쪽 어깨의 Y축 중간값
    const earMidY      = (leftEar.y + rightEar.y) / 2;        // 양쪽 귀의 Y축 중간값
    const earMidX      = (leftEar.x + rightEar.x) / 2;        // 양쪽 귀의 X축 중간값
    const s_slope      = Math.abs(leftSh.y - rightSh.y);      // 좌우 어깨 높이 차이 (기울어짐 판정용)

    // 코~어깨 Y 거리: 카메라와 사용자 사이의 거리에 따라 달라지므로
    // 다른 측정값의 기준(분모)으로 사용하여 카메라 거리 차이를 보정합니다.
    const faceToShoulder = Math.abs(nose.y - shoulderMidY);


    // ══════════════════════════════════════════
    // 1순위: 부동 자세 판정 (STATIC)
    // 장시간 움직임이 없으면 혈액순환 저하 위험을 경고합니다.
    // ══════════════════════════════════════════

    /*
      staticTime : 마지막으로 움직임이 감지된 시점부터 현재까지의 경과 시간(밀리초)
      move       : 직전 프레임 대비 코(nose) 좌표의 이동 거리

      ▼ 판정 기준 ▼
        - 20분(1,200,000ms) 이상 경과 후 move < 0.05 : CAUTION (순환 저하 주의)
        - 30분(1,800,000ms) 이상 경과 후 move < 0.05 : WARNING (정적 부하 심각) → 즉시 반환
        - 움직임이 감지되면 lastNosePos와 staticCheckStart를 초기화합니다.
    */
    const staticTime = now - staticCheckStart;
    if (staticTime >= 1200000) {
        const move = lastNosePos ? getDist(nose, lastNosePos) : 1;
        if (move < 0.05) {
            result.pose.type   = 'STATIC';
            result.pose.status = staticTime >= 1800000 ? 'WARNING' : 'CAUTION';
            result.pose.load   = staticTime >= 1800000 ? '정적 부하 심각' : '순환 저하 주의';
            // WARNING 단계는 즉시 반환하여 더 낮은 우선순위 판정을 건너뜁니다.
            if (result.pose.status === 'WARNING') return result;
        } else {
            // 움직임 감지 → 코 위치와 시작 시각을 현재 값으로 초기화
            lastNosePos = { x: nose.x, y: nose.y };
            staticCheckStart = now;
        }
    }


    // ══════════════════════════════════════════
    // 🔊 소음 판정 (우선순위 무관, 항상 실행)
    // 자세 판정과 독립적으로 매 프레임 소음 상태를 갱신합니다.
    // ══════════════════════════════════════════

    /*
      ▼ 데시벨(dB) 판정 기준 ▼
        - 70dB 이상 : WARNING  (자동차 소음 수준, 즉각 환경 개선 필요)
        - 60dB 이상 : CAUTION  (뇌의 정보 처리 능력 저하 시작)
        - 50dB 이상 : CAUTION  (생리적 집중력 변화 시작 단계)
        - 50dB 미만 : NORMAL   (집중에 적합한 환경)
    */
    if (db >= 70) {
        result.noise = {
            status : 'WARNING',
            val    : db,
            msg    : '70dB↑: 자동차 소음 수준, 즉각 환경 개선 권고'
        };
    } else if (db >= 50) {
        result.noise.status = 'CAUTION';
        result.noise.val    = db;
        result.noise.msg    = db >= 60
            ? "60dB↑: 뇌가 소음을 '정보'로 인식하여 정보 처리 능력 저하"
            : '50dB↑: 생리적 집중력 변화 시작 단계';
    }


    // ══════════════════════════════════════════
    // 2순위: 턱 괴기 판정 (CHIN)
    // 손목이 턱 근처에 위치하면 턱을 괴고 있다고 판정합니다.
    // ══════════════════════════════════════════

    /*
      턱 위치 추정 방법:
      MediaPipe Pose에는 턱 랜드마크가 없으므로 아래 두 가지 방법으로 근사합니다.

      ▼ 방법 1 : FaceMesh 152번 (턱끝) 사용 - 정확도 높음 ▼
        FaceMesh가 얼굴을 감지한 경우 152번 랜드마크(턱끝)를 직접 사용합니다.

      ▼ 방법 2 : 귀 중간점 + 코 좌표로 근사 - fallback ▼
        FaceMesh가 얼굴을 감지하지 못한 경우 귀(7, 8) 중간점과 코(0)의
        중간 지점에서 faceToShoulder의 25% 아래 지점을 턱으로 근사합니다.
        (Holistic 모델이 얼굴을 잡지 못할 때 자동으로 적용됩니다.)

      chinRatio : 손목~턱 거리를 faceToShoulder로 나눈 정규화 비율
        - 0.25 미만  : WARNING (손목이 턱에 매우 근접 → 안면 비대칭 위험)
        - 0.45 미만  : CAUTION (손목이 턱 근처에 위치 → 자세 주의)
    */
    let chinApprox;
    if (faceLandmarks && faceLandmarks[152]) {
        // FaceMesh 152번(턱끝) 좌표를 직접 사용 (정확한 방법)
        chinApprox = {
            x: faceLandmarks[152].x,
            y: faceLandmarks[152].y,
        };
    } else {
        // FaceMesh 미감지 시 귀+코 중간점으로 턱 위치 근사 (fallback)
        chinApprox = {
            x: (nose.x + earMidX) / 2,
            y: (nose.y + earMidY) / 2 + faceToShoulder * 0.25,
        };
    }

    const distChinL = getDist(leftWrist, chinApprox);   // 왼쪽 손목 ~ 턱 거리
    const distChinR = getDist(rightWrist, chinApprox);  // 오른쪽 손목 ~ 턱 거리

    // 양손 중 턱에 더 가까운 손의 거리를 faceToShoulder로 나누어 정규화
    const chinRatio = Math.min(distChinL, distChinR) / (faceToShoulder || 0.25);

    if (chinRatio < 0.25) return { ...result, pose: { type: 'CHIN', status: 'WARNING', load: '안면 비대칭 위험' } };
    else if (chinRatio < 0.45) result.pose = { type: 'CHIN', status: 'CAUTION', load: '자세 주의' };


    // ══════════════════════════════════════════
    // 3순위: 엎드림(SLUMP) + 거북목(TURTLE) 판정
    // ratio와 slumpOffset 두 지표를 조합하여 판정합니다.
    // ══════════════════════════════════════════

    /*
      ▼ 판정에 사용하는 두 가지 지표 ▼

      slumpOffset : 귀 중간 Y좌표 - 어깨 중간 Y좌표
                    음수일수록 귀가 어깨보다 높이 위치(바른 자세)
                    값이 커질수록(0에 가까울수록) 고개가 숙여진 상태

      ratio       : (현재 귀~어깨 Y 거리) ÷ (보정 기준 귀~어깨 Y 거리)
                    1.0에 가까울수록 바른 자세
                    값이 낮을수록 귀와 어깨가 가까워진 상태 (고개 숙임)

      ▼ 실측 기준값 ▼
        자세 유형   slumpOffset     ratio
        바른 자세   ≈ -0.31         ≈ 0.95
        거북목      ≈ -0.30         ≈ 0.85 ~ 0.95
        엎드리기    ≈ -0.13         ≈ 0.39 ~ 0.40

      slumpOffset 단독으로는 거북목과 바른 자세의 구분이 어렵습니다.
      따라서 ratio로 엎드리기/거북목을 먼저 구분하고,
      slumpOffset은 엎드리기 보조 판정에만 사용합니다.
    */
    const slumpOffset    = earMidY - shoulderMidY;
    const currentDistY   = Math.abs(lm[7].y - lm[11].y);
    const ratio          = currentDistY / (calibration?.distY || 0.25);

    // ── 엎드림 판정 (SLUMP) ──────────────────────
    /*
      엎드리면 ratio가 급격히 낮아지고(≈ 0.40) slumpOffset이 커집니다(≈ -0.13).
      두 조건을 AND로 결합하여 오탐지를 방지합니다.

      ▼ 판정 기준 ▼
        ratio ≤ 0.55 + slumpOffset ≥ -0.20 : WARNING (완전히 엎드린 상태)
        ratio ≤ 0.70 + slumpOffset ≥ -0.25 : CAUTION (엎드리기 시작 단계)
    */
    if (ratio <= 0.55 && slumpOffset >= -0.20) {
        return { ...result, pose: { type: 'SLUMP', status: 'WARNING', load: '상체 지지력 상실' } };
    }
    if (ratio <= 0.70 && slumpOffset >= -0.25) {
        return { ...result, pose: { type: 'SLUMP', status: 'CAUTION', load: '고개 숙임' } };
    }

    // ── 거북목 판정 (TURTLE) ─────────────────────
    /*
      엎드림 범위(ratio ≤ 0.55)는 위에서 이미 처리되었으므로
      이 시점에서는 엎드림이 아닌 경우만 거북목을 판정합니다.

      ▼ 모드별 판정 방식 ▼
        side 모드 (측면 카메라):
          귀 X좌표 ~ 어깨 X좌표의 거리(distX)로 판정합니다.
          귀가 어깨보다 앞으로 돌출될수록 distX가 커집니다.
          - distX ≥ 50 : WARNING (경추 무리)
          - distX ≥ 25 : CAUTION (하중 발생)

        front 모드 (정면 카메라):
          ratio로 판정합니다. 바른 자세(ratio ≈ 0.96) 대비 낮아진 정도를 측정합니다.
          - ratio ≤ 0.70 : WARNING (거북목 심각)
          - ratio ≤ 0.80 : CAUTION (자세 불량)

        기울어짐(TILT) 판정은 거북목이 없을 때(NORMAL)만 실행합니다.
        거북목과 기울어짐이 동시에 감지되면 거북목을 우선 반환합니다.
    */
    if (mode === 'side') {
        // 측면 모드: X축 거리로 귀의 전방 돌출 정도를 측정
        const distX = Math.abs(leftEar.x - leftSh.x) * 1000; // 0~1 정규화 좌표를 1000배 확대
        if (distX >= 50) return { ...result, pose: { type: 'TURTLE', status: 'WARNING', load: '27kg (경추 무리)' } };
        else if (distX >= 25) return { ...result, pose: { type: 'TURTLE', status: 'CAUTION', load: '12kg (하중 발생)' } };
    } else {
        // 정면 모드: ratio로 귀~어깨 거리 감소를 측정
        if (ratio <= 0.70) return { ...result, pose: { type: 'TURTLE', status: 'WARNING', load: '18kg↑ (거북목 심각)' } };
        else if (ratio <= 0.80) return { ...result, pose: { type: 'TURTLE', status: 'CAUTION', load: '12kg (자세 불량)' } };

        // ── 몸 기울어짐 판정 (TILT) ─────────────
        /*
          거북목이 없을 때(NORMAL)만 실행합니다.
          s_slope : 좌우 어깨의 Y좌표 차이로 어깨 기울어짐 정도를 측정합니다.
          값이 클수록 어깨가 좌우로 기울어진 상태입니다.

          ▼ 판정 기준 ▼
            s_slope ≥ 0.05 : WARNING (척추 불균형 위험)
            s_slope ≥ 0.03 : CAUTION (어깨 비대칭)
        */
        if (result.pose.type === 'NORMAL') {
            if (s_slope >= 0.05) return { ...result, pose: { type: 'TILT', status: 'WARNING', load: '척추 불균형 위험' } };
            else if (s_slope >= 0.03) return { ...result, pose: { type: 'TILT', status: 'CAUTION', load: '어깨 비대칭' } };
        }
    }

    // 모든 판정을 통과하면 현재 result 객체(NORMAL 또는 낮은 단계 경고)를 반환합니다.
    return result;
}
