/**
 * Recording orchestrator — full-screen cut (2-4 min), ONE causal chain.
 *
 *   REAL STORE
 *      ↓ (real scraper, real HTTP)
 *   LOCAL BACKEND (in-process, fault-armed runner)
 *      ↓
 *   LOCAL DB (shared Postgres — the browser reads these exact rows)
 *      ↑
 *   LOCAL FRONTEND (dev server, proxied to the local backend)
 *      ↑
 *   BROWSER
 *
 * Every scrape in the recording is triggered through the LOCAL HTTP API, so
 * the run IDs the terminal prints are the same rows the browser's scrape log
 * renders. The old script mixed a local/pgmem terminal chain with the
 * production frontend — this one cannot, by construction.
 *
 * Prerequisites: local Postgres running, DATABASE_URL pointing at localhost.
 * Recording safety: a non-localhost DATABASE_URL (or none at all) aborts
 * before any server, browser, or DB write happens.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright';
import { createApp } from '../src/app.js';
import { productUrl } from '../src/http/deps.js';
import { closePool, getPool } from '../src/persistence/db.js';
import {
  createTrackedProduct,
  getAttemptLog,
  isUniqueViolation,
  reactivateTrackedByIdentity,
} from '../src/persistence/repositories.js';
import { rearmDemoFault, withDemoFault, type DemoFault } from './fault-inject.js';
import { scrapeProduct } from '../src/scraper/store/scrape.js';

const BACKEND_PORT = 4100;
const FRONTEND_PORT = 5175;
const LOCAL_API = `http://127.0.0.1:${BACKEND_PORT}`;
const LOCAL_APP = `http://localhost:${FRONTEND_PORT}`;
const STORE = 'https://demo.inelabteamdev.com';
const started = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (line: string): void => console.log(line);

const RECORDINGS_DIR = '../artifacts/recordings';
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Coherence requires ONE shared database the backend and the browser both
 * read. An in-memory fallback would split the chain again, so its absence
 * is a hard abort — not a fallback.
 */
function requireLocalDatabase(): string {
  const raw = process.env['DATABASE_URL'];
  let host: string | null = null;
  try {
    host = raw === undefined || raw.trim() === '' ? null : new URL(raw.trim()).hostname;
  } catch {
    host = null;
  }
  if (host === null || !LOCAL_DB_HOSTS.has(host)) {
    console.error(
      `[recording] refusing to run: DATABASE_URL must point at a local Postgres ` +
        `(got host ${host === null ? 'missing/unparsable' : JSON.stringify(host)}). ` +
        'The recording needs one shared local DB for the backend and the browser.',
    );
    process.exit(1);
  }
  return raw as string;
}
requireLocalDatabase();
mkdirSync(RECORDINGS_DIR, { recursive: true });

// Capture-driver gate: when run under record-driver.ps1 it creates .go once
// ffmpeg is rolling, so the cut starts on the intro frame. Manual runs have
// no driver — proceed after a short wait instead of hanging forever.
const GO_FILE = join(RECORDINGS_DIR, '.go');
{
  const deadline = Date.now() + 8000;
  while (!existsSync(GO_FILE) && Date.now() < deadline) await sleep(250);
  say(existsSync(GO_FILE) ? '[recording] driver gate released' : '[recording] no driver gate; starting anyway');
}

/** Ask the window-swap tooling to raise this window full-screen (topmost). */
function flip(who: 'terminal' | 'browser'): void {
  writeFileSync(join(RECORDINGS_DIR, '.flip'), who);
}

// The demo fault is armed on the BACKEND's scraper (injected below), so the
// very first HTTP-triggered scrape fails transiently and the runner persists
// a real retried chain — the same chain the browser later renders.
if ((process.env['DEMO_FAULT'] ?? '') === '') {
  process.env['DEMO_FAULT'] = 'http-503-once';
}

// --- 0. Intro frame: repo, guide, command — the driver is already
// capturing, so this doubles as the 0:00-0:25 segment while servers boot.
say('repo: product-price-tracker  |  guide: backend/tools/HEADED_RECORDING.md');
say('command: cd backend  &&  npm run record:headed   (= tsx tools/recording-run.ts)');
say('plan: 503-once on target 1, timeout-once on target 2, o99 terminal fail,');
say('      then scrape log, CSV export, price history — one causal chain, ~3 minutes.');
await sleep(12000);

// --- 1. Local backend, in-process, fault-armed runner, shared local DB ---
const pool = await getPool();
if (pool === null) throw new Error('[recording] getPool() returned null despite local DATABASE_URL');
// Narrowed once: every later use (including inside closures below) sees a
// non-null pool, so a null DB can never sneak into the chain mid-run.
const db = pool;
// One wrapper for the whole cut: re-armed per target below, so the cut is
// deterministic whether seeding scrapes (fresh DB) burn the initial arming
// or dedupe (existing DB) leaves it intact.
// CLI request log: the recording must SHOW requests being sent, not just
// summaries. PPT_HTTP_LOG=1 turns on access + upstream fetch lines below.
// Default off: production and tests stay quiet.
process.env['PPT_HTTP_LOG'] ??= '1';
const faultArmedScrape = withDemoFault(scrapeProduct);
const app = createApp({ db, scrape: faultArmedScrape });
const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
  const s = app.listen(BACKEND_PORT, '127.0.0.1', () => resolve(s));
});
say(`[recording] local backend on ${LOCAL_API} (shared local DB, fault-armed runner)`);

// --- 2. Local frontend dev server, proxied at the local backend ---
// Spawned as plain node on the vite binary: npm.cmd needs a shell on
// Windows and Node 24 rejects shell-less .cmd spawn with EINVAL, which
// killed a recording mid-cut. This sidesteps shells entirely.
const frontendDir = join(process.cwd(), '..', 'frontend');
const viteBin = join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
const vite: ChildProcess = spawn(
  process.execPath,
  [viteBin, '--port', String(FRONTEND_PORT), '--strictPort'],
  {
    cwd: frontendDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_BACKEND_ORIGIN: LOCAL_API },
  },
);
async function waitFor(url: string, label: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        say(`[recording] ${label} ready`);
        return;
      }
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`[recording] ${label} never became ready at ${url}`);
}
await waitFor(`${LOCAL_API}/health`, 'local backend');
await waitFor(`${LOCAL_APP}/`, 'local frontend');

// --- 3. Seed through the REAL HTTP API (not direct repository calls) ---
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`[recording] ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}
interface TrackResponse {
  id: string;
  deduped: boolean;
  firstScrape: { outcome: string } | null;
}
const pairs: Array<[string, string]> = [
  ['2626', 'o1'],
  ['2229', 'o2'],
  ['2092', 'o2'],
];
const trackedIds: string[] = [];
for (const [storeProductId, selectedOption] of pairs) {
  const created = await api<TrackResponse>('/api/tracked-products', {
    method: 'POST',
    body: JSON.stringify({ storeProductId, selectedOption, scrapeIntervalHours: 2 }),
  });
  trackedIds.push(created.id);
  say(
    `[recording] tracked ${storeProductId}/${selectedOption} -> ${created.id} ` +
      `(deduped=${created.deduped}, firstScrape=${created.firstScrape?.outcome ?? 'n/a'})`,
  );
}

/** Print the persisted attempt chain for one target (oldest first). */
async function printChain(label: string, trackedProductId: string): Promise<void> {
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

say('INE Price Tracker - observable headed run of the live scraper');
say('chain: real store -> local backend -> local DB -> local frontend -> this browser');
say(`tracked targets: ${trackedIds.length}  |  schedule: every 2 hours  |  store: demo.inelabteamdev.com`);
say('');
say('production scrape path is HTTP-first: fetch + parse + validate. The headed');
say('browser below is the observability surface — it writes no prices, it shows');
say('the real storefront while the same runner executes and records its retries.');
say('');
say('what this run proves:');
say('   1. real store scrapes through the real runner, per-attempt output');
say('   2. a transient 503 retried with backoff inside ONE persisted chain');
say('   3. a slow upstream (timeout) retried the same way, same chain shape');
say('   4. history and CSV never gain invented values');
say('');
say('PHASE A follows: all scrapes run here on this terminal — watch the');
say('[http] request lines, [store] upstream lines, run IDs, and attempt chains.');
await sleep(6000);

flip('terminal');
say('STEP 2  -  live scrapes through the LOCAL API (watch the run IDs)');
say('   retry policy is the runner\'s: transient -> retried row + backoff (1s/2s, cap 4s) -> success');
interface ScrapeSummary {
  runId: string;
  succeeded: number;
  failed: number;
  retriedAttempts: number;
  totalAttempts: number;
}
for (const [index, targetId] of trackedIds.entries()) {
  const [storeProductId, selectedOption] = pairs[index] as [string, string];
  // Explicit per-target arming: deterministic on a fresh DB (where seeding
  // scrapes burn the initial arming) and on an existing one (where dedupe
  // skips seeding scrapes). Target 3 runs clean — the happy path.
  const fault: DemoFault | null =
    index === 0 ? 'http-503-once' : index === 1 ? 'timeout-once' : null;
  if (fault !== null) {
    rearmDemoFault(faultArmedScrape, fault);
    say(
      `fault armed for ${storeProductId}/${selectedOption}: ${fault} ` +
        `(first attempt fails transiently, runner retries with backoff)`,
    );
  } else {
    say(`no fault for ${storeProductId}/${selectedOption}: clean happy path`);
  }
  const summary = await api<ScrapeSummary>(
    `/api/tracked-products/${targetId}/scrape`,
    { method: 'POST' },
  );
  say(
    `run ${summary.runId}: ${storeProductId}/${selectedOption} ` +
      `succeeded=${summary.succeeded} failed=${summary.failed} ` +
      `retried=${summary.retriedAttempts} attempts=${summary.totalAttempts}`,
  );
  await printChain(`${storeProductId}/${selectedOption}`, targetId);
}
await sleep(4000);

say('');
say('STEP 3  -  failing response: option o99 does not exist on this product');
// o99 cannot be tracked through the API (validation rightly refuses it), so
// the row is seeded directly — but under the store's REAL product name, read
// live from the catalogue (never a placeholder): the FAILURE itself still
// flows through the real HTTP scrape path below.
const itemName: string = await fetch(`${STORE}/api/v2/items/2626`, {
  headers: { accept: 'application/json' },
})
  .then((res) => {
    if (!res.ok) throw new Error(`item fetch -> HTTP ${res.status}`);
    return res.json() as Promise<{ name?: unknown }>;
  })
  .then((json) => {
    if (typeof json.name !== 'string' || json.name === '') {
      throw new Error('item JSON carries no name');
    }
    return json.name;
  });
const badIdentity = {
  storeProductId: '2626',
  selectedOption: 'o99',
  productUrl: productUrl('2626'),
};
let badId: string;
try {
  badId = (
    await createTrackedProduct(db, { ...badIdentity, productName: itemName })
  ).id;
} catch (error) {
  if (!isUniqueViolation(error)) throw error;
  const reactivated = await reactivateTrackedByIdentity(db, badIdentity);
  badId =
    reactivated?.id ??
    String(
      (
        await db.query(
          `SELECT id FROM tracked_products WHERE store_product_id = $1 AND selected_option = $2 AND product_url = $3`,
          [badIdentity.storeProductId, badIdentity.selectedOption, badIdentity.productUrl],
        )
      ).rows[0]?.['id'],
    );
}
const badSummary = await api<ScrapeSummary>(`/api/tracked-products/${badId}/scrape`, {
  method: 'POST',
});
say(`run ${badSummary.runId}: succeeded=${badSummary.succeeded} failed=${badSummary.failed}`);
await printChain('2626/o99', badId);
say('  nothing invented, nothing hidden: option_not_found is terminal -> one failed row, price and stock left empty');
await sleep(4000);

flip('browser');
say('PHASE B  -  the headed browser opens now (it appears over this terminal).');
say('Same DB, same run IDs: dashboard, real store page, scrape log, CSV, history.');
const browser = await chromium.launch({ headless: false, slowMo: 350, args: ['--start-maximized'] });
const page = await browser.newPage({ viewport: null });
say('(browser) local dashboard - same DB the terminal just wrote');
await page.goto(`${LOCAL_APP}/#/app`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await sleep(12000);
say('(browser) real store page - the price loads asynchronously');
try {
  await page.goto(`${STORE}/item/2626`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1200);
} catch {
  /* page slowness is handled by the HTTP path below */
}
await sleep(5000);
say('(browser) product scrape log - THE run IDs printed above, retried rows keep price/stock empty');
await page.goto(`${LOCAL_APP}/#/tracked/${trackedIds[0]}?tab=log`, {
  waitUntil: 'networkidle',
  timeout: 45000,
}).catch(() => {});
await sleep(12000);
say('(browser) CSV export - one row per scrape attempt: retried rows carry');
say('empty price/stock, the success row carries the validated values.');
await page.goto(`${LOCAL_APP}/#/app`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await sleep(6000);
await page.getByRole('button', { name: /Export CSV/ }).click().catch(() => {});
await sleep(4000);
await page.getByRole('button', { name: /^Export CSV$/ }).last().click().catch(() => {});
await sleep(9000);

say('(browser) price history - three products, validated observations only');
await page.goto(`${LOCAL_APP}/#/tracked/${trackedIds[1]}?tab=history`, {
  waitUntil: 'networkidle',
  timeout: 45000,
}).catch(() => {});
await sleep(10000);

say('(browser) done - closing the browser, back to this terminal for the recap');
await browser.close();

flip('terminal');
say('STEP 5  -  reliability recap');
say('   15s upstream timeout  |  3 attempts  |  backoff + jitter (1s / 2s / 4s)');
say('   timeout, 429 and 5xx are transient -> retried;  terminal codes -> failed, recorded honestly');
say('   external cron every 2 hours + keep-alive ping; no always-on loop (free tier)');
say('   only fully validated observations become price history');
say('');
say('to be explicit: the production scraper is HTTP-first because that is');
say('sufficient for this storefront. The headed browser in this video wrote no');
say('prices — it is the observability surface over the same runner and the same');
say('run IDs shown above.');
say('');
say('persisted attempt rows (this run, same IDs as the browser showed):');
for (const [index, targetId] of trackedIds.entries()) {
  const [storeProductId, selectedOption] = pairs[index] as [string, string];
  await printChain(`${storeProductId}/${selectedOption}`, targetId);
}
await printChain('2626/o99', badId);
await sleep(10000);

// Guarantee the cut stays inside the required 2-4 minute window.
// Budget: baseline cut ran 2:32; added segments (intro, second fault,
// history, closing) add ~40s, so pad toward ~3:15 and never past 3:50.
const elapsed = Date.now() - started;
const pad = Math.min(195000 - elapsed, 230000 - elapsed);
if (pad > 0) await sleep(pad);

vite.kill('SIGINT');
await new Promise<void>((resolve) => server.close(() => resolve()));
await closePool();
writeFileSync(join(RECORDINGS_DIR, '.done'), new Date().toISOString());
say('done');
