// server/src/services/feedback.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const POSE_LABELS = {
  NORMAL: '바른 자세',
  TURTLE: '거북목',
  SLUMP: '엎드림',
  TILT: '몸 기울어짐',
  CHIN: '턱 괴기',
  STATIC: '장시간 고정 자세',
};

// ── 자세별 교정 가이드 (상세화)
const POSE_ADVICE = {
  TURTLE: {
    short: '귀와 어깨가 일직선이 되도록 턱을 살짝 당겨주세요.',
    detail:
      '거북목은 목 뒤 근육에 최대 3배의 하중을 줍니다. ' +
      '모니터 상단이 눈높이와 같도록 화면 높이를 조절하고, ' +
      '1시간마다 목을 좌우로 천천히 돌리는 스트레칭을 해주세요.',
  },
  SLUMP: {
    short: '골반을 세우고 등받이에 허리를 밀착시켜주세요.',
    detail:
      '엎드리거나 구부정한 자세는 허리 디스크에 직접적인 압박을 줍니다. ' +
      '의자 깊숙이 앉아 골반을 곧게 세우고, ' +
      '허리와 등받이 사이에 작은 쿠션을 받쳐보세요.',
  },
  TILT: {
    short: '양쪽 엉덩이에 체중을 균등하게 분산해주세요.',
    detail:
      '몸이 한쪽으로 기울어지면 척추 측만증으로 이어질 수 있습니다. ' +
      '발바닥이 바닥에 평평하게 닿도록 의자 높이를 조절하고, ' +
      '턱과 코의 중심이 배꼽 위에 오도록 의식적으로 교정해주세요.',
  },
  CHIN: {
    short: '손으로 턱 괴는 습관을 의식적으로 줄여보세요.',
    detail:
      '턱 괴기는 집중력이 저하될 때 무의식적으로 나타나는 신호입니다. ' +
      '팔꿈치 받침대 높이를 낮추거나 제거하고, ' +
      '짧은 휴식을 취한 뒤 다시 집중하는 패턴을 만들어보세요.',
  },
  STATIC: {
    short: '20분마다 자리에서 일어나 간단한 스트레칭을 해주세요.',
    detail:
      '장시간 같은 자세는 혈액순환을 방해하고 근육을 굳게 만듭니다. ' +
      '20-20-20 규칙(20분 집중 후 20초간 20피트 거리 응시)을 활용하고, ' +
      '스탠딩 데스크나 발 받침대 사용도 고려해보세요.',
  },
};

// ── 집중 시간대별 메시지
const getTimeComment = (durationMin) => {
  if (durationMin === 0) return null;
  if (durationMin < 10) return `⏱️ ${durationMin}분 집중하셨어요. 짧은 세션이지만 시작이 반입니다!`;
  if (durationMin < 25) return `⏱️ ${durationMin}분 집중하셨어요. 포모도로 1세트까지 조금 더 도전해보세요!`;
  if (durationMin < 50) return `⏱️ ${durationMin}분 집중! 포모도로 1세트 완성, 좋은 리듬입니다. 👍`;
  if (durationMin < 90) return `⏰ ${durationMin}분 집중! 충분히 집중하셨으니 10분 휴식을 권장해요.`;
  return `🏆 ${durationMin}분 장시간 집중! 반드시 충분한 휴식을 취해주세요.`;
};

// ── 점수별 총평 문구
const getScoreComment = (score) => {
  if (score >= 90) return { emoji: '🏆', msg: `${score}점! 오늘 집중력은 최상이었어요.` };
  if (score >= 80) return { emoji: '⭐', msg: `${score}점! 전반적으로 훌륭한 세션이었어요.` };
  if (score >= 65) return { emoji: '😊', msg: `${score}점. 양호한 집중 세션이었어요.` };
  if (score >= 50) return { emoji: '💪', msg: `${score}점. 아쉽지만 다음 세션에서 더 잘할 수 있어요!` };
  return { emoji: '🌱', msg: `${score}점. 자세 교정과 환경 개선에 집중해봐요.` };
};

// ── 소음 환경 코멘트
const getNoiseComment = (avgDecibel) => {
  if (avgDecibel <= 0) return null;
  if (avgDecibel >= 75) return `🔊 평균 소음이 ${avgDecibel.toFixed(1)}dB로 매우 높았어요. 조용한 환경에서 집중하면 효율이 크게 오릅니다.`;
  if (avgDecibel >= 55) return `🔉 평균 소음 ${avgDecibel.toFixed(1)}dB. 약간 소음이 있었어요. 귀마개나 백색소음 활용을 추천드려요.`;
  return `🔇 평균 소음 ${avgDecibel.toFixed(1)}dB의 조용한 환경에서 집중하셨네요. 최적의 환경이에요!`;
};

// ── 연속 바른 자세 streak 코멘트
const getStreakComment = (maxGoodStreakSec) => {
  if (!maxGoodStreakSec || maxGoodStreakSec <= 0) return null;
  const min = Math.floor(maxGoodStreakSec / 60);
  const sec = maxGoodStreakSec % 60;
  const label = min > 0 ? `${min}분 ${sec}초` : `${sec}초`;

  if (maxGoodStreakSec >= 1800) return `🦅 최대 ${label} 연속 바른 자세 유지! 자세 마스터 수준이에요.`;
  if (maxGoodStreakSec >= 600)  return `✅ 최대 ${label} 연속으로 바른 자세를 유지하셨어요!`;
  if (maxGoodStreakSec >= 180)  return `🙂 최대 ${label} 연속 바른 자세. 조금씩 늘려가봐요!`;
  return `💡 최대 ${label} 연속 바른 자세. 자세를 좀 더 의식하며 집중해보세요.`;
};

// ── 자세 조합 패턴 특별 진단
const getPatternDiagnosis = (poseCount, total) => {
  if (total === 0) return null;

  const turtleRate  = (poseCount.TURTLE || 0) / total;
  const chinRate    = (poseCount.CHIN   || 0) / total;
  const slumpRate   = (poseCount.SLUMP  || 0) / total;
  const staticRate  = (poseCount.STATIC || 0) / total;

  // 거북목 + 턱 괴기가 동시에 높은 경우
  if (turtleRate > 0.2 && chinRate > 0.15) {
    return '🔍 거북목과 턱 괴기가 함께 감지되었어요. 모니터 높이가 너무 낮을 가능성이 높습니다. 화면을 눈높이로 올려보세요.';
  }
  // 엎드림 + 장시간 고정이 동시에 높은 경우
  if (slumpRate > 0.2 && staticRate > 0.15) {
    return '🔍 구부정한 자세가 장시간 지속되었어요. 의자 등받이 각도를 100~110도로 조절하고 허리 쿠션을 활용해보세요.';
  }
  // 전반적으로 다양한 불량 자세가 고루 나온 경우
  const badTypes = Object.entries(poseCount)
    .filter(([type, count]) => type !== 'NORMAL' && count / total > 0.1)
    .length;
  if (badTypes >= 3) {
    return '🔍 다양한 자세 오류가 고르게 감지되었어요. 전반적인 자세 습관 개선이 필요해 보입니다. 정기적인 스트레칭 루틴을 만들어보세요.';
  }

  return null;
};

// ── 데이터 기반 동적 태그 생성
const generateTags = (session, poseCount, avgDecibel, maxGoodStreakSec, badRate) => {
  const tags = [];
  const dur  = session.duration_min || 0;

  if (session.imm_score >= 90) tags.push('#최고점수');
  else if (session.imm_score >= 80) tags.push('#우수한집중');

  if (badRate === 0) tags.push('#완벽한자세');
  else if (badRate <= 20) tags.push('#자세양호');
  else if (badRate <= 50) tags.push('#자세주의');
  else tags.push('#자세교정필요');

  if (maxGoodStreakSec >= 1800) tags.push('#자세마스터');
  else if (maxGoodStreakSec >= 600) tags.push('#연속바른자세');

  if (avgDecibel > 0 && avgDecibel < 45) tags.push('#최적환경');
  else if (avgDecibel >= 70) tags.push('#소음환경');

  if (dur >= 50) tags.push('#장시간집중');
  else if (dur >= 25) tags.push('#포모도로완성');

  if (poseCount.TURTLE > 0) tags.push('#거북목주의');
  if (poseCount.SLUMP  > 0) tags.push('#허리자세점검');

  tags.push('#성장중');

  return tags.join(' ');
};


/**
 * Gemini API로 AI 피드백 생성
 */
const generateAIFeedback = async (session, poseCount = {}, avgDecibel = 0) => {
  try {
    const total = Object.values(poseCount).reduce((a, b) => a + b, 0);

    if (total === 0) {
      return JSON.stringify({
        오늘의총평: '자세 데이터가 없어 분석이 어려워요.',
        긍정분석: '세션을 완료하신 것만으로도 훌륭해요! 다음 세션에서는 카메라 앞에 상반신이 잘 보이도록 위치를 조정해보세요.',
        보완사항: '자세 감지 데이터가 수집되지 않았어요. 카메라 각도와 조명을 확인해주세요.',
        집중태그: '#세션완료 #환경점검필요 #성장중',
      }, null, 2);
    }

    const normalCount = poseCount.NORMAL || 0;
    const badCount    = total - normalCount;
    const badRate     = Math.round((badCount / total) * 100);

    const poseDetail = Object.entries(poseCount)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${POSE_LABELS[type] || type}: ${count}회`)
      .join(', ');

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

    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
    const result = await model.generateContent(prompt);
    const feedback = result.response.text();

    return feedback;

  } catch (err) {
    console.error('Gemini API 오류:', err.message);
    return fallbackFeedback(session, poseCount, avgDecibel);
  }
};


/**
 * ✅ 보강된 규칙 기반 자체 피드백
 * - Gemini와 동일한 JSON 구조로 반환
 * - max_good_streak, 자세 조합 패턴, 동적 태그 활용
 */
const fallbackFeedback = (session, poseCount = {}, avgDecibel = 0) => {

  const total        = Object.values(poseCount).reduce((a, b) => a + b, 0);
  const normalCount  = poseCount.NORMAL || 0;
  const badRate      = total > 0 ? Math.round(((total - normalCount) / total) * 100) : 0;
  const dur          = session.duration_min || 0;
  const maxStreak    = session.max_good_streak || 0; // 초 단위

  // ── 가장 많이 감지된 불량 자세 TOP 2
  const topBadList = Object.entries(poseCount)
    .filter(([type, count]) => type !== 'NORMAL' && count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2);

  // ── 각 섹션 조립
  // 1) 오늘의 총평
  const scoreComment = getScoreComment(session.imm_score);
  const 오늘의총평 = `${scoreComment.emoji} ${scoreComment.msg}`;

  // 2) 긍정 분석 (70%)
  const positiveLines = [];

  // 점수 칭찬
  if (session.imm_score >= 80) {
    positiveLines.push(`집중 점수 ${session.imm_score}점으로 매우 우수한 세션을 완료하셨어요.`);
  } else {
    positiveLines.push(`이번 세션 집중 점수는 ${session.imm_score}점이에요.`);
  }

  // 바른 자세 비율 칭찬
  const goodRate = 100 - badRate;
  if (goodRate === 100) {
    positiveLines.push('✅ 세션 내내 완벽한 자세를 유지하셨어요! 정말 훌륭합니다.');
  } else if (goodRate >= 80) {
    positiveLines.push(`✅ 전체 감지 중 ${goodRate}%를 바른 자세로 유지하셨어요. 매우 안정적인 자세 습관입니다.`);
  } else if (goodRate >= 60) {
    positiveLines.push(`🙂 전체 감지 중 ${goodRate}%가 바른 자세였어요. 절반 이상을 잘 유지하셨습니다.`);
  }

  // streak 칭찬
  const streakComment = getStreakComment(maxStreak);
  if (streakComment) positiveLines.push(streakComment);

  // 집중 시간 코멘트
  const timeComment = getTimeComment(dur);
  if (timeComment) positiveLines.push(timeComment);

  // 소음 환경 (조용한 경우에만 긍정 섹션에 포함)
  if (avgDecibel > 0 && avgDecibel < 50) {
    positiveLines.push(`🔇 평균 ${avgDecibel.toFixed(1)}dB의 조용한 환경에서 집중하셨어요. 최적의 학습 환경입니다!`);
  }

  const 긍정분석 = positiveLines.join('\n');

  // 3) 보완 사항 (30%)
  const improveLines = [];

  if (badRate === 0) {
    improveLines.push('이번 세션은 자세 면에서 완벽했어요! 다음 세션에서도 이 상태를 유지해봐요.');
  } else {
    // 자세 오류 비율 진단
    if (badRate <= 20) {
      improveLines.push(`⚠️ 자세 오류 비율 ${badRate}%로 대체로 양호하지만, 아래 항목을 조금 더 신경써주세요.`);
    } else if (badRate <= 50) {
      improveLines.push(`⚠️ 자세 오류 비율 ${badRate}%. 세션 후반부 타임랩스를 확인하면 자세가 무너지는 시점을 확인할 수 있어요.`);
    } else {
      improveLines.push(`🚨 자세 오류 비율 ${badRate}%. 타임랩스 전반에 걸쳐 자세 교정이 필요한 구간이 많아요.`);
    }

    // TOP 불량 자세별 상세 조언
    topBadList.forEach(([type, count]) => {
      const advice = POSE_ADVICE[type];
      if (advice) {
        improveLines.push(`💡 [${POSE_LABELS[type]} ${count}회] ${advice.detail}`);
      }
    });

    // 자세 조합 패턴 진단
    const pattern = getPatternDiagnosis(poseCount, total);
    if (pattern) improveLines.push(pattern);
  }

  // 소음 환경 (높은 경우에만 보완 섹션에 포함)
  if (avgDecibel >= 50) {
    const noiseComment = getNoiseComment(avgDecibel);
    if (noiseComment) improveLines.push(noiseComment);
  }

  // 집중 시간에 따른 다음 목표 제시
  if (dur > 0 && dur < 25) {
    improveLines.push('🎯 다음 목표: 포모도로 1세트(25분) 완성을 목표로 해봐요!');
  } else if (dur >= 90) {
    improveLines.push('🎯 장시간 집중 후에는 반드시 15분 이상 충분히 휴식하세요. 지속 가능한 집중 습관이 중요해요.');
  }

  const 보완사항 = improveLines.join('\n');

  // 4) 집중 태그
  const 집중태그 = generateTags(session, poseCount, avgDecibel, maxStreak, badRate);

  // ── Gemini와 동일한 JSON 구조로 반환
  return JSON.stringify({
    오늘의총평,
    긍정분석,
    보완사항,
    집중태그,
  }, null, 2);
};

module.exports = { generateAIFeedback };
