import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { FetchImpl } from '../src/scraper/store/catalog.js';
import type { ScrapeFn } from '../src/scraper/runner.js';
import type { ScrapeResult } from '../src/scraper/store/types.js';
import { createSchemaDb, createTestQueryable } from './helpers/pgmem.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(HERE, 'fixtures', 'raw');

const LISTINGS_PAGE_1 = JSON.parse(
  readFileSync(resolve(RAW, 'api_v2_listings_p1_l24.json'), 'utf8'),
) as Record<string, unknown>;
const ITEM_2626 = JSON.parse(
  readFileSync(resolve(RAW, 'api_v2_items_2626.json'), 'utf8'),
) as unknown;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Stub store: page 1 carries the fixture (totalPages forced to 1 so search
 * stops), item 2626 exists, everything else 404s. */
const stubStore: FetchImpl = (input) => {
  const url = String(input);
  if (url.includes('/api/v2/listings'))
    return Promise.resolve(json({ ...LISTINGS_PAGE_1, totalPages: 1 }));
  if (url.includes('/api/v2/items/2626') && !url.includes('/quote'))
    return Promise.resolve(json(ITEM_2626));
  if (url.includes('/api/v2/items/'))
    return Promise.resolve(json({ error: 'not found' }, 404));
  return Promise.reject(new Error(`unexpected store request ${url}`));
};

const scriptedSuccess: ScrapeFn = (input) =>
  Promise.resolve({
    ok: true,
    productId: input.productId,
    productName: 'Redwick Ukulele Nano',
    selectedOption: input.selectedOption,
    price: 62549,
    stock: '164',
    durationMs: 50,
    fetchStrategy: 'http',
    parserVersion: 'store-handshake-v1',
  } satisfies ScrapeResult);

function setup() {
  const db = createTestQueryable(createSchemaDb());
  const app = createApp({ db, storeFetch: stubStore, scrape: scriptedSuccess });
  return { app, db };
}

describe('product search + detail (TRACK-001)', () => {
  it('searches by partial name and exposes the store id + URL', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/products/search?q=ukulele');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.results[0]).toMatchObject({
      storeProductId: '2626',
      name: 'Redwick Ukulele Nano',
      productUrl: 'https://demo.inelabteamdev.com/item/2626',
    });
    const ids = res.body.results.map((r: { storeProductId: string }) => r.storeProductId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects empty queries and bad ids', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/products/search')).status).toBe(400);
    expect((await request(app).get('/api/products/search?q=   ')).status).toBe(400);
    expect((await request(app).get('/api/products/abc')).status).toBe(400);
    expect((await request(app).get('/api/products/9999')).status).toBe(404);
  });

  it('returns item detail with explicit options', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/products/2626');
    expect(res.status).toBe(200);
    expect(res.body.optionAxis).toBe('Bundle');
    expect(res.body.options.map((o: { id: string }) => o.id)).toEqual([
      'o1',
      'o2',
      'o3',
      'o4',
    ]);
  });

  it('retries a flaky listings page, then skips it instead of failing search', async () => {
    const pageCalls = new Map<string, number>();
    const flakyStore: FetchImpl = (input) => {
      const url = String(input);
      if (url.includes('/api/v2/listings')) {
        const page = new URL(url).searchParams.get('page') ?? '1';
        const seen = (pageCalls.get(page) ?? 0) + 1;
        pageCalls.set(page, seen);
        // Page 1: 503 once, then serves (retry recovers, nothing skipped).
        if (page === '1' && seen === 1)
          return Promise.resolve(json({ error: 'busy' }, 503));
        if (page === '1')
          return Promise.resolve(json({ ...LISTINGS_PAGE_1, totalPages: 2 }));
        // Page 2: always 503 (persistent outage is skipped, flagged).
        return Promise.resolve(json({ error: 'down' }, 503));
      }
      return stubStore(input);
    };
    const db = createTestQueryable(createSchemaDb());
    const app = createApp({ db, storeFetch: flakyStore, scrape: scriptedSuccess });
    const res = await request(app).get('/api/products/search?q=ukulele');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.incomplete).toBe(true);
    expect(pageCalls.get('1')).toBe(2);
    expect(pageCalls.get('2')).toBe(3);
  });
});

describe('tracking + evidence (TRACK-001 / UI-001 reads)', () => {
  it('tracks with validation, dedupes, and scrapes immediately', async () => {
    const { app } = setup();
    const created = await request(app)
      .post('/api/tracked-products')
      .send({ storeProductId: '2626', selectedOption: 'o1' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      storeProductId: '2626',
      selectedOption: 'o1',
      deduped: false,
      firstScrape: { outcome: 'success' },
    });
    const id = created.body.id as string;

    const again = await request(app)
      .post('/api/tracked-products')
      .send({ storeProductId: '2626', selectedOption: 'o1' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id, deduped: true });

    const badOption = await request(app)
      .post('/api/tracked-products')
      .send({ storeProductId: '2626', selectedOption: 'o9' });
    expect(badOption.status).toBe(400);
    expect(badOption.body.error).toBe('option_not_found');
  });

  it('lists targets with latest validated + last scrape status', async () => {
    const { app } = setup();
    await request(app)
      .post('/api/tracked-products')
      .send({ storeProductId: '2626', selectedOption: 'o1' });
    const res = await request(app).get('/api/tracked-products');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.results[0]).toMatchObject({
      storeProductId: '2626',
      latest: { price: 62549, stock: '164' },
      lastScrape: { outcome: 'success' },
    });
  });

  it('serves history, log, and manual rescrape', async () => {
    const { app } = setup();
    const created = await request(app)
      .post('/api/tracked-products')
      .send({ storeProductId: '2626', selectedOption: 'o1' });
    const id = created.body.id as string;

    const history = await request(app).get(`/api/tracked-products/${id}/history`);
    expect(history.status).toBe(200);
    expect(history.body.results.length).toBe(1);

    const log = await request(app).get(`/api/tracked-products/${id}/scrape-log`);
    expect(log.status).toBe(200);
    expect(log.body.results[0]).toMatchObject({ outcome: 'success', attempt_number: 1 });

    const rescrape = await request(app).post(`/api/tracked-products/${id}/scrape`);
    expect(rescrape.status).toBe(200);
    expect(rescrape.body).toMatchObject({ succeeded: 1, failed: 0 });
  });
});

describe('scheduler entrypoint (SCHED-001)', () => {
  it('rejects unauthenticated triggers and runs the batch when authorized', async () => {
    const { app } = setup();
    await request(app)
      .post('/api/tracked-products')
      .send({ storeProductId: '2626', selectedOption: 'o1' });

    expect((await request(app).post('/api/internal/scrape-all')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/internal/scrape-all')
          .set('Authorization', 'Bearer wrong-secret')
      ).status,
    ).toBe(401);

    const res = await request(app)
      .post('/api/internal/scrape-all')
      .set('Authorization', 'Bearer dev-cron-secret');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ succeeded: 1, failed: 0 });
  });
});

describe('CSV export (EXPORT-001)', () => {
  it('downloads one row per attempt with the assignment column order', async () => {
    const { app } = setup();
    await request(app)
      .post('/api/tracked-products')
      .send({ storeProductId: '2626', selectedOption: 'o1' });
    const res = await request(app).get('/api/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(
      'product_id,product_name,selected_option,timestamp,price,stock,outcome,attempt_number',
    );
    expect(lines.length).toBe(2);
    expect(lines[1]).toMatch(/^2626,Redwick Ukulele Nano,o1,\S+,62549,164,success,1$/);
  });
});

describe('unconfigured database', () => {
  it('answers 503 instead of crashing', async () => {
    const app = createApp({ db: null, storeFetch: stubStore, scrape: scriptedSuccess });
    expect((await request(app).get('/api/tracked-products')).status).toBe(503);
    expect(
      (
        await request(app)
          .post('/api/internal/scrape-all')
          .set('Authorization', 'Bearer dev-cron-secret')
      ).status,
    ).toBe(503);
  });
});
