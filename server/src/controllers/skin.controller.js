// server/src/controllers/skin.controller.js


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

// getPool : DB 연결 풀을 가져오는 함수 (연결을 미리 여러 개 만들어 재사용하는 방식)
const { getPool } = require('../config/db.config');


// ────────────────────────────────────────────────
// 🎨 전체 스킨 목록 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/skins

  [역할]
  skins 테이블의 전체 스킨 목록을 조회하면서,
  현재 로그인한 유저의 보유 여부(is_owned)와 현재 적용 여부(is_active)를 함께 반환합니다.

  [처리 순서]
    1. skins 테이블 전체를 기준으로 user_skins 테이블을 LEFT JOIN합니다.
    2. 각 스킨에 대해 보유 여부와 활성화 여부를 계산합니다.
    3. 스킨 가격(skin_price) 오름차순으로 정렬하여 반환합니다.

  ▼ SQL 핵심 설명 ▼
    LEFT JOIN : skins 테이블을 기준으로, 유저가 보유하지 않은 스킨도 결과에 포함합니다.
                보유하지 않은 경우 user_skins의 컬럼은 NULL로 채워집니다.

    COALESCE(CASE WHEN ... END, 0) :
      CASE WHEN으로 보유·활성 여부를 1 또는 NULL로 계산하고,
      NULL인 경우 COALESCE로 0으로 대체합니다.
      → 미보유 스킨도 is_owned: 0, is_active: 0으로 명확하게 표현됩니다.

  @returns 200 : 스킨 목록 배열 (is_owned, is_active 포함, 가격 오름차순)
*/
const getSkinList = async (req, res, next) => {
    try {
        const pool = getPool();
        const uid = req.user.user_idx;  // JWT 미들웨어가 주입한 현재 유저 ID

        // skins 전체를 기준으로 현재 유저의 보유·활성 내역을 LEFT JOIN하여 조회합니다
        const [skins] = await pool.query(
            `SELECT
            s.*,
            COALESCE(
                CASE WHEN us.uskin_idx IS NOT NULL THEN 1 ELSE 0 END, 0
            ) AS is_owned,   -- 보유 여부 : uskin_idx가 있으면 1, 없으면 0
            COALESCE(
                CASE WHEN us.is_active = 1 THEN 1 ELSE 0 END, 0
            ) AS is_active   -- 현재 적용 여부 : is_active = 1이면 1, 아니면 0
            FROM skins s
            LEFT JOIN user_skins us
                ON us.skin_idx = s.skin_idx AND us.user_idx = ?
            ORDER BY s.skin_price ASC`,   // 저렴한 스킨부터 오름차순 정렬
            [uid]
        );

        res.json({ success: true, data: skins });

    } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// ✨ 현재 적용 중인 스킨 조회 컨트롤러
// ────────────────────────────────────────────────

/*
  GET /api/skins/active

  [역할]
  현재 로그인한 유저가 활성화한 스킨의 skin_key를 반환합니다.
  적용된 스킨이 없을 경우 기본값 'default'를 반환하여
  클라이언트가 항상 유효한 스킨 키를 받을 수 있도록 보장합니다.

  [처리 순서]
    1. user_skins 테이블에서 is_active = 1인 행을 조회합니다.
    2. skins 테이블을 JOIN하여 해당 스킨의 skin_key를 함께 가져옵니다.
    3. 결과가 없으면 'default'를 반환합니다.

  ▼ active?.skin_key || 'default' 설명 ▼
    active가 undefined(적용 스킨 없음)이면 ?. 연산자로 오류 없이 undefined를 반환하고,
    undefined는 falsy이므로 || 연산자로 'default'가 최종값으로 사용됩니다.

  @returns 200 : { skin_key: 현재 적용 스킨 키 } (없으면 'default')
*/
const getActiveSkin = async (req, res, next) => {
    try {
        const pool = getPool();
        const uid = req.user.user_idx;  // JWT 미들웨어가 주입한 현재 유저 ID

        /*
          user_skins를 기준으로 skins를 INNER JOIN하여
          현재 유저의 활성화된 스킨 키를 조회합니다.
          is_active = 1인 행이 없으면 active는 undefined가 됩니다.
        */
        const [[active]] = await pool.query(
            `SELECT s.skin_key
       FROM user_skins us
       JOIN skins s ON s.skin_idx = us.skin_idx
       WHERE us.user_idx = ? AND us.is_active = 1`,
            [uid]
        );

        // 적용된 스킨이 없으면 'default'를 반환하여 클라이언트가 기본 스킨을 표시하게 합니다
        res.json({ success: true, data: { skin_key: active?.skin_key || 'default' } });

    } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 🛒 스킨 구매 컨트롤러
// ────────────────────────────────────────────────

/*
  POST /api/skins/purchase

  [역할]
  유저가 보유한 포인트로 특정 스킨을 구매합니다.
  포인트 차감과 스킨 지급은 하나의 트랜잭션으로 처리하여
  중간에 오류가 생기더라도 데이터 불일치가 발생하지 않도록 합니다.
  무료 스킨(skin_price = 0)은 포인트 검증 및 차감 과정을 건너뜁니다.

  [처리 순서]
    1. 트랜잭션을 시작합니다.
    2. 구매하려는 스킨이 존재하는지 확인합니다.
    3. 이미 보유한 스킨인지 확인합니다.
    4. 유료 스킨(skin_price > 0)인 경우 포인트 잔액을 검증합니다.
    5. 유료 스킨인 경우 포인트를 차감합니다.
    6. 스킨을 지급합니다 (is_active = 0으로 지급, 적용은 별도 API에서 처리).
    7. 모두 성공하면 커밋, 하나라도 실패하면 롤백합니다.

  ▼ is_active = 0으로 지급하는 이유 ▼
    구매와 적용을 분리하여, 구매 직후에는 스킨을 보유만 한 상태로 처리합니다.
    실제 적용은 /api/skins/apply API를 별도로 호출해야 합니다.

  @param {number} req.body.skin_idx - 구매할 스킨의 고유 ID
  @returns 200 : 구매 성공 + skin_key
           400 : 이미 보유한 스킨 또는 포인트 부족
           404 : 스킨 없음
*/
const purchaseSkin = async (req, res, next) => {
    const pool = getPool();

    // 트랜잭션을 위해 단일 커넥션을 직접 꺼냅니다
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();  // 트랜잭션 시작 (이후 작업들을 하나의 묶음으로 처리)

        const uid = req.user.user_idx;  // JWT 미들웨어가 주입한 현재 유저 ID
        const { skin_idx } = req.body;  // 요청 바디에서 스킨 ID 추출

        // ── 스킨 존재 여부 확인 ──────────────────────────
        // 요청한 skin_idx에 해당하는 스킨이 DB에 존재하는지 확인합니다
        const [[skin]] = await conn.query(
            'SELECT * FROM skins WHERE skin_idx = ?', [skin_idx]
        );
        if (!skin) {
            await conn.rollback();  // 스킨이 없으면 트랜잭션 취소 후 404 반환
            return res.status(404).json({ success: false, message: '스킨을 찾을 수 없습니다.' });
        }

        // ── 보유 여부 확인 ───────────────────────────────
        // 같은 유저가 같은 스킨을 중복 구매하지 못하도록 이미 보유한 기록을 확인합니다
        const [[owned]] = await conn.query(
            'SELECT uskin_idx FROM user_skins WHERE user_idx = ? AND skin_idx = ?',
            [uid, skin_idx]
        );
        if (owned) {
            await conn.rollback();  // 이미 보유했으면 트랜잭션 취소 후 400 반환
            return res.status(400).json({ success: false, message: '이미 보유한 스킨입니다.' });
        }

        // ── 유료 스킨 포인트 검증 및 차감 ───────────────
        /*
          skin_price > 0인 유료 스킨만 포인트 관련 처리를 수행합니다.
          무료 스킨(skin_price = 0)은 아래 블록 전체를 건너뜁니다.
        */
        if (skin.skin_price > 0) {

            /*
              COALESCE(SUM(reward_point), 0) :
                points 테이블에서 해당 유저의 모든 포인트 내역을 합산합니다.
                포인트 차감 내역은 음수(-)로 저장되어 있어 SUM하면 실제 잔액이 계산됩니다.
                내역이 없어 SUM이 NULL이면 0으로 대체합니다.
            */
            const [[{ total_points }]] = await conn.query(
                'SELECT COALESCE(SUM(reward_point), 0) AS total_points FROM points WHERE user_idx = ?',
                [uid]
            );
            if (total_points < skin.skin_price) {
                await conn.rollback();  // 잔액 부족 시 트랜잭션 취소 후 400 반환
                return res.status(400).json({
                    success: false,
                    // 유저가 현재 보유 포인트와 필요 포인트를 한눈에 확인할 수 있도록 메시지에 포함합니다
                    message: `포인트가 부족합니다. (보유: ${total_points}P / 필요: ${skin.skin_price}P)`,
                });
            }

            /*
              포인트를 직접 수정하지 않고 음수값(-skin_price)을 새 행으로 INSERT합니다.
              이렇게 하면 포인트 내역(충전, 차감, 지급)이 모두 기록으로 남아 추적이 가능합니다.
              reward_type에 스킨 키를 포함시켜 어떤 스킨 구매로 차감됐는지 식별합니다.
            */
            await conn.query(
                `INSERT INTO points (user_idx, reward_type, reward_point) VALUES (?, ?, ?)`,
                [uid, `skin_purchase:${skin.skin_key}`, -skin.skin_price]  // 차감이므로 음수
            );
        }

        // ── 스킨 지급 ────────────────────────────────────
        /*
          is_active = 0으로 지급합니다.
          구매와 적용을 분리하여 구매 직후에는 보유 상태로만 처리하고,
          실제 적용은 /api/skins/apply에서 별도로 수행합니다.
        */
        await conn.query(
            'INSERT INTO user_skins (user_idx, skin_idx, is_active) VALUES (?, ?, 0)',
            [uid, skin_idx]
        );

        // ── 커밋 (모든 작업 성공 시 최종 반영) ──────────
        await conn.commit();

        res.json({
            success: true,
            message: `'${skin.skin_name}' 스킨을 구매했습니다!`,
            data: { skin_key: skin.skin_key },  // 구매한 스킨의 키를 함께 반환합니다
        });

    } catch (err) {
        // 예상치 못한 오류 발생 시 트랜잭션 전체를 되돌려 데이터 무결성을 지킵니다
        await conn.rollback();
        next(err);

    } finally {
        /*
          finally 블록 : 성공·실패 여부와 무관하게 반드시 실행됩니다.
          conn.release() : 사용한 커넥션을 풀에 반환합니다.
                           반환하지 않으면 커넥션이 고갈되어 서버 전체가 DB 요청을 처리하지 못합니다.
        */
        conn.release();
    }
};


// ────────────────────────────────────────────────
// 🖌️ 스킨 적용 컨트롤러
// ────────────────────────────────────────────────

/*
  PATCH /api/skins/apply

  [역할]
  유저가 보유한 스킨을 현재 적용 스킨으로 설정합니다.
  유료 스킨은 반드시 보유해야만 적용할 수 있으며,
  무료 스킨은 미보유 상태라도 자동으로 등록 후 활성화합니다.
  기존에 적용된 스킨은 모두 비활성화한 뒤 선택한 스킨만 활성화합니다.

  [처리 순서]
    1. 적용하려는 스킨이 존재하는지 확인합니다.
    2. 유료 스킨(skin_price > 0)이면서 미보유인 경우 403을 반환하여 차단합니다.
    3. 현재 유저의 모든 활성 스킨을 일괄 비활성화합니다.
    4. 보유 중인 스킨이면 is_active = 1로 업데이트합니다.
       보유하지 않은 무료 스킨이면 새 행을 INSERT하면서 바로 활성화합니다.

  ▼ 스킨 중복 활성화 방지 전략 ▼
    먼저 해당 유저의 모든 user_skins 행을 is_active = 0으로 일괄 초기화합니다.
    이후 선택한 스킨만 is_active = 1로 설정하므로, 항상 활성 스킨이 최대 1개임이 보장됩니다.

  ▼ 무료 스킨 자동 등록 ▼
    무료 스킨(skin_price = 0)은 구매 과정 없이 바로 적용할 수 있습니다.
    user_skins에 기록이 없으면 is_active = 1로 INSERT하여 보유와 활성화를 동시에 처리합니다.

  @param {number} req.body.skin_idx - 적용할 스킨의 고유 ID
  @returns 200 : 스킨 적용 성공 + skin_key
           403 : 유료 스킨 미보유
           404 : 스킨 없음
*/
const applySkin = async (req, res, next) => {
    try {
        const pool = getPool();
        const uid = req.user.user_idx;  // JWT 미들웨어가 주입한 현재 유저 ID
        const { skin_idx } = req.body;  // 요청 바디에서 적용할 스킨 ID 추출

        // ── 스킨 존재 여부 확인 ──────────────────────────
        // 요청한 skin_idx에 해당하는 스킨이 DB에 존재하는지 확인합니다
        const [[skin]] = await pool.query(
            'SELECT * FROM skins WHERE skin_idx = ?', [skin_idx]
        );
        if (!skin) {
            return res.status(404).json({ success: false, message: '스킨을 찾을 수 없습니다.' });
        }

        // ── 보유 여부 확인 ───────────────────────────────
        // user_skins 테이블에서 현재 유저가 이 스킨을 보유하고 있는지 조회합니다
        const [[owned]] = await pool.query(
            'SELECT uskin_idx FROM user_skins WHERE user_idx = ? AND skin_idx = ?',
            [uid, skin_idx]
        );

        // ── 유료 스킨 미보유 차단 ────────────────────────
        /*
          유료 스킨(skin_price > 0)인데 user_skins에 기록이 없으면 403을 반환합니다.
          무료 스킨(skin_price = 0)은 미보유 상태여도 아래에서 자동 등록 후 활성화합니다.
        */
        if (!owned && skin.skin_price > 0) {
            return res.status(403).json({
                success: false,
                message: '보유하지 않은 스킨입니다.',
            });
        }

        // ── 기존 활성 스킨 전체 비활성화 ────────────────
        /*
          선택한 스킨 하나만 활성화하기 위해
          먼저 해당 유저의 모든 스킨을 is_active = 0으로 초기화합니다.
          이렇게 하면 활성 스킨이 항상 최대 1개임이 보장됩니다.
        */
        await pool.query(
            'UPDATE user_skins SET is_active = 0 WHERE user_idx = ?', [uid]
        );

        if (owned) {
            // 이미 보유 중인 스킨이면 해당 행의 is_active만 1로 업데이트합니다
            await pool.query(
                'UPDATE user_skins SET is_active = 1 WHERE user_idx = ? AND skin_idx = ?',
                [uid, skin_idx]
            );
        } else {
            /*
              무료 스킨이면서 user_skins에 기록이 없는 경우입니다.
              is_active = 1로 새 행을 INSERT하여 보유 등록과 활성화를 한 번에 처리합니다.
            */
            await pool.query(
                'INSERT INTO user_skins (user_idx, skin_idx, is_active) VALUES (?, ?, 1)',
                [uid, skin_idx]
            );
        }

        res.json({
            success: true,
            message: '스킨이 적용되었습니다.',
            data: { skin_key: skin.skin_key },  // 적용된 스킨의 키를 함께 반환합니다
        });

    } catch (err) { next(err); }  // 예상치 못한 오류는 Express 에러 핸들러로 전달
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  module.exports : 이 파일의 함수들을 다른 파일에서 require()로 사용할 수 있게 합니다.
    - getSkinList  : 전체 스킨 목록 조회 라우터에 연결
    - getActiveSkin: 현재 적용 스킨 조회 라우터에 연결
    - purchaseSkin : 스킨 구매 라우터에 연결
    - applySkin    : 스킨 적용 라우터에 연결
*/
module.exports = { getSkinList, getActiveSkin, purchaseSkin, applySkin };
