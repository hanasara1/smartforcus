// server/src/controllers/user.controller.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  bcryptjs : 비밀번호를 안전하게 암호화(해싱)하고 비교하는 라이브러리입니다.
             비밀번호 변경 시 현재 비밀번호 검증과 새 비밀번호 해싱에 사용합니다.
*/
const bcrypt = require('bcryptjs');

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');

/*
  getRankingFromCache : 매번 DB를 조회하지 않고 메모리 캐시에서 랭킹 데이터를 꺼내는 함수입니다.
                        캐시가 비어있으면 null을 반환합니다.
*/
const { getRankingFromCache } = require('../cache/ranking.cache');


// ────────────────────────────────────────────────
// 👤 내 정보 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/users/me

  [역할]
  현재 로그인한 유저의 기본 정보와 보유 포인트 합계를 함께 조회합니다.

  [처리 순서]
    1. users 테이블에서 현재 유저 정보를 조회합니다.
    2. points 테이블을 LEFT JOIN하여 포인트 내역을 합산합니다.
    3. 유저 정보가 없으면 404를 반환합니다.

  ▼ SQL 핵심 설명 ▼
    LEFT JOIN : 포인트 내역이 없는 유저도 결과에 포함합니다.
                포인트 내역이 없으면 SUM 결과가 NULL이 되므로 COALESCE로 0으로 대체합니다.
    GROUP BY  : LEFT JOIN 후 SUM 집계를 위해 유저 단위로 묶습니다.

  @returns 200 : 유저 기본 정보 + 보유 포인트 합계(total_points)
           404 : 유저 없음
*/
const getMe = async (req, res, next) => {
  try {
    const pool = getPool();

    /*
      users와 points를 LEFT JOIN하여 유저 정보와 포인트 합계를 한 번의 쿼리로 가져옵니다.
      포인트 차감 내역은 음수(-)로 저장되어 있어 SUM하면 실제 잔액이 자동으로 계산됩니다.
    */
    const [[user]] = await pool.query(
      `SELECT u.user_idx, u.email, u.nick, u.created_at,
              COALESCE(SUM(p.reward_point), 0) AS total_points
       FROM users u
       LEFT JOIN points p ON p.user_idx = u.user_idx
       WHERE u.user_idx = ?
       GROUP BY u.user_idx`,
      [req.user.user_idx]   // JWT 미들웨어가 주입한 현재 유저 ID 사용
    );

    // 해당 유저가 DB에 존재하지 않으면 404 반환
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });

    res.json({ success: true, data: user });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// ✏️ 내 정보 수정 컨트롤러
// ────────────────────────────────────────────────

/*
  PUT /api/users/me

  [역할]
  현재 로그인한 유저의 닉네임 또는 비밀번호를 수정합니다.
  요청 바디에 포함된 필드 조합에 따라 아래 세 가지 경우로 분기합니다.

  [처리 분기]
    ① newPwd 있음 + currentPwd 있음 : 현재 비밀번호 검증 후 비밀번호 변경
                                       nick도 함께 있으면 닉네임도 동시 변경
    ② newPwd 없음 + nick 있음        : 닉네임만 변경
    ③ 둘 다 없음                     : 변경할 내용 없음 → 400 반환

  ▼ 비밀번호 변경 보안 처리 ▼
    현재 비밀번호(currentPwd)를 반드시 검증한 뒤에만 새 비밀번호를 저장합니다.
    새 비밀번호는 bcrypt.hash로 해싱하여 저장하며 평문은 절대 저장하지 않습니다.

  @param {string} [req.body.nick]        - 변경할 닉네임 (선택)
  @param {string} [req.body.currentPwd]  - 현재 비밀번호 (newPwd 변경 시 필수)
  @param {string} [req.body.newPwd]      - 변경할 새 비밀번호 (선택)
  @returns 200 : 수정 성공
           400 : 현재 비밀번호 누락 / 불일치 / 변경 내용 없음
*/
const updateMe = async (req, res, next) => {
  try {
    const pool = getPool();

    // 요청 바디에서 닉네임, 현재 비밀번호, 새 비밀번호를 꺼냅니다
    const { nick, currentPwd, newPwd } = req.body;

    // 현재 유저의 비밀번호 해시와 닉네임을 DB에서 조회합니다
    const [[user]] = await pool.query(
      'SELECT pwd, nick FROM users WHERE user_idx = ?',
      [req.user.user_idx]
    );

    // ── ① 비밀번호 변경 처리 ─────────────────────────────
    if (newPwd) {

      // 새 비밀번호를 변경하려면 현재 비밀번호가 반드시 필요합니다
      if (!currentPwd) {
        return res.status(400).json({
          success: false,
          message: '현재 비밀번호를 입력해주세요.',
        });
      }

      /*
        bcrypt.compare(입력값, 해시값) :
          입력된 평문 비밀번호를 내부적으로 해싱하여 DB의 해시와 비교합니다.
          일치하면 true, 아니면 false를 반환합니다.
      */
      const match = await bcrypt.compare(currentPwd, user.pwd);
      if (!match) {
        return res.status(400).json({
          success: false,
          message: '현재 비밀번호가 틀렸습니다.',
        });
      }

      // 새 비밀번호를 bcrypt로 해싱합니다 (saltRounds 12 = 보안 강도)
      const hashed = await bcrypt.hash(newPwd, 12);

      if (nick) {
        // nick도 함께 요청된 경우 비밀번호와 닉네임을 한 번에 변경합니다
        await pool.query(
          'UPDATE users SET nick = ?, pwd = ? WHERE user_idx = ?',
          [nick, hashed, req.user.user_idx]
        );
      } else {
        // nick이 없으면 비밀번호만 변경합니다
        await pool.query(
          'UPDATE users SET pwd = ? WHERE user_idx = ?',
          [hashed, req.user.user_idx]
        );
      }

    // ── ② 닉네임만 변경 ──────────────────────────────────
    } else if (nick) {
      await pool.query(
        'UPDATE users SET nick = ? WHERE user_idx = ?',
        [nick, req.user.user_idx]
      );

    // ── ③ 변경할 내용 없음 ───────────────────────────────
    } else {
      // nick도 newPwd도 없으면 변경할 내용이 없으므로 400을 반환합니다
      return res.status(400).json({
        success: false,
        message: '변경할 내용이 없습니다.',
      });
    }

    res.json({ success: true, message: '회원 정보가 수정되었습니다.' });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📈 마이페이지 종합 통계 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/users/me/stats

  [역할]
  현재 로그인한 유저의 마이페이지에 표시할 종합 통계를 반환합니다.
  전체 집계 지표 4가지와 최근 7일간의 일별 집중 기록을 함께 반환합니다.

  [반환 지표]
    - session_count  : 전체 집중 세션 수
    - total_minutes  : 종료된 세션의 총 집중 시간 합계 (분)
    - avg_score      : 전체 세션의 평균 집중 점수 (소수점 반올림)
    - total_points   : 현재 보유 포인트 잔액 합계
    - weekly         : 최근 7일 일별 평균 점수 및 세션 수 배열

  ▼ weekly 쿼리 핵심 설명 ▼
    DATE_FORMAT(imm_date, '%Y-%m-%d') : 날짜를 문자열로 고정하여
      JS로 반환 시 UTC 변환으로 날짜가 하루 밀리는 문제를 방지합니다.
    DATE_SUB(CURDATE(), INTERVAL 7 DAY) : 오늘 기준 7일 전부터 필터링합니다.
    imm_score > 0 AND end_time > '00:00:00' : 정상적으로 완료된 세션만 집계합니다.

  @returns 200 : 종합 통계 객체 { session_count, total_minutes, avg_score, total_points, weekly }
*/
const getMyStats = async (req, res, next) => {
  try {
    const pool = getPool();
    const uid = req.user.user_idx;  // JWT 미들웨어가 주입한 현재 유저 ID

    // ── 전체 집중 세션 수 조회 ───────────────────────────
    // 종료 여부와 무관하게 생성된 모든 세션 수를 셉니다
    const [[{ session_count }]] = await pool.query(
      'SELECT COUNT(*) AS session_count FROM immersions WHERE user_idx = ?',
      [uid]
    );

    // ── 총 집중 시간 조회 ────────────────────────────────
    /*
      TIMESTAMPDIFF(MINUTE, 시작, 종료) : 두 시각의 차이를 분 단위로 계산합니다.
      CONCAT으로 날짜와 시각을 합쳐 온전한 datetime 형식으로 만든 뒤 비교합니다.
      end_time > '00:00:00' 조건으로 정상 종료된 세션만 포함합니다.
      COALESCE(..., 0) : 세션이 없어 SUM 결과가 NULL이면 0으로 대체합니다.
    */
    const [[{ total_minutes }]] = await pool.query(
      `SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE,
          CONCAT(imm_date,' ',start_time),
          CONCAT(imm_date,' ',end_time))),0) AS total_minutes
       FROM immersions
       WHERE user_idx = ?
         AND end_time > '00:00:00'`,   // 종료된 세션만 집계
      [uid]
    );

    // ── 평균 집중 점수 조회 ──────────────────────────────
    // AVG(imm_score) : 모든 세션의 평균 점수를 계산합니다. 세션이 없으면 COALESCE로 0 처리합니다
    const [[{ avg_score }]] = await pool.query(
      'SELECT COALESCE(AVG(imm_score),0) AS avg_score FROM immersions WHERE user_idx = ?',
      [uid]
    );

    // ── 총 포인트 잔액 조회 ──────────────────────────────
    // 포인트 차감 내역은 음수(-)로 저장되어 SUM하면 실제 잔액이 자동으로 계산됩니다
    const [[{ total_points }]] = await pool.query(
      'SELECT COALESCE(SUM(reward_point),0) AS total_points FROM points WHERE user_idx = ?',
      [uid]
    );

    // ── 최근 7일 일별 집중 기록 조회 ────────────────────
    /*
      DATE_FORMAT으로 날짜를 문자열로 고정하여 UTC 변환 문제를 방지합니다.
      ROUND(AVG(imm_score), 0) : 평균 점수를 정수로 반올림합니다.
      GROUP BY로 날짜별로 묶어 일별 평균 점수와 세션 수를 집계합니다.
    */
    const [weekly] = await pool.query(
      `SELECT
        DATE_FORMAT(imm_date, '%Y-%m-%d') AS imm_date,
        ROUND(AVG(imm_score), 0)          AS avg_score,
        COUNT(*)                           AS cnt
       FROM immersions
       WHERE user_idx = ?
         AND imm_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)  -- 최근 7일 필터
         AND end_time > '00:00:00'                             -- 완료된 세션만
         AND imm_score > 0                                     -- 유효한 점수가 있는 세션만
       GROUP BY DATE_FORMAT(imm_date, '%Y-%m-%d')
       ORDER BY imm_date ASC`,   // 날짜 오름차순 정렬 (오래된 날짜 → 최근 날짜)
      [uid]
    );

    res.json({
      success: true,
      data: {
        session_count,
        total_minutes,
        avg_score    : Math.round(avg_score),   // 소수점 없이 반올림하여 반환
        total_points,
        weekly,
      },
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 🧍 취약 자세 Top 3 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/users/me/pose-stats

  [역할]
  현재 로그인한 유저의 전체 세션에서 가장 많이 발생한 불량 자세 유형 상위 3개를 반환합니다.
  클라이언트에서 유저의 취약 자세 패턴을 시각화하는 데 사용됩니다.

  [처리 순서]
    1. poses 테이블과 immersions 테이블을 JOIN하여 현재 유저의 자세 데이터만 필터링합니다.
    2. NORMAL(정상 자세)과 GOOD 상태를 제외한 불량 자세만 집계합니다.
    3. pose_type별로 count 합계를 구하고 내림차순으로 정렬하여 상위 3개만 반환합니다.

  ▼ 서브쿼리(인라인 뷰) 사용 이유 ▼
    외부 쿼리에서 GROUP BY pose_type으로 유형별 합산을 수행하기 위해
    내부 서브쿼리에서 먼저 개별 행 데이터를 정규화합니다.
    CASE WHEN 구문은 향후 자세 유형 매핑 변경에 대비한 확장 포인트입니다.

  ▼ 필터 조건 ▼
    pose_type != 'NORMAL' : 정상 자세 데이터는 취약 자세 분석에서 제외합니다.
    pose_status != 'GOOD' : 좋은 상태로 분류된 자세도 제외합니다.

  @returns 200 : 불량 자세 유형별 누적 횟수 배열 (최대 3개, 내림차순)
*/
const getMyPoseStats = async (req, res, next) => {
  try {
    const pool = getPool();
    const uid = req.user.user_idx;  // JWT 미들웨어가 주입한 현재 유저 ID

    /*
      서브쿼리(normalized)에서 개별 자세 행을 꺼내고,
      외부 쿼리에서 pose_type별로 count를 합산하여 취약 자세 순위를 계산합니다.
      LIMIT 3 : 상위 3개 취약 자세만 반환합니다.
    */
    const [rows] = await pool.query(
      `SELECT
        pose_type,
        SUM(total_count) AS total_count
       FROM (
         SELECT
           CASE
             WHEN p.pose_type IN ('TURTLE', 'SLUMP', 'TILT', 'CHIN', 'STATIC')
               THEN p.pose_type
             ELSE p.pose_type
           END AS pose_type,
           p.count AS total_count   -- 각 자세 유형의 감지 횟수
         FROM poses p
         JOIN immersions i ON p.imm_idx = i.imm_idx
         WHERE i.user_idx = ?
           AND p.pose_type != 'NORMAL'    -- 정상 자세 제외
           AND p.pose_status != 'GOOD'    -- 좋은 상태 제외
       ) AS normalized
       GROUP BY pose_type
       ORDER BY total_count DESC   -- 가장 많이 발생한 불량 자세 순으로 정렬
       LIMIT 3`,
      [uid]
    );

    res.json({ success: true, data: rows });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 🏆 랭킹 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/users/ranking

  [역할]
  메모리 캐시에서 랭킹 데이터를 읽어 반환합니다.
  매 요청마다 DB를 조회하지 않고 캐시를 사용하므로 응답 속도가 빠릅니다.
  캐시 데이터에서 현재 유저의 순위와 TOP 10 목록을 추출하여 반환합니다.

  ▼ 캐시 미준비 처리 ▼
    서버 시작 직후 캐시가 아직 채워지지 않았거나 갱신 중인 경우
    getRankingFromCache가 null을 반환합니다.
    이때 503(Service Unavailable)을 반환하여 클라이언트가 재시도할 수 있도록 안내합니다.

  @returns 200 : 랭킹 데이터 { top10, myRank, myData, isInTop10, updatedAt }
           503 : 캐시 데이터 미준비 (서버 시작 직후 등)
*/
const getRanking = async (req, res, next) => {
  try {
    const uid = req.user.user_idx;  // JWT 미들웨어가 주입한 현재 유저 ID

    // 캐시에서 현재 유저 기준 랭킹 데이터를 꺼냅니다
    const result = getRankingFromCache(uid);

    // 캐시가 아직 준비되지 않은 경우 503을 반환합니다
    if (!result) {
      return res.status(503).json({
        success: false,
        message: '랭킹 데이터를 준비 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }

    res.json({ success: true, data: result });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 🔥 출석 스트릭 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/users/me/streak

  [역할]
  현재 로그인한 유저의 출석 스트릭(연속 출석) 관련 통계를 반환합니다.
  연속 출석 여부를 계산하기 위해 JS에서 날짜를 직접 순회합니다.

  [반환 지표]
    - current_streak     : 현재 연속 출석 일수
    - max_streak         : 전체 기간 최장 연속 출석 일수
    - monthly_count      : 이번 달 출석 횟수
    - total_count        : 전체 출석 횟수
    - attendance_dates   : 최근 12주(84일)간 출석한 날짜 목록 (캘린더 UI용)

  [처리 순서]
    ① 최근 84일간 출석 날짜 목록을 조회하여 Set으로 변환합니다.
    ② 오늘부터 과거로 날짜를 순회하며 현재 연속 출석일을 계산합니다.
    ③ 전체 출석 내역으로 최장 연속 출석일을 계산합니다.
    ④ 이번 달 출석 횟수를 조회합니다.
    ⑤ 전체 출석 횟수를 조회합니다.

  ▼ 현재 연속 출석일(currentStreak) 계산 방식 ▼
    오늘(i=0)부터 하루씩 과거로 이동하며 출석 Set에 포함되는지 확인합니다.
    i=0(오늘)에 출석 기록이 없으면 아직 출석 전일 수 있으므로 continue로 건너뜁니다.
    이후 날짜가 Set에 없으면 연속이 끊긴 것으로 판단하고 break합니다.

  ▼ UTC 변환 방지 ▼
    new Date(dateStr).toISOString()으로 날짜 문자열을 만들면
    타임존 차이로 날짜가 하루 밀릴 수 있습니다.
    대신 getFullYear(), getMonth(), getDate()로 직접 조합하여 로컬 기준 날짜 문자열을 생성합니다.

  ▼ 최장 연속 출석일(maxStreak) 계산 방식 ▼
    날짜 배열을 순서대로 순회하며 이전 날짜와 하루 차이(diff === 1)이면 tempStreak를 증가시키고,
    차이가 1이 아니면 maxStreak를 갱신하고 tempStreak를 1로 초기화합니다.
    루프 종료 후 마지막 streak가 반영되지 않는 것을 방지하기 위해 루프 밖에서 한 번 더 갱신합니다.

  @returns 200 : 출석 스트릭 통계 객체
                 (출석 기록이 없어도 0과 빈 배열로 정상 응답)
*/
const getMyStreak = async (req, res, next) => {
  try {
    const pool = getPool();
    const uid = req.user.user_idx;  // JWT 미들웨어가 주입한 현재 유저 ID

    // ── ① 최근 12주(84일)간 출석 날짜 목록 조회 ─────────
    /*
      reward_type = 'daily_login' : 출석 체크로 지급된 포인트 내역만 필터링합니다.
      DISTINCT : 같은 날 중복 출석 기록이 있더라도 날짜를 하나만 셉니다.
      84일 분량만 조회하는 이유는 캘린더 UI(최근 12주)에 필요한 데이터만 반환하기 위해서입니다.
    */
    const [attendanceDays] = await pool.query(
      `SELECT DISTINCT DATE_FORMAT(earned_at, '%Y-%m-%d') AS att_date
       FROM points
       WHERE user_idx = ?
         AND reward_type = 'daily_login'
         AND earned_at >= DATE_SUB(CURDATE(), INTERVAL 84 DAY)
       ORDER BY att_date ASC`,
      [uid]
    );

    // 날짜 문자열을 Set으로 변환하여 O(1) 빠른 조회가 가능하게 합니다
    const attendSet = new Set(attendanceDays.map(r => r.att_date));

    // ── ② 현재 연속 출석일 계산 ──────────────────────────
    let currentStreak = 0;

    if (attendSet.size > 0) {
      const today = new Date();

      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);  // 오늘(i=0)부터 하루씩 과거로 이동

        /*
          UTC 변환 방지 : toISOString() 대신 로컬 날짜 값을 직접 조합합니다.
          padStart(2, '0') : 월/일이 한 자리 숫자일 때 앞에 0을 붙입니다. (예: 1 → '01')
        */
        const dateStr = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, '0'),  // getMonth()는 0부터 시작하므로 +1
          String(d.getDate()).padStart(2, '0'),
        ].join('-');

        if (attendSet.has(dateStr)) {
          currentStreak++;  // 해당 날짜에 출석 기록이 있으면 연속 횟수 증가
        } else {
          // i=0(오늘)에 기록이 없으면 아직 오늘 출석 전일 수 있으므로 건너뜁니다
          if (i === 0) continue;
          break;  // 오늘 이전 날짜에 기록이 없으면 연속이 끊긴 것으로 판단하고 종료합니다
        }
      }
    }

    // ── ③ 최장 연속 출석일 계산 ──────────────────────────
    /*
      84일 제한 없이 전체 출석 기록을 기준으로 최장 연속 출석일을 계산합니다.
      캘린더 표시용(84일)과 최장 기록 계산용(전체)을 분리하여 정확한 기록을 보장합니다.
    */
    const [allDays] = await pool.query(
      `SELECT DISTINCT DATE_FORMAT(earned_at, '%Y-%m-%d') AS att_date
       FROM points
       WHERE user_idx = ?
         AND reward_type = 'daily_login'
       ORDER BY att_date ASC`,
      [uid]
    );

    let maxStreak  = 0;  // 최장 연속 출석일 (최종 결과)
    let tempStreak = 0;  // 현재 연속 중인 임시 카운터
    let prevDate   = null;  // 이전에 확인한 날짜 (하루 차이 비교용)

    for (const { att_date } of allDays) {
      const curr = new Date(att_date);

      if (prevDate) {
        /*
          두 날짜의 차이를 밀리초 → 일 단위로 변환합니다.
          (1000ms × 60s × 60m × 24h = 하루의 밀리초)
          diff === 1 이면 전날과 연속입니다.
        */
        const diff = (curr - prevDate) / (1000 * 60 * 60 * 24);

        if (diff === 1) {
          tempStreak++;  // 연속이면 임시 카운터 증가
        } else {
          maxStreak  = Math.max(maxStreak, tempStreak);  // 연속이 끊기면 최장 기록 갱신
          tempStreak = 1;  // 새로운 연속 시작
        }
      } else {
        tempStreak = 1;  // 첫 번째 날짜이므로 1로 초기화
      }

      prevDate = curr;
    }
    // 루프 종료 후 마지막 streak가 반영되지 않는 것을 방지하기 위해 한 번 더 비교합니다
    maxStreak = Math.max(maxStreak, tempStreak);

    // ── ④ 이번 달 출석 횟수 조회 ─────────────────────────
    /*
      COUNT(DISTINCT DATE(earned_at)) : 같은 날 중복 기록을 제외하고 날짜 단위로 셉니다.
      YEAR, MONTH 조건으로 현재 달의 기록만 필터링합니다.
    */
    const [[{ monthly_count }]] = await pool.query(
      `SELECT COUNT(DISTINCT DATE(earned_at)) AS monthly_count
       FROM points
       WHERE user_idx = ?
         AND reward_type = 'daily_login'
         AND YEAR(earned_at)  = YEAR(CURDATE())
         AND MONTH(earned_at) = MONTH(CURDATE())`,
      [uid]
    );

    // ── ⑤ 전체 출석 횟수 조회 ───────────────────────────
    // 가입 이후 전체 기간의 출석 날짜 수를 셉니다
    const [[{ total_count }]] = await pool.query(
      `SELECT COUNT(DISTINCT DATE(earned_at)) AS total_count
       FROM points
       WHERE user_idx = ?
         AND reward_type = 'daily_login'`,
      [uid]
    );

    // ── 최종 응답 ────────────────────────────────────────
    /*
      출석 기록이 전혀 없는 신규 유저도 오류 없이 응답받을 수 있도록
      Number(...) || 0 으로 모든 숫자 값에 기본값 0을 보장합니다.
    */
    res.json({
      success: true,
      data: {
        current_streak   : currentStreak,
        max_streak       : maxStreak,
        monthly_count    : Number(monthly_count) || 0,
        total_count      : Number(total_count) || 0,
        attendance_dates : attendanceDays.map(r => r.att_date),  // 캘린더 UI용 날짜 배열
      },
    });

  } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - getMe          : 내 기본 정보 조회 라우터에 연결
    - updateMe       : 내 정보 수정 라우터에 연결
    - getMyStats     : 마이페이지 종합 통계 조회 라우터에 연결
    - getMyPoseStats : 취약 자세 Top 3 조회 라우터에 연결
    - getRanking     : 랭킹 조회 라우터에 연결
    - getMyStreak    : 출석 스트릭 조회 라우터에 연결
*/
module.exports = { getMe, updateMe, getMyStats, getMyPoseStats, getRanking, getMyStreak };
