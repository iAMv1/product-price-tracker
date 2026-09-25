import dns from 'node:dns';
import { env } from '../config/env.js';

// Render's free tier has no IPv6 egress while Supabase direct hostnames
// resolve IPv6 first: without this the pool dies with ENETUNREACH.
dns.setDefaultResultOrder('ipv4first');

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
  // Supabase requires SSL; opt out only with ?sslmode=disable in the URL.
  // rejectUnauthorized:false is the free-tier pragmatic default (documented
  // in DEPLOY.md); the connection still negotiates TLS.
  const ssl = env.databaseUrl.includes('sslmode=disable')
    ? undefined
    : { rejectUnauthorized: false };
  pool = new Pool({
    connectionString: env.databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10_000,
    ssl,
  }) as unknown as PoolLike;
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}
