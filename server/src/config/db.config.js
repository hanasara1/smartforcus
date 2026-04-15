// ────────────────────────────────────────────────
// 📦 src/config/db.config.js — MySQL 연결 풀 설정
// ────────────────────────────────────────────────

/*
  이 파일은 MySQL 데이터베이스와의 연결을 관리합니다.
  직접 연결(Direct Connection) 대신 "연결 풀(Connection Pool)" 방식을 사용합니다.

  연결 풀(Connection Pool)이란?
  DB 연결을 맺고 끊는 작업은 비용이 큰 작업입니다.
  요청마다 매번 새로 연결을 만들면 속도가 느려지고 서버에 부담이 됩니다.
  연결 풀은 DB 연결을 미리 여러 개 만들어두고 재사용하는 방식으로,
  마치 택시 대기소처럼 빈 연결을 꺼내 쓰고, 다 쓰면 반납하는 구조입니다.
*/


// ────────────────────────────────────────────────
// 📦 필요한 모듈 불러오기
// ────────────────────────────────────────────────

/*
  mysql2/promise : MySQL과 통신하는 라이브러리입니다.
  '/promise' 를 붙이면 콜백(callback) 방식 대신
  async/await 방식으로 DB 쿼리를 작성할 수 있습니다.
*/
const mysql = require('mysql2/promise');

/*
  logger : 콘솔 대신 사용하는 로그 출력 유틸리티입니다.
  단순한 console.log보다 로그 레벨(info, warn, error 등)을
  구분하여 기록할 수 있어 운영 환경에서 유용합니다.
*/
const logger = require('../utils/logger');


// ────────────────────────────────────────────────
// 🗄️ 연결 풀 변수 선언
// ────────────────────────────────────────────────

/*
  pool 변수는 생성된 연결 풀 객체를 담아두는 그릇입니다.
  처음에는 비어있고(undefined), connectDB()가 호출되면 실제 풀이 할당됩니다.
  let으로 선언한 이유는 connectDB() 실행 후 값을 재할당해야 하기 때문입니다.
*/
let pool;


// ────────────────────────────────────────────────
// 🔌 연결 풀 생성 및 초기 연결 테스트 함수
// ────────────────────────────────────────────────

/*
  connectDB()는 서버가 시작될 때 딱 한 번 호출하는 함수입니다.
  연결 풀을 생성하고, 실제로 DB에 연결이 되는지 ping으로 확인합니다.

  async 키워드 : 함수 내부에서 await를 사용할 수 있게 합니다.
*/
const connectDB = async () => {

    // mysql.createPool() : 설정 옵션을 바탕으로 연결 풀을 생성합니다.
    pool = mysql.createPool({

        // ── 접속 정보 ────────────────────────────────
        /*
          process.env.XXX : .env 파일에 저장된 환경 변수를 읽어옵니다.
          || 뒤의 값은 환경 변수가 없을 경우 사용하는 기본값(fallback)입니다.
          실제 운영 환경에서는 반드시 .env 파일에 값을 설정해야 합니다.
        */
        host     : process.env.DB_HOST     || 'localhost', // DB 서버 주소
        port     : Number(process.env.DB_PORT) || 3306,    // DB 포트 (MySQL 기본값: 3306)
        user     : process.env.DB_USER     || 'root',      // DB 접속 계정
        password : process.env.DB_PASSWORD || '',          // DB 접속 비밀번호
        database : process.env.DB_NAME     || 'gomindokki', // 사용할 데이터베이스 이름

        // ── 연결 풀 동작 설정 ────────────────────────
        /*
          waitForConnections : true
            모든 연결이 사용 중일 때 새 요청이 오면
            빈 연결이 생길 때까지 대기합니다. (false면 즉시 에러 발생)

          connectionLimit : 10
            동시에 유지할 수 있는 최대 연결 수입니다.
            10개의 연결이 모두 사용 중이면 이후 요청은 대기합니다.

          queueLimit : 0
            대기열(queue)의 최대 크기입니다.
            0으로 설정하면 대기열 크기에 제한이 없습니다.
        */
        waitForConnections : true,
        connectionLimit    : 10,
        queueLimit         : 0,

        // ── 문자 및 시간 설정 ────────────────────────
        /*
          timezone : '+09:00'
            DB에 저장/조회되는 시간을 한국 표준시(KST, UTC+9)로 처리합니다.
            이 설정이 없으면 시간이 9시간 어긋나는 문제가 발생할 수 있습니다.

          charset : 'utf8mb4'
            한글, 영어뿐 아니라 이모지(😀 등)까지 저장할 수 있는
            완전한 UTF-8 문자셋입니다. (utf8은 이모지를 저장하지 못합니다)
        */
        timezone : '+09:00',
        charset  : 'utf8mb4',
    });


    // ── 초기 연결 테스트 (Ping) ──────────────────────
    /*
      풀을 만들었다고 해서 바로 DB 연결이 보장되지는 않습니다.
      실제로 연결이 잘 되는지 확인하기 위해 아래 3단계를 거칩니다.

        1. pool.getConnection() : 풀에서 연결 하나를 빌려옵니다.
        2. conn.ping()          : 빌린 연결로 DB에 "살아있니?"를 물어봅니다.
        3. conn.release()       : 테스트가 끝난 연결을 풀에 반납합니다.
                                  반납하지 않으면 연결이 낭비되어 풀이 고갈될 수 있습니다!
    */
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();

    logger.info('✅ MySQL 연결 성공');
};


// ────────────────────────────────────────────────
// 🔍 연결 풀 반환 함수 (Getter)
// ────────────────────────────────────────────────

/*
  라우터나 서비스 파일에서 DB 쿼리를 실행할 때
  이 함수를 통해 연결 풀을 가져다 씁니다.

  사용 예시:
    const { getPool } = require('../config/db.config');
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM users');

  @returns {mysql.Pool} 생성된 연결 풀 객체
*/
const getPool = () => {
    /*
      pool이 아직 초기화되지 않은 상태(서버 시작 전 또는 connectDB 호출 전)에서
      getPool()이 호출되면, 즉시 에러를 던져 개발자가 실수를 빠르게 인지하도록 합니다.
      이처럼 명확한 에러 메시지를 던지는 방어 코드를 "가드(Guard)"라고 부릅니다.
    */
    if (!pool) {
        throw new Error('DB 연결 풀이 초기화되지 않았습니다. connectDB()를 먼저 호출하세요.');
    }

    return pool;
};


// ────────────────────────────────────────────────
// 📤 외부로 내보내기
// ────────────────────────────────────────────────

/*
  두 함수를 외부로 내보냅니다.
    - connectDB : 서버 진입점(예: app.js)에서 서버 시작 시 1회 호출
    - getPool   : DB 쿼리가 필요한 모든 파일에서 호출하여 풀을 사용

  사용 예시 (app.js):
    const { connectDB } = require('./config/db.config');
    await connectDB(); // 서버 시작 시 DB 연결
*/
module.exports = { connectDB, getPool };
