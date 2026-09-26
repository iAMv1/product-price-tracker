/**
 * Recording orchestrator — full-screen cut (2-4 min).
 * One window owns the screen at a time; swaps requested by writing
 * `../artifacts/recordings/.flip` (directory created here before any write):
 *   1. terminal — intro
 *   2. browser  — live dashboard, then the real store page (async price settle)
 *   3. terminal — 3 real scrapes driven by the REAL runner: one persisted
 *                 chain `retried (503)` -> `success`, then an honest failure
 *   4. browser  — honest scrape log (retried rows) + CSV export
 *   5. terminal — reliability recap + summary of persisted attempt rows
 * flip() raises the active window full-screen (topmost) and sends the other back.
 *
 * Retry policy belongs to the runner (src/scraper/runner.ts): this tool only
 * picks targets, arms the tools-only fault seam (tools/fault-inject.ts) and
 * prints what the runner persisted. Recording safety: a non-localhost
 * DATABASE_URL aborts before anything is written or recorded.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { productUrl } from '../src/http/deps.js';
import { closePool, getPool, type Queryable } from '../src/persistence/db.js';
import {
  createTrackedProduct,
  getAttemptLog,
  isUniqueViolation,
  reactivateTrackedByIdentity,
} from '../src/persistence/repositories.js';
import {
  rowToTarget,
  runAllTargets,
  type ScrapeFn,
  type TargetInput,
} from '../src/scraper/runner.js';
import { scrapeProduct } from '../src/scraper/store/scrape.js';
import { createSchemaDb, createTestQueryable } from '../tests/helpers/pgmem.js';
import { withDemoFault } from './fault-inject.js';

const APP = 'https://product-price-tracker-ochre.vercel.app';
const STORE = 'https://demo.inelabteamdev.com';
const API = 'https://ppt-backend-lyiv.onrender.com';
const started = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (line: string): void => console.log(line);

const RECORDINGS_DIR = '../artifacts/recordings';
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Recording must only ever touch the local dev database, never production.
 * Aborts the process before any state file, browser or DB write happens.
 */
function assertLocalDatabaseOnly(): void {
  const raw = process.env['DATABASE_URL'];
  if (raw === undefined || raw.trim() === '') return;
  let host: string | null;
  try {
    host = new URL(raw.trim()).hostname;
  } catch {
    host = null;
  }
  if (host === null || !LOCAL_DB_HOSTS.has(host)) {
    console.error(
      `[recording] refusing to run: DATABASE_URL host is ${host === null ? 'unparsable' : JSON.stringify(host)}, not localhost/127.0.0.1. ` +
        'The recording must only ever touch the local dev database, never production.',
    );
    process.exit(1);
  }
}
assertLocalDatabaseOnly();
mkdirSync(RECORDINGS_DIR, { recursive: true });

/** Ask the window-swap tooling to raise this window full-screen (topmost). */
function flip(who: 'terminal' | 'browser'): void {
  writeFileSync(join(RECORDINGS_DIR, '.flip'), who);
}

/** Local DATABASE_URL -> real dev pool; otherwise an in-memory schema db. */
async function resolveRecordingDb(): Promise<{ db: Queryable; source: string }> {
  const raw = process.env['DATABASE_URL'];
  if (raw !== undefined && raw.trim() !== '') {
    const pool = await getPool();
    if (pool !== null) return { db: pool, source: 'local dev database (DATABASE_URL)' };
  }
  return {
    db: createTestQueryable(createSchemaDb()),
    source: 'in-memory dev database (DATABASE_URL unset)',
  };
}

const { db, source } = await resolveRecordingDb();

/**
 * Idempotent target creation: a local dev database may already track this
 * identity (UNIQUE store_product_id + selected_option + product_url), and a
 * duplicate INSERT would kill the recording. Reuse the existing row instead.
 */
async function ensureTarget(
  storeProductId: string,
  selectedOption: string,
): Promise<TargetInput> {
  const identity = {
    storeProductId,
    selectedOption,
    productUrl: productUrl(storeProductId),
  };
  try {
    const created = await createTrackedProduct(db, {
      ...identity,
      productName: `demo item ${storeProductId}`,
    });
    return rowToTarget(created);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const reactivated = await reactivateTrackedByIdentity(db, identity);
  if (reactivated !== null) return rowToTarget(reactivated);
  const existing = await db.query(
    `SELECT id, store_product_id, product_name, selected_option, product_url,
            is_active, scrape_interval_hours
     FROM tracked_products
     WHERE store_product_id = $1 AND selected_option = $2 AND product_url = $3`,
    [identity.storeProductId, identity.selectedOption, identity.productUrl],
  );
  const row = existing.rows[0];
  if (row === undefined) {
    throw new Error(
      `tracked identity ${storeProductId}/${selectedOption} lost between insert and re-read`,
    );
  }
  return rowToTarget({
    id: String(row['id']),
    store_product_id: String(row['store_product_id']),
    product_name: String(row['product_name']),
    selected_option: String(row['selected_option']),
    product_url: String(row['product_url']),
    is_active: row['is_active'] === true,
    scrape_interval_hours:
      typeof row['scrape_interval_hours'] === 'number'
        ? row['scrape_interval_hours']
        : 2,
  });
}

/** Live per-call terminal output; the runner decides what a result means. */
function auditScrape(inner: ScrapeFn): ScrapeFn {
  return async (input) => {
    const wallStart = Date.now();
    const result = await inner(input);
    const wallMs = Date.now() - wallStart;
    if (result.ok) {
      say(
        `  ${input.productId}/${input.selectedOption}: SUCCESS  price=${result.price}  stock=${result.stock}  (${result.durationMs}ms, wall ${wallMs}ms)`,
      );
    } else {
      say(
        `  ${input.productId}/${input.selectedOption}: ${result.errorCode}  transient=${result.transient}  (${result.durationMs}ms, wall ${wallMs}ms)  ${result.errorMessage}`,
      );
    }
    return result;
  };
}

/** Print the persisted attempt chain for one target (oldest first). */
async function printChain(
  label: string,
  trackedProductId: string,
): Promise<void> {
  const chain = [...(await getAttemptLog(db, trackedProductId, 10))].reverse();
  if (chain.length === 0) {
    say(`  ${label}: (no attempt rows)`);
    return;
  }
  for (const row of chain) {
    if (row.outcome === 'success') {
      say(
        `  ${label}: attempt ${row.attempt_number} -> success  price=${row.price}  stock=${row.stock}`,
      );
    } else {
      say(
        `  ${label}: attempt ${row.attempt_number} -> ${row.outcome} (${row.error_code ?? 'n/a'})`,
      );
    }
  }
}

const apiTargets = await fetch(`${API}/api/tracked-products`)
  .then((r) => r.json())
  .then((j: unknown) => (Array.isArray(j) ? j : (j as { results: [] }).results))
  .catch(() => []);
const firstId: string | undefined = (apiTargets as Array<{ id: string }>)[0]?.id;

// Pass the demo fault programmatically (default http-503-once); the
// tools-only wrapper decides from env at startup and never arms in production.
if ((process.env['DEMO_FAULT'] ?? '') === '') {
  process.env['DEMO_FAULT'] = 'http-503-once';
}
const scrape = auditScrape(withDemoFault(scrapeProduct));

const pairs: Array<[string, string]> = [['2626', 'o1'], ['2229', 'o2'], ['2092', 'o2']];
const targets: TargetInput[] = [];
for (const [id, opt] of pairs) targets.push(await ensureTarget(id, opt));

say('INE Price Tracker - observable headed run of the live scraper');
say(`recording database: ${source}`);
say(`tracked targets: ${(apiTargets as unknown[]).length}  |  schedule: every 2 hours  |  store: demo.inelabteamdev.com`);
say('');
say('what this run proves:');
say('   1. real store scrapes through the real runner, per-attempt output');
say('   2. a transient 503 retried with backoff inside ONE persisted chain');
say('   3. history and CSV never gain invented values');
await sleep(10000);

flip('browser');
say('(browser) live dashboard');
const browser = await chromium.launch({ headless: false, slowMo: 350, args: ['--start-maximized'] });
const page = await browser.newPage({ viewport: null });
await page.goto(`${APP}/#/app`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await sleep(14000);
say('(browser) real store page - the price loads asynchronously');
try {
  await page.goto(`${STORE}/item/2626`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1200);
} catch {
  /* page slowness is handled by the HTTP path below */
}
await sleep(5000);

flip('terminal');
say('STEP 2  -  live scrapes: 3 tracked products through the REAL runner');
say('   retry policy is the runner\'s: transient -> retried row + backoff (1s/2s, cap 4s) -> success');
const summary = await runAllTargets(db, {
  triggerType: 'manual',
  targets,
  scrape,
});
say(
  `run ${summary.runId}: succeeded=${summary.succeeded}  failed=${summary.failed}  retried=${summary.retriedAttempts}  attempts=${summary.totalAttempts}`,
);
for (const t of targets) await printChain(`${t.storeProductId}/${t.selectedOption}`, t.id);
await sleep(4000);

say('');
say('STEP 3  -  failing response: option o99 does not exist on this product');
const badTarget = await ensureTarget('2626', 'o99');
const badSummary = await runAllTargets(db, {
  triggerType: 'manual',
  targets: [badTarget],
  scrape,
});
say(
  `run ${badSummary.runId}: succeeded=${badSummary.succeeded}  failed=${badSummary.failed}`,
);
await printChain('2626/o99', badTarget.id);
say('  nothing invented, nothing hidden: option_not_found is terminal -> one failed row, price and stock left empty');
await sleep(6000);

flip('browser');
say('(browser) product scrape log - retried rows keep price/stock empty');
if (firstId) {
  await page.goto(`${APP}/#/product/${firstId}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await sleep(4000);
  await page.getByRole('radio', { name: 'Log' }).click().catch(() => {});
  await sleep(12000);
}
say('(browser) CSV export - one row per scrape attempt');
await page.goto(`${APP}/#/app`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await sleep(6000);
await page.getByRole('button', { name: /Export full scrape history as CSV/ }).click().catch(() => {});
await sleep(9000);

flip('terminal');
say('STEP 5  -  reliability recap');
say('   15s upstream timeout  |  3 attempts  |  backoff + jitter (1s / 2s / 4s)');
say('   timeout, 429 and 5xx are transient -> retried;  terminal codes -> failed, recorded honestly');
say('   external cron every 2 hours + keep-alive ping; no always-on loop (free tier)');
say('   only fully validated observations become price history');
say('');
say('persisted attempt rows (this run):');
for (const t of targets) await printChain(`${t.storeProductId}/${t.selectedOption}`, t.id);
await printChain('2626/o99', badTarget.id);
await sleep(10000);

// Guarantee the cut stays inside the required 2-4 minute window.
const pad = 118000 - (Date.now() - started);
if (pad > 0) await sleep(pad);

await browser.close();
writeFileSync(join(RECORDINGS_DIR, '.done'), new Date().toISOString());
await closePool();
say('done');
