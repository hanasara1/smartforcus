// ─────────────────────────────────────────────────────────
// server/src/services/feedback.service.js
// ─────────────────────────────────────────────────────────


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  GoogleGenerativeAI : Google의 Gemini AI 모델을 Node.js에서 사용할 수 있게 해주는 SDK입니다.
                       API 키로 인증하고 모델 인스턴스를 생성하여 텍스트 생성 요청을 보냅니다.
*/
const { GoogleGenerativeAI } = require('@google/generative-ai');


// ────────────────────────────────────────────────
// 🏷️ 자세 유형 레이블 정의
// ────────────────────────────────────────────────

/*
  POSE_LABELS :
    DB에 저장된 자세 유형 코드(영문)를 사용자에게 보여줄 한국어 레이블로 매핑합니다.
    피드백 텍스트 생성 시 코드 대신 자연스러운 한국어 명칭을 사용하기 위해 활용합니다.
*/
const POSE_LABELS = {
  NORMAL : '바른 자세',
  TURTLE : '거북목',
  SLUMP  : '엎드림',
  TILT   : '몸 기울어짐',
  CHIN   : '턱 괴기',
  STATIC : '장시간 고정 자세',
};


// ────────────────────────────────────────────────
// 💡 자세별 교정 가이드 정의
// ────────────────────────────────────────────────

/*
  POSE_ADVICE :
    각 불량 자세 유형에 대한 단기 교정 팁(short)과 상세 설명(detail)을 제공합니다.
    fallbackFeedback 함수에서 TOP 불량 자세를 설명할 때 사용됩니다.

  ▼ 각 필드 설명 ▼
    short  : 한 줄 요약 교정 방법 (향후 간단한 알림 메시지에 활용 가능)
    detail : 자세 원인, 영향, 구체적 교정 방법을 담은 상세 설명
*/
const POSE_ADVICE = {
  TURTLE: {
    short : '귀와 어깨가 일직선이 되도록 턱을 살짝 당겨주세요.',
    detail:
      '거북목은 목 뒤 근육에 최대 3배의 하중을 줍니다. ' +
      '모니터 상단이 눈높이와 같도록 화면 높이를 조절하고, ' +
      '1시간마다 목을 좌우로 천천히 돌리는 스트레칭을 해주세요.',
  },
  SLUMP: {
    short : '골반을 세우고 등받이에 허리를 밀착시켜주세요.',
    detail:
      '엎드리거나 구부정한 자세는 허리 디스크에 직접적인 압박을 줍니다. ' +
      '의자 깊숙이 앉아 골반을 곧게 세우고, ' +
      '허리와 등받이 사이에 작은 쿠션을 받쳐보세요.',
  },
  TILT: {
    short : '양쪽 엉덩이에 체중을 균등하게 분산해주세요.',
    detail:
      '몸이 한쪽으로 기울어지면 척추 측만증으로 이어질 수 있습니다. ' +
      '발바닥이 바닥에 평평하게 닿도록 의자 높이를 조절하고, ' +
      '턱과 코의 중심이 배꼽 위에 오도록 의식적으로 교정해주세요.',
  },
  CHIN: {
    short : '손으로 턱 괴는 습관을 의식적으로 줄여보세요.',
    detail:
      '턱 괴기는 집중력이 저하될 때 무의식적으로 나타나는 신호입니다. ' +
      '팔꿈치 받침대 높이를 낮추거나 제거하고, ' +
      '짧은 휴식을 취한 뒤 다시 집중하는 패턴을 만들어보세요.',
  },
  STATIC: {
    short : '20분마다 자리에서 일어나 간단한 스트레칭을 해주세요.',
    detail:
      '장시간 같은 자세는 혈액순환을 방해하고 근육을 굳게 만듭니다. ' +
      '20-20-20 규칙(20분 집중 후 20초간 20피트 거리 응시)을 활용하고, ' +
      '스탠딩 데스크나 발 받침대 사용도 고려해보세요.',
  },
};


// ────────────────────────────────────────────────
// 🛠️ 피드백 구성 요소 헬퍼 함수들
// ────────────────────────────────────────────────

/*
  getTimeComment(durationMin) :
    집중 시간(분)에 따라 적절한 격려 또는 안내 메시지를 반환합니다.
    집중 시간이 0분이면 null을 반환하여 메시지를 생략합니다.

    구간별 메시지:
      0분         : null (메시지 없음)
      1 ~ 9분     : 짧은 세션 격려 (시작의 중요성 강조)
      10 ~ 24분   : 포모도로 1세트 도전 권장
      25 ~ 49분   : 포모도로 1세트 완성 칭찬
      50 ~ 89분   : 충분한 집중 후 휴식 권장
      90분 이상   : 장시간 집중 인정 + 충분한 휴식 강조
*/
const getTimeComment = (durationMin) => {
  if (durationMin === 0) return null;
  if (durationMin < 10) return `⏱️ ${durationMin}분 집중하셨어요. 짧은 세션이지만 시작이 반입니다!`;
  if (durationMin < 25) return `⏱️ ${durationMin}분 집중하셨어요. 포모도로 1세트까지 조금 더 도전해보세요!`;
  if (durationMin < 50) return `⏱️ ${durationMin}분 집중! 포모도로 1세트 완성, 좋은 리듬입니다. 👍`;
  if (durationMin < 90) return `⏰ ${durationMin}분 집중! 충분히 집중하셨으니 10분 휴식을 권장해요.`;
  return `🏆 ${durationMin}분 장시간 집중! 반드시 충분한 휴식을 취해주세요.`;
};


/*
  getScoreComment(score) :
    집중 점수(0~100)에 따라 이모지와 총평 메시지 객체를 반환합니다.
    오늘의 총평 섹션의 첫 문장을 구성하는 데 사용합니다.

    @returns { emoji: string, msg: string }
*/
const getScoreComment = (score) => {
  if (score >= 90) return { emoji: '🏆', msg: `${score}점! 오늘 집중력은 최상이었어요.` };
  if (score >= 80) return { emoji: '⭐', msg: `${score}점! 전반적으로 훌륭한 세션이었어요.` };
  if (score >= 65) return { emoji: '😊', msg: `${score}점. 양호한 집중 세션이었어요.` };
  if (score >= 50) return { emoji: '💪', msg: `${score}점. 아쉽지만 다음 세션에서 더 잘할 수 있어요!` };
  return { emoji: '🌱', msg: `${score}점. 자세 교정과 환경 개선에 집중해봐요.` };
};


/*
  getNoiseComment(avgDecibel) :
    평균 데시벨에 따라 소음 환경 평가 메시지를 반환합니다.
    데시벨이 0 이하면 소음 데이터가 없는 것으로 판단하여 null을 반환합니다.

    구간별 메시지:
      0 이하   : null (데이터 없음)
      75dB 이상 : 매우 높은 소음 경고
      55dB 이상 : 약간 높은 소음 안내 + 귀마개/백색소음 추천
      55dB 미만 : 조용한 환경 칭찬
*/
const getNoiseComment = (avgDecibel) => {
  if (avgDecibel <= 0) return null;
  if (avgDecibel >= 75) return `🔊 평균 소음이 ${avgDecibel.toFixed(1)}dB로 매우 높았어요. 조용한 환경에서 집중하면 효율이 크게 오릅니다.`;
  if (avgDecibel >= 55) return `🔉 평균 소음 ${avgDecibel.toFixed(1)}dB. 약간 소음이 있었어요. 귀마개나 백색소음 활용을 추천드려요.`;
  return `🔇 평균 소음 ${avgDecibel.toFixed(1)}dB의 조용한 환경에서 집중하셨네요. 최적의 환경이에요!`;
};


/*
  getStreakComment(maxGoodStreakSec) :
    연속 바른 자세 유지 시간(초)을 분·초로 변환하여 칭찬 메시지를 반환합니다.
    값이 없거나 0 이하면 null을 반환합니다.

    구간별 메시지:
      1800초(30분) 이상 : 자세 마스터 수준 칭찬
      600초(10분) 이상  : 연속 바른 자세 유지 칭찬
      180초(3분) 이상   : 조금씩 늘려가도록 격려
      180초 미만        : 자세를 의식하도록 안내
*/
const getStreakComment = (maxGoodStreakSec) => {
  if (!maxGoodStreakSec || maxGoodStreakSec <= 0) return null;

  const min   = Math.floor(maxGoodStreakSec / 60);
  const sec   = maxGoodStreakSec % 60;
  // 1분 이상이면 '분 초' 형식, 1분 미만이면 '초' 형식으로 표시합니다
  const label = min > 0 ? `${min}분 ${sec}초` : `${sec}초`;

  if (maxGoodStreakSec >= 1800) return `🦅 최대 ${label} 연속 바른 자세 유지! 자세 마스터 수준이에요.`;
  if (maxGoodStreakSec >= 600)  return `✅ 최대 ${label} 연속으로 바른 자세를 유지하셨어요!`;
  if (maxGoodStreakSec >= 180)  return `🙂 최대 ${label} 연속 바른 자세. 조금씩 늘려가봐요!`;
  return `💡 최대 ${label} 연속 바른 자세. 자세를 좀 더 의식하며 집중해보세요.`;
};


/*
  getPatternDiagnosis(poseCount, total) :
    여러 자세 유형의 비율을 조합 분석하여 패턴 기반 특별 진단 메시지를 반환합니다.
    단일 자세 진단으로는 발견하기 어려운 복합적인 자세 문제를 식별합니다.
    해당하는 패턴이 없으면 null을 반환합니다.

    ▼ 감지 패턴 3가지 ▼
      거북목(20%) + 턱 괴기(15%) : 모니터 높이 문제 진단
      엎드림(20%) + 장시간 고정(15%) : 장시간 구부정한 자세 진단
      3가지 이상 불량 자세 각 10% 이상 : 전반적 자세 습관 개선 필요 진단
*/
const getPatternDiagnosis = (poseCount, total) => {
  if (total === 0) return null;

  // 각 불량 자세의 전체 감지 대비 비율을 계산합니다
  const turtleRate = (poseCount.TURTLE || 0) / total;
  const chinRate   = (poseCount.CHIN   || 0) / total;
  const slumpRate  = (poseCount.SLUMP  || 0) / total;
  const staticRate = (poseCount.STATIC || 0) / total;

  // 거북목과 턱 괴기가 동시에 높은 경우 → 모니터 높이 문제
  if (turtleRate > 0.2 && chinRate > 0.15) {
    return '🔍 거북목과 턱 괴기가 함께 감지되었어요. 모니터 높이가 너무 낮을 가능성이 높습니다. 화면을 눈높이로 올려보세요.';
  }

  // 엎드림과 장시간 고정이 동시에 높은 경우 → 의자 자세 문제
  if (slumpRate > 0.2 && staticRate > 0.15) {
    return '🔍 구부정한 자세가 장시간 지속되었어요. 의자 등받이 각도를 100~110도로 조절하고 허리 쿠션을 활용해보세요.';
  }

  /*
    전반적으로 다양한 불량 자세가 고르게 나온 경우 → 전체적인 자세 습관 개선 필요
    10% 이상의 비율을 가진 불량 자세 유형이 3가지 이상이면 해당합니다.
  */
  const badTypes = Object.entries(poseCount)
    .filter(([type, count]) => type !== 'NORMAL' && count / total > 0.1)
    .length;
  if (badTypes >= 3) {
    return '🔍 다양한 자세 오류가 고르게 감지되었어요. 전반적인 자세 습관 개선이 필요해 보입니다. 정기적인 스트레칭 루틴을 만들어보세요.';
  }

  return null;
};


/*
  generateTags(session, poseCount, avgDecibel, maxGoodStreakSec, badRate) :
    세션 데이터를 기반으로 맞춤형 해시태그 문자열을 동적으로 생성합니다.
    피드백 JSON의 '집중태그' 필드에 사용됩니다.

    ▼ 태그 생성 기준 ▼
      imm_score 90+ : #최고점수
      imm_score 80+ : #우수한집중
      badRate  = 0  : #완벽한자세
      badRate ≤ 20  : #자세양호
      badRate ≤ 50  : #자세주의
      badRate > 50  : #자세교정필요
      streak 1800초+ : #자세마스터
      streak  600초+ : #연속바른자세
      소음 < 45dB   : #최적환경
      소음 ≥ 70dB   : #소음환경
      집중 50분+    : #장시간집중
      집중 25분+    : #포모도로완성
      TURTLE 있음   : #거북목주의
      SLUMP 있음    : #허리자세점검
      (항상 추가)   : #성장중
*/
const generateTags = (session, poseCount, avgDecibel, maxGoodStreakSec, badRate) => {
  const tags = [];
  const dur  = session.duration_min || 0;

  // 점수 기반 태그
  if (session.imm_score >= 90) tags.push('#최고점수');
  else if (session.imm_score >= 80) tags.push('#우수한집중');

  // 자세 오류 비율 기반 태그
  if (badRate === 0) tags.push('#완벽한자세');
  else if (badRate <= 20) tags.push('#자세양호');
  else if (badRate <= 50) tags.push('#자세주의');
  else tags.push('#자세교정필요');

  // 연속 바른 자세 기반 태그
  if (maxGoodStreakSec >= 1800) tags.push('#자세마스터');
  else if (maxGoodStreakSec >= 600) tags.push('#연속바른자세');

  // 소음 환경 기반 태그
  if (avgDecibel > 0 && avgDecibel < 45) tags.push('#최적환경');
  else if (avgDecibel >= 70) tags.push('#소음환경');

  // 집중 시간 기반 태그
  if (dur >= 50) tags.push('#장시간집중');
  else if (dur >= 25) tags.push('#포모도로완성');

  // 특정 자세 유형 기반 태그
  if (poseCount.TURTLE > 0) tags.push('#거북목주의');
  if (poseCount.SLUMP  > 0) tags.push('#허리자세점검');

  tags.push('#성장중');  // 모든 세션에 항상 추가되는 긍정 태그

  return tags.join(' ');
};


// ────────────────────────────────────────────────
// 🤖 AI 피드백 생성 함수 (Gemini API)
// ────────────────────────────────────────────────

/*
  generateAIFeedback(session, poseCount, avgDecibel)

  [역할]
  세션 데이터를 Gemini AI 모델에 전달하여 맞춤형 피드백 텍스트를 생성합니다.
  API 호출에 실패하거나 오류가 발생하면 fallbackFeedback으로 자동 대체하여
  어떤 상황에서도 피드백이 반환될 수 있도록 보장합니다.

  [처리 순서]
    1. 자세 데이터가 없으면 감지 불가 안내 JSON을 즉시 반환합니다.
    2. 자세 통계(총 감지, 바른 자세 비율, 불량 자세 비율, 유형별 상세)를 계산합니다.
    3. 세션 데이터를 포함한 상세 프롬프트를 구성합니다.
    4. Gemini API에 프롬프트를 전달하여 피드백을 생성합니다.
    5. API 오류 시 fallbackFeedback을 호출하여 규칙 기반 피드백으로 대체합니다.

  ▼ 프롬프트 구성 전략 ▼
    역할 정의(전문 학습 코치), 비율 지침(긍정 70% / 보완 30%), 답변 원칙,
    출력 형식(JSON), 세션 데이터를 모두 포함하여 일관된 품질의 피드백을 유도합니다.

  ▼ 출력 JSON 구조 ▼
    {
      "오늘의총평" : 한 줄 총평,
      "긍정분석"  : 잘한 점 상세 분석 (전체의 70%),
      "보완사항"  : 아쉬운 점 및 개선 제안 (전체의 30%),
      "집중태그"  : 데이터 맞춤형 해시태그
    }

  @param {object} session      - 집중 세션 데이터 (imm_score, duration_min, max_good_streak 등)
  @param {object} poseCount    - 자세 유형별 감지 횟수 (예: { NORMAL: 30, TURTLE: 5 })
  @param {number} avgDecibel   - 세션 평균 데시벨
  @returns {string} JSON 형식의 피드백 문자열
*/
const generateAIFeedback = async (session, poseCount = {}, avgDecibel = 0) => {
  try {
    // 전체 자세 감지 횟수를 합산합니다
    const total = Object.values(poseCount).reduce((a, b) => a + b, 0);

    // ── 자세 데이터가 없는 경우 즉시 반환 ───────────────
    /*
      자세 감지 데이터가 수집되지 않으면 AI 분석이 불가능하므로
      카메라 환경 점검을 안내하는 기본 JSON을 반환합니다.
    */
    if (total === 0) {
      return JSON.stringify({
        오늘의총평 : '자세 데이터가 없어 분석이 어려워요.',
        긍정분석  : '세션을 완료하신 것만으로도 훌륭해요! 다음 세션에서는 카메라 앞에 상반신이 잘 보이도록 위치를 조정해보세요.',
        보완사항  : '자세 감지 데이터가 수집되지 않았어요. 카메라 각도와 조명을 확인해주세요.',
        집중태그  : '#세션완료 #환경점검필요 #성장중',
      }, null, 2);
    }

    // ── 자세 통계 계산 ───────────────────────────────────
    const normalCount = poseCount.NORMAL || 0;
    const badCount    = total - normalCount;
    const badRate     = Math.round((badCount / total) * 100);  // 불량 자세 비율 (%)

    /*
      poseDetail : 프롬프트에 포함할 자세 유형별 감지 횟수 요약 문자열입니다.
      감지 횟수가 0인 유형은 제외하고, 한국어 레이블과 함께 나열합니다.
      (예: "바른 자세: 30회, 거북목: 5회, 턱 괴기: 3회")
    */
    const poseDetail = Object.entries(poseCount)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${POSE_LABELS[type] || type}: ${count}회`)
      .join(', ');

    // ── Gemini 프롬프트 구성 ─────────────────────────────
    /*
      역할 정의, 비율 지침, 답변 원칙, 출력 형식(JSON), 세션 데이터를 포함합니다.
      .trim()으로 앞뒤 공백을 제거하여 프롬프트를 정리합니다.
    */
    const prompt = `
당신은 'Smart Focus' 서비스의 [전문 학습 코치]입니다. 
사용자의 집중 데이터와 타임랩스 분석 로그, 
과거 이력를 종합하여 리포트용 피드백을 생성하되, 
다음 [비율 지침]을 엄격히 준수하십시오.
아래 집중 세션 데이터를 분석하고 
사용자에게 친절하고 구체적인 피드백을 한국어로 작성해주세요.

[비율 지침]
1. 성취와 격려 (70%): 사용자가 달성한 집중 시간, 몰입도 점수, 소음 관리 지표 등 '긍정적인 지표'를 구체적인 수치와 함께 먼저 언급하십시오. 
                      특히 과거 평균 데이터와 비교하여 개선된 점이 있다면 이를 구체적인 수치로 칭찬하십시오.
2. 분석과 보완 (30%): 거북목 발생 빈도나 집중력이 저하된 구간을 데이터 근거로 지적하십시오.
                      이때 타임랩스 영상에서 확인 가능한 특정 시간대(예: 세션 후반부 등)을 언급하여 사용자가 
                      직접 자신의 모습을 복기하도록 유도하고 이를 해결할 전문적인 행동 지침을 제시하십시오.

[답변 원칙]
- 말투: 차분하고 신뢰감 있는 '해요체'를 사용하되, 전문 용어를 적절히 섞어 권위를 유지하십시오.
- 일관성: 동일한 세션 데이터에 대해서는 항상 논리적으로 일관된 진단을 내리십시오.
- 시각적 연동: 사용자가 타임랩스 영상의 특정 구간을 찾아볼 수 있도록 '영상 속 시점'을 분석에 포함하십시오.
- 금지사항: 너무 가벼운 유행어나 감정적인 과잉 표현(예: "너무너무 대단해요!")은 사용하지 마십시오.

[출력 형식]
반드시 아래의 한국어 키를 가진 JSON 구조로만 응답하십시오.
{
  "오늘의총평": "오늘의 성취를 정의하는 한 줄 평",
  "긍정분석": "과거 기록 대비 개선점 및 잘한 점(오늘의 성취)에 대한 상세 데이터 분석 (전체의 70% 분량)",
  "보완사항": "타임랩스 기반의 자세/집중력 분석 및 아쉬운 점과 내일을 위한 개선 제안 (전체의 30% 분량)",
  "집중태그": "#성장중 #타임랩스_확인권장 #성공적_몰입 #자세주의 등 데이터 맞춤형 태그"
}

[세션 정보]
- 집중 점수: ${session.imm_score}점 (100점 만점)
- 집중 시간: ${session.duration_min || 0}분
- 평균 소음: ${avgDecibel.toFixed(1)}dB

[자세 감지 결과]
- 총 감지 횟수: ${total}회
- 바른 자세 비율: ${Math.round((normalCount / total) * 100)}%
- 잘못된 자세 비율: ${badRate}%
- 자세별 상세: ${poseDetail}

[피드백 작성 규칙]
1. 이모지를 적절히 사용해 읽기 쉽게 작성
2. 집중 점수에 대한 격려 메시지 포함
3. 가장 많이 감지된 잘못된 자세에 대한 교정 방법 구체적으로 설명
4. 소음 환경에 대한 코멘트 포함
5. 다음 세션을 위한 개선 목표 제시
6. 전체 200자 이내로 간결하게 작성
    `.trim();

    // ── Gemini API 호출 ──────────────────────────────────
    /*
      process.env.GEMINI_API_KEY : .env 파일에 저장된 Gemini API 키를 불러옵니다.
      gemini-2.0-flash-lite : 빠른 응답 속도에 최적화된 경량 모델입니다.
    */
    const genAI    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model    = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
    const result   = await model.generateContent(prompt);
    const feedback = result.response.text();

    return feedback;

  } catch (err) {
    // Gemini API 호출 실패 시 규칙 기반 fallback 피드백으로 자동 대체합니다
    console.error('Gemini API 오류:', err.message);
    return fallbackFeedback(session, poseCount, avgDecibel);
  }
};


// ────────────────────────────────────────────────
// 🔄 규칙 기반 폴백 피드백 함수
// ────────────────────────────────────────────────

/*
  fallbackFeedback(session, poseCount, avgDecibel)

  [역할]
  Gemini API 호출이 실패했을 때 규칙 기반으로 피드백을 생성합니다.
  Gemini와 동일한 JSON 구조를 반환하므로 클라이언트는 어떤 방식으로
  생성된 피드백인지 구분하지 않아도 됩니다.

  [반환 JSON 구조]
    Gemini와 동일하게 아래 4개 키를 가진 JSON 문자열을 반환합니다.
    {
      오늘의총평 : 점수 기반 한 줄 총평,
      긍정분석  : 점수·자세·streak·집중시간·소음 기반 긍정 메시지 (70%),
      보완사항  : 자세 오류 비율·TOP 불량 자세·패턴 진단·소음·목표 제시 (30%),
      집중태그  : 데이터 맞춤형 해시태그 문자열
    }

  [조립 순서]
    ① 오늘의 총평    : getScoreComment()로 점수 기반 한 줄 평 생성
    ② 긍정 분석 (70%) : 점수, 바른 자세 비율, streak, 집중 시간, 소음 칭찬 조합
    ③ 보완 사항 (30%) : 자세 오류 진단, TOP 불량 자세 교정 가이드, 패턴 진단, 소음 경고, 다음 목표 조합
    ④ 집중 태그       : generateTags()로 데이터 맞춤형 해시태그 생성

  @param {object} session      - 집중 세션 데이터
  @param {object} poseCount    - 자세 유형별 감지 횟수
  @param {number} avgDecibel   - 세션 평균 데시벨
  @returns {string} JSON 형식의 피드백 문자열 (Gemini와 동일한 구조)
*/
const fallbackFeedback = (session, poseCount = {}, avgDecibel = 0) => {

  // ── 기본 통계 계산 ───────────────────────────────────
  const total       = Object.values(poseCount).reduce((a, b) => a + b, 0);
  const normalCount = poseCount.NORMAL || 0;
  const badRate     = total > 0 ? Math.round(((total - normalCount) / total) * 100) : 0;
  const dur         = session.duration_min  || 0;
  const maxStreak   = session.max_good_streak || 0;  // 연속 바른 자세 최장 시간 (초 단위)

  // ── 불량 자세 TOP 2 추출 ─────────────────────────────
  /*
    NORMAL을 제외한 불량 자세를 count 내림차순으로 정렬하여 상위 2개만 꺼냅니다.
    교정 가이드는 가장 많이 발생한 자세 위주로 제공하는 것이 효과적이기 때문입니다.
  */
  const topBadList = Object.entries(poseCount)
    .filter(([type, count]) => type !== 'NORMAL' && count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2);

  // ── ① 오늘의 총평 조립 ──────────────────────────────
  const scoreComment = getScoreComment(session.imm_score);
  const 오늘의총평   = `${scoreComment.emoji} ${scoreComment.msg}`;

  // ── ② 긍정 분석 (70%) 조립 ──────────────────────────
  const positiveLines = [];

  // 점수 칭찬 메시지
  if (session.imm_score >= 80) {
    positiveLines.push(`집중 점수 ${session.imm_score}점으로 매우 우수한 세션을 완료하셨어요.`);
  } else {
    positiveLines.push(`이번 세션 집중 점수는 ${session.imm_score}점이에요.`);
  }

  // 바른 자세 비율 칭찬 (비율에 따라 메시지 차별화)
  const goodRate = 100 - badRate;
  if (goodRate === 100) {
    positiveLines.push('✅ 세션 내내 완벽한 자세를 유지하셨어요! 정말 훌륭합니다.');
  } else if (goodRate >= 80) {
    positiveLines.push(`✅ 전체 감지 중 ${goodRate}%를 바른 자세로 유지하셨어요. 매우 안정적인 자세 습관입니다.`);
  } else if (goodRate >= 60) {
    positiveLines.push(`🙂 전체 감지 중 ${goodRate}%가 바른 자세였어요. 절반 이상을 잘 유지하셨습니다.`);
  }

  // 연속 바른 자세 streak 칭찬 (null이면 생략)
  const streakComment = getStreakComment(maxStreak);
  if (streakComment) positiveLines.push(streakComment);

  // 집중 시간 코멘트 (null이면 생략)
  const timeComment = getTimeComment(dur);
  if (timeComment) positiveLines.push(timeComment);

  // 소음 환경이 조용한 경우에만 긍정 섹션에 포함합니다 (시끄러운 경우는 보완 섹션에서 다룸)
  if (avgDecibel > 0 && avgDecibel < 50) {
    positiveLines.push(`🔇 평균 ${avgDecibel.toFixed(1)}dB의 조용한 환경에서 집중하셨어요. 최적의 학습 환경입니다!`);
  }

  const 긍정분석 = positiveLines.join('\n');

  // ── ③ 보완 사항 (30%) 조립 ──────────────────────────
  const improveLines = [];

  if (badRate === 0) {
    // 불량 자세가 없으면 칭찬으로 보완 섹션을 채웁니다
    improveLines.push('이번 세션은 자세 면에서 완벽했어요! 다음 세션에서도 이 상태를 유지해봐요.');
  } else {
    // 자세 오류 비율에 따라 경고 강도를 다르게 설정합니다
    if (badRate <= 20) {
      improveLines.push(`⚠️ 자세 오류 비율 ${badRate}%로 대체로 양호하지만, 아래 항목을 조금 더 신경써주세요.`);
    } else if (badRate <= 50) {
      improveLines.push(`⚠️ 자세 오류 비율 ${badRate}%. 세션 후반부 타임랩스를 확인하면 자세가 무너지는 시점을 확인할 수 있어요.`);
    } else {
      improveLines.push(`🚨 자세 오류 비율 ${badRate}%. 타임랩스 전반에 걸쳐 자세 교정이 필요한 구간이 많아요.`);
    }

    // TOP 2 불량 자세에 대한 상세 교정 가이드를 추가합니다
    topBadList.forEach(([type, count]) => {
      const advice = POSE_ADVICE[type];
      if (advice) {
        improveLines.push(`💡 [${POSE_LABELS[type]} ${count}회] ${advice.detail}`);
      }
    });

    // 자세 조합 패턴 분석 결과를 추가합니다 (null이면 생략)
    const pattern = getPatternDiagnosis(poseCount, total);
    if (pattern) improveLines.push(pattern);
  }

  // 소음이 높은 경우에만 보완 섹션에 소음 경고를 추가합니다
  if (avgDecibel >= 50) {
    const noiseComment = getNoiseComment(avgDecibel);
    if (noiseComment) improveLines.push(noiseComment);
  }

  // 집중 시간에 따른 다음 세션 목표를 제시합니다
  if (dur > 0 && dur < 25) {
    improveLines.push('🎯 다음 목표: 포모도로 1세트(25분) 완성을 목표로 해봐요!');
  } else if (dur >= 90) {
    improveLines.push('🎯 장시간 집중 후에는 반드시 15분 이상 충분히 휴식하세요. 지속 가능한 집중 습관이 중요해요.');
  }

  const 보완사항 = improveLines.join('\n');

  // ── ④ 집중 태그 생성 ─────────────────────────────────
  const 집중태그 = generateTags(session, poseCount, avgDecibel, maxStreak, badRate);

  // ── Gemini와 동일한 JSON 구조로 직렬화하여 반환 ───────
  // null, 2 : 가독성을 위해 들여쓰기 2칸으로 JSON을 포맷팅합니다
  return JSON.stringify({
    오늘의총평,
    긍정분석,
    보완사항,
    집중태그,
  }, null, 2);
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수를 다른 파일에서 require()로 사용할 수 있게 합니다.
    - generateAIFeedback : 리포트 컨트롤러에서 AI 피드백 생성 시 호출
                           내부적으로 Gemini API → 실패 시 fallbackFeedback 순으로 동작
*/
module.exports = { generateAIFeedback };
