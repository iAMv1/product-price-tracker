import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { DataType } from 'pg-mem';
import { createSchemaDb, createTestQueryable } from './helpers/pgmem.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// The test applies the REAL migration: this proves 003 parses on a
// Postgres-compatible engine and wires the table the routes expect.
const MIGRATION = readFileSync(
  resolve(HERE, '..', '..', 'db', 'migrations', '003_usage.sql'),
  'utf8',
);

function appWithUsage() {
  const mem = createSchemaDb();
  // pg-mem does not ship char_length; register the one function the
  // migration needs so the REAL migration file is what gets verified.
  mem.public.registerFunction({
    name: 'char_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string | null) => value?.length ?? 0,
  });
  mem.public.none(MIGRATION);
  return createApp({ db: createTestQueryable(mem) });
}

describe('usage telemetry', () => {
  it('records the Origin header host and aggregates by origin', async () => {
    const app = appWithUsage();
    const ping = await request(app)
      .post('/api/usage-ping')
      .set('Origin', 'https://some-clone.vercel.app')
      .send({ path: '#/app' });
    expect(ping.status).toBe(202);
    expect(ping.body).toEqual({ recorded: true });

    const stats = await request(app).get('/api/usage-stats');
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBe(1);
    expect(stats.body.last24h).toBe(1);
    expect(stats.body.firstSeen).toEqual(expect.any(String));
    expect(stats.body.byOrigin).toEqual([
      { host: 'some-clone.vercel.app', count: 1, lastSeen: expect.any(String) },
    ]);
  });

  it('groups headerless pings as direct and starts empty', async () => {
    const app = appWithUsage();
    const empty = await request(app).get('/api/usage-stats');
    expect(empty.body).toMatchObject({ total: 0, last24h: 0, firstSeen: null, byOrigin: [] });

    await request(app).post('/api/usage-ping').send({});
    const stats = await request(app).get('/api/usage-stats');
    expect(stats.body.total).toBe(1);
    expect(stats.body.byOrigin[0]?.host).toBe('(direct)');
  });

  it('503s without a database, like every other DB route', async () => {
    // Explicit null (not env-dependent): no pool, no connection attempts.
    const app = createApp({ db: null });
    expect((await request(app).post('/api/usage-ping').send({})).status).toBe(503);
    expect((await request(app).get('/api/usage-stats')).status).toBe(503);
  });
});
