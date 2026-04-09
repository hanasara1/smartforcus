// server/src/controllers/skin.controller.js
const { getPool } = require('../config/db.config');

/** GET /api/skins — 전체 스킨 목록 + 보유 여부 */
const getSkinList = async (req, res, next) => {
    try {
        const pool = getPool();
        const uid = req.user.user_idx;

        const [skins] = await pool.query(
            `SELECT
            s.*,
            COALESCE(
            CASE WHEN us.uskin_idx IS NOT NULL THEN 1 ELSE 0 END, 0
            ) AS is_owned,
            COALESCE(
            CASE WHEN us.is_active = 1 THEN 1 ELSE 0 END, 0
            ) AS is_active
            FROM skins s
            LEFT JOIN user_skins us
                ON us.skin_idx = s.skin_idx AND us.user_idx = ?
            ORDER BY s.skin_price ASC`,
            [uid]
        );

        res.json({ success: true, data: skins });
    } catch (err) { next(err); }
};

/** GET /api/skins/active — 현재 적용 중인 스킨 키 */
const getActiveSkin = async (req, res, next) => {
    try {
        const pool = getPool();
        const uid = req.user.user_idx;

        const [[active]] = await pool.query(
            `SELECT s.skin_key
       FROM user_skins us
       JOIN skins s ON s.skin_idx = us.skin_idx
       WHERE us.user_idx = ? AND us.is_active = 1`,
            [uid]
        );

        // 적용 스킨 없으면 default 반환
        res.json({ success: true, data: { skin_key: active?.skin_key || 'default' } });
    } catch (err) { next(err); }
};

/** POST /api/skins/purchase — 스킨 구매 */
const purchaseSkin = async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection(); // ✅ 커넥션 획득
    try {
        await conn.beginTransaction(); // ✅ 트랜잭션 시작

        const uid = req.user.user_idx;
        const { skin_idx } = req.body;

        const [[skin]] = await conn.query(
            'SELECT * FROM skins WHERE skin_idx = ?', [skin_idx]
        );
        if (!skin) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: '스킨을 찾을 수 없습니다.' });
        }

        const [[owned]] = await conn.query(
            'SELECT uskin_idx FROM user_skins WHERE user_idx = ? AND skin_idx = ?',
            [uid, skin_idx]
        );
        if (owned) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: '이미 보유한 스킨입니다.' });
        }

        if (skin.skin_price > 0) {
            const [[{ total_points }]] = await conn.query(
                'SELECT COALESCE(SUM(reward_point), 0) AS total_points FROM points WHERE user_idx = ?',
                [uid]
            );
            if (total_points < skin.skin_price) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `포인트가 부족합니다. (보유: ${total_points}P / 필요: ${skin.skin_price}P)`,
                });
            }
            // ✅ 포인트 차감
            await conn.query(
                `INSERT INTO points (user_idx, reward_type, reward_point) VALUES (?, ?, ?)`,
                [uid, `skin_purchase:${skin.skin_key}`, -skin.skin_price]
            );
        }

        // ✅ 스킨 지급
        await conn.query(
            'INSERT INTO user_skins (user_idx, skin_idx, is_active) VALUES (?, ?, 0)',
            [uid, skin_idx]
        );

        await conn.commit(); // ✅ 커밋
        res.json({
            success: true,
            message: `'${skin.skin_name}' 스킨을 구매했습니다!`,
            data: { skin_key: skin.skin_key },
        });
    } catch (err) {
        await conn.rollback(); // ✅ 오류 시 롤백
        next(err);
    } finally {
        conn.release(); // ✅ 커넥션 반환
    }
};

/** PATCH /api/skins/apply — 스킨 적용 */
const applySkin = async (req, res, next) => {
    try {
        const pool = getPool();
        const uid = req.user.user_idx;
        const { skin_idx } = req.body;

        const [[skin]] = await pool.query(
            'SELECT * FROM skins WHERE skin_idx = ?', [skin_idx]
        );
        if (!skin) {
            return res.status(404).json({ success: false, message: '스킨을 찾을 수 없습니다.' });
        }

        const [[owned]] = await pool.query(
            'SELECT uskin_idx FROM user_skins WHERE user_idx = ? AND skin_idx = ?',
            [uid, skin_idx]
        );

        // ✅ 유료 스킨인데 미보유 시 차단
        if (!owned && skin.skin_price > 0) {
            return res.status(403).json({
                success: false,
                message: '보유하지 않은 스킨입니다.',
            });
        }

        // ✅ 기존 활성 스킨 전체 비활성화
        await pool.query(
            'UPDATE user_skins SET is_active = 0 WHERE user_idx = ?', [uid]
        );

        if (owned) {
            // ✅ 보유 중이면 활성화
            await pool.query(
                'UPDATE user_skins SET is_active = 1 WHERE user_idx = ? AND skin_idx = ?',
                [uid, skin_idx]
            );
        } else {
            // ✅ 무료 스킨 미보유 시 자동 등록 후 활성화
            await pool.query(
                'INSERT INTO user_skins (user_idx, skin_idx, is_active) VALUES (?, ?, 1)',
                [uid, skin_idx]
            );
        }

        res.json({
            success: true,
            message: '스킨이 적용되었습니다.',
            data: { skin_key: skin.skin_key },
        });
    } catch (err) { next(err); }
};

module.exports = { getSkinList, getActiveSkin, purchaseSkin, applySkin };
