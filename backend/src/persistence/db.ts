import { env } from '../config/env.js';

/**
 * Database access. Production uses node-postgres against Supabase
 * (DATABASE_URL); tests substitute the pg-mem adapter, which satisfies the
 * same Queryable surface. Repositories depend only on this interface, never
 * on a concrete driver.
 */
export interface Queryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

interface PoolLike extends Queryable {
  end(): Promise<void>;
}

let pool: PoolLike | null = null;

/** Lazy singleton pool. Returns null when unconfigured (dev without DB). */
export async function getPool(): Promise<PoolLike | null> {
  if (pool !== null) return pool;
  if (env.databaseUrl === '') return null;
  const { Pool } = await import('pg');
  pool = new Pool({
    connectionString: env.databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10_000,
  }) as unknown as PoolLike;
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}
