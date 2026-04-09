// client/src/utils/smartFocus.js

let lastNosePos = null;
let staticCheckStart = Date.now();

export function resetStaticTracking() {
    lastNosePos = null;
    staticCheckStart = Date.now();
}

const getDist = (p1, p2) => {
    if (!p1 || !p2) return 1.0;
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2)
    );
};

export function evaluateSmartFocus(data, calibration) {
    // ✅ faceLandmarks 추가
    const { landmarks, faceLandmarks, db, mode } = data; const now = Date.now();

    const result = {
        pose: { type: 'NORMAL', status: 'NORMAL', load: '5kg' },
        noise: { status: 'NORMAL', val: db, msg: '' }
    };

    if (!landmarks || !landmarks[0]) return result;

    // ══════════════════════════════════════════
    // 랜드마크 변수 한 곳에서 선언
    // ══════════════════════════════════════════
    const lm = landmarks;
    const nose = lm[0];
    const leftEar = lm[7];
    const rightEar = lm[8];
    const leftSh = lm[11];
    const rightSh = lm[12];
    const leftWrist = lm[15];
    const rightWrist = lm[16];

    // 자주 쓰는 중간값 미리 계산
    const shoulderMidY = (leftSh.y + rightSh.y) / 2;
    const earMidY = (leftEar.y + rightEar.y) / 2;
    const earMidX = (leftEar.x + rightEar.x) / 2;
    const s_slope = Math.abs(leftSh.y - rightSh.y);

    // 코~어깨 y 거리 (얼굴 크기 기준값, 카메라 거리 보정용)
    const faceToShoulder = Math.abs(nose.y - shoulderMidY);

    // ══════════════════════════════════════════
    // 1순위: 부동 자세 판정
    // ══════════════════════════════════════════
    const staticTime = now - staticCheckStart;
    if (staticTime >= 1200000) {
        const move = lastNosePos ? getDist(nose, lastNosePos) : 1;
        if (move < 0.05) {
            result.pose.type = 'STATIC';
            result.pose.status = staticTime >= 1800000 ? 'WARNING' : 'CAUTION';
            result.pose.load = staticTime >= 1800000 ? '정적 부하 심각' : '순환 저하 주의';
            if (result.pose.status === 'WARNING') return result;
        } else {
            lastNosePos = { x: nose.x, y: nose.y };
            staticCheckStart = now;
        }
    }

    // ══════════════════════════════════════════
    // 소음 판정 (항상 실행)
    // ══════════════════════════════════════════
    if (db >= 70) {
        result.noise = {
            status: 'WARNING',
            val: db,
            msg: '70dB↑: 자동차 소음 수준, 즉각 환경 개선 권고'
        };
    } else if (db >= 50) {
        result.noise.status = 'CAUTION';
        result.noise.val = db;
        result.noise.msg = db >= 60
            ? "60dB↑: 뇌가 소음을 '정보'로 인식하여 정보 처리 능력 저하"
            : '50dB↑: 생리적 집중력 변화 시작 단계';
    }

    // ══════════════════════════════════════════
    // 2순위: 턱 괴기 판정
    // ══════════════════════════════════════════
    // 턱 근사점 = 귀 중간점과 코 사이의 중간에서 살짝 아래
    // MediaPipe Pose에 턱 랜드마크가 없어서
    // 귀(7,8) 중간점과 코(0) 사이를 턱 위치로 근사함
    // ✅ FaceMesh 152번(턱끝)이 있으면 사용
    // 없으면 기존 근사점 방식으로 자동 fallback
    let chinApprox;
    if (faceLandmarks && faceLandmarks[152]) {
        // ✅ 정확한 턱끝 좌표 사용
        chinApprox = {
            x: faceLandmarks[152].x,
            y: faceLandmarks[152].y,
        };
    } else {
        // ✅ Holistic이 얼굴을 못 잡을 때 기존 방식으로 fallback
        chinApprox = {
            x: (nose.x + earMidX) / 2,
            y: (nose.y + earMidY) / 2 + faceToShoulder * 0.25,
        };
    }

    const distChinL = getDist(leftWrist, chinApprox);
    const distChinR = getDist(rightWrist, chinApprox);
    const chinRatio = Math.min(distChinL, distChinR) / (faceToShoulder || 0.25);

    if (chinRatio < 0.25) return { ...result, pose: { type: 'CHIN', status: 'WARNING', load: '안면 비대칭 위험' } };
    else if (chinRatio < 0.45) result.pose = { type: 'CHIN', status: 'CAUTION', load: '자세 주의' };

    // ══════════════════════════════════════════
    // 3순위: 엎드림 + 거북목 판정
    // ══════════════════════════════════════════
    // ✅ 측정값 기반 임계값 설정
    //
    // 실측 데이터:
    //   바른 자세:  slumpOffset ≈ -0.31  | ratio ≈ 0.95
    //   거북목:     slumpOffset ≈ -0.30  | ratio ≈ 0.85 ~ 0.95
    //   엎드리기:   slumpOffset ≈ -0.13  | ratio ≈ 0.39 ~ 0.40
    //
    // slumpOffset 단독으로는 거북목/바른자세 구분이 어려움
    // → ratio로 엎드리기/거북목을 먼저 구분하고
    // → slumpOffset은 엎드리기 보조 판정에만 사용

    const slumpOffset = earMidY - shoulderMidY;
    const currentDistY = Math.abs(lm[7].y - lm[11].y);
    const ratio = currentDistY / (calibration?.distY || 0.25);

    // ✅ 엎드리기 판정
    // 엎드리면 ratio가 0.40 수준으로 확 떨어짐
    // slumpOffset도 -0.13 수준으로 올라옴 (바른자세는 -0.31)
    if (ratio <= 0.55 && slumpOffset >= -0.20) {
        // ratio 0.55 이하 + slumpOffset -0.20 이상 = 완전 엎드림
        return { ...result, pose: { type: 'SLUMP', status: 'WARNING', load: '상체 지지력 상실' } };
    }
    if (ratio <= 0.70 && slumpOffset >= -0.25) {
        // ratio 0.70 이하 + slumpOffset -0.25 이상 = 엎드리기 시작
        return { ...result, pose: { type: 'SLUMP', status: 'CAUTION', load: '고개 숙임' } };
    }

    // ✅ 거북목 판정 (엎드리기가 아닐 때만 도달)
    // 거북목은 ratio가 바른자세(0.96) 대비 낮아질 때 판정
    // 단, 엎드리기 범위(0.55 이하)는 이미 위에서 처리됨
    if (mode === 'side') {
        const distX = Math.abs(leftEar.x - leftSh.x) * 1000;
        if (distX >= 50) return { ...result, pose: { type: 'TURTLE', status: 'WARNING', load: '27kg (경추 무리)' } };
        else if (distX >= 25) return { ...result, pose: { type: 'TURTLE', status: 'CAUTION', load: '12kg (하중 발생)' } };
    } else {
        // 정면 모드 거북목
        // 바른자세 ratio ≈ 0.96 기준으로
        // 0.80 이하면 CAUTION, 0.70 이하면 WARNING
        if (ratio <= 0.70) return { ...result, pose: { type: 'TURTLE', status: 'WARNING', load: '18kg↑ (거북목 심각)' } };
        else if (ratio <= 0.80) return { ...result, pose: { type: 'TURTLE', status: 'CAUTION', load: '12kg (자세 불량)' } };

        // 거북목 없을 때만 기울어짐 판정
        if (result.pose.type === 'NORMAL') {
            if (s_slope >= 0.05) return { ...result, pose: { type: 'TILT', status: 'WARNING', load: '척추 불균형 위험' } };
            else if (s_slope >= 0.03) return { ...result, pose: { type: 'TILT', status: 'CAUTION', load: '어깨 비대칭' } };
        }
    }

    return result;
}
