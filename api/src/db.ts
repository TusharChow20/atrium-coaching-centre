import path from "node:path";
import { config } from "dotenv";
import { Pool, PoolClient, QueryResultRow } from "pg";

config({ path: path.resolve(__dirname, "..", "..", ".env") });

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export async function query<T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as any[]);
  return result.rows;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function withSerializableTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("begin isolation level serializable");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err: any) {
      await client.query("rollback");
      const retryable = err && (err.code === "40001" || err.code === "40P01");
      if (retryable && attempt < MAX_ATTEMPTS) continue;
      throw err;
    } finally {
      client.release();
    }
  }
  throw new Error("unreachable");
}
