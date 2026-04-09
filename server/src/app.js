// server/src/app.js  ─  Express 앱 진입점
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const corsOptions = require('./config/cors.config');
const { connectDB } = require('./config/db.config');
const { initSocket } = require('./sockets');
const logger = require('./utils/logger');
const { seedBadges } = require('./services/badge.seed');
const { startRankingCron } = require('./cache/ranking.cache');

// ── 라우터
const authRouter = require('./routes/auth.routes');
const userRouter = require('./routes/user.routes');
const immersionRouter = require('./routes/immersion.routes');
const reportRouter = require('./routes/report.routes');
const badgeRouter = require('./routes/badge.routes');
const pointRouter = require('./routes/point.routes');

// ✅ 기존 라우트들 아래에 추가
const timelapseRoute = require('./routes/timelapse.route');

const skinRouter = require('./routes/skin.routes');

const app = express();
const httpServer = http.createServer(app);

initSocket(httpServer);

// ── 글로벌 미들웨어
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ src 폴더의 상위인 server 폴더의 uploads를 가리켜야 함
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── API 라우터
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/immersions', immersionRouter);
app.use('/api/reports', reportRouter);
app.use('/api/badges', badgeRouter);
app.use('/api/points', pointRouter);
app.use('/api/timelapses', timelapseRoute);
app.use('/api/skins', skinRouter);

// ── 헬스체크
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// ── 404
app.use((_req, res) => res.status(404).json({ success: false, message: '요청한 경로를 찾을 수 없습니다.' }));

// ── 전역 에러 핸들러
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error(err.stack || err.message);

  // ✅ MySQL 에러 코드별 분기
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: '이미 존재하는 데이터입니다.',
    });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      success: false,
      message: '참조하는 데이터가 존재하지 않습니다.',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || '서버 오류가 발생했습니다.',
  });
});

// ── DB 연결 후 서버 시작
const PORT = process.env.PORT || 5000;
(async () => {
  try {
    await connectDB();
    await seedBadges();

    httpServer.listen(PORT, () => {
      logger.info(`🚀 서버 실행 중 → http://localhost:${PORT}`);
      // ✅ 서버가 완전히 시작된 후에 스케줄러 등록
      startRankingCron();
    });

  } catch (err) {
    logger.error('서버 시작 실패:', err);
    process.exit(1);
  }
})();


module.exports = app;
