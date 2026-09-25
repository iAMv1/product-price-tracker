import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataType, newDb, type IMemoryDb } from 'pg-mem';
import type { Queryable } from '../../src/persistence/db.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '..', '..', '..', 'db', 'schema.sql');

/**
 * Shared in-memory Postgres for repository/runner tests. Applies the REAL
 * db/schema.sql minus the Supabase-only statements pg-mem cannot parse
 * (CREATE EXTENSION, COMMENT ON, DROP VIEW) — the same strip documented in
 * VER-20260925-003. Views use the aggregate+join form, which pg-mem handles.
 */
export function createSchemaDb(): IMemoryDb {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => randomUUID(),
  });
  const lines = readFileSync(SCHEMA_PATH, 'utf8').split('\n');
  const portable: string[] = [];
  let skippingComment = false;
  for (const line of lines) {
    if (/^\s*CREATE EXTENSION/i.test(line)) continue;
    if (/^\s*DROP VIEW/i.test(line)) continue;
    if (/^\s*COMMENT ON/i.test(line)) {
      skippingComment = true;
      continue;
    }
    if (skippingComment) {
      if (/;\s*$/.test(line)) skippingComment = false;
      continue;
    }
    portable.push(line);
  }
  db.public.none(portable.join('\n'));
  return db;
}

/** node-postgres-compatible pool backed by the in-memory schema. */
export function createTestQueryable(db: IMemoryDb): Queryable {
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as Queryable;
  return pool;
}
