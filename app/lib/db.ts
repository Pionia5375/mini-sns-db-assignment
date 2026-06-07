import { Pool, PoolClient, QueryResult, QueryResultRow, types } from "pg";

// pg 는 기본적으로 BIGINT(OID 20) 를 문자열로 반환한다 (>2^53 안전).
// 본 앱은 BIGSERIAL ID 만 사용하고 2^53 을 절대 안 넘으므로 number 로 받는 게 안전하고,
// JWT 세션 uid(number) 와의 === 비교를 가능하게 한다.
types.setTypeParser(20, (val) => parseInt(val, 10));

declare global {
  // dev hot-reload 대비: pool 인스턴스를 전역에 캐시
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function buildPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  }
  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export const pool: Pool = global.__pgPool ?? buildPool();
if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

/** 단일 쿼리 헬퍼. 결과 rows 반환. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

/**
 * 트랜잭션 헬퍼.
 *   await withTx(async (tx) => { ... });
 * 콜백 안에서 throw 하면 ROLLBACK, 정상 종료 시 COMMIT.
 */
export async function withTx<T>(
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
