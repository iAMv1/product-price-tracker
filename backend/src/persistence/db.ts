import dns from 'node:dns';
import { lookup } from 'node:dns/promises';
import { env } from '../config/env.js';

// Render's free tier has no IPv6 egress while Supabase direct hostnames
// resolve IPv6 first (ENETUNREACH). dns.setDefaultResultOrder alone proved
// insufficient against node-postgres' lookup path, so the pool resolves an
// explicit IPv4 address at startup and fails loudly when none exists.
dns.setDefaultResultOrder('ipv4first');

async function ipv4ConnectionString(): Promise<string> {
  // Splice the hostname only: URL serialization would percent-encode the
  // password (which legitimately contains '@'), breaking auth.
  // The password itself may contain '@': split on the LAST one.
  const afterAuth = env.databaseUrl.slice(env.databaseUrl.lastIndexOf('@') + 1);
  const host = afterAuth.split(/[/:?]/)[0];
  if (host === undefined || host === '') return env.databaseUrl;
  let address: string;
  try {
    address = (await lookup(host, { family: 4 })).address;
  } catch {
    throw new Error(
      `no IPv4 address for Supabase host ${host}: Render free tier cannot reach IPv6-only hosts`,
    );
  }
  return env.databaseUrl.replace(host, address);
}

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
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
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
    connectionString: await ipv4ConnectionString(),
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
