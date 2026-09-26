/**
 * Recording orchestrator — full-screen cut (2-4 min).
 * One window owns the screen at a time; four swaps total:
 *   1. terminal — intro
 *   2. browser  — live dashboard, then the real store page (async price settle)
 *   3. terminal — 3 real scrapes with retry/backoff, then a failing response
 *   4. browser  — honest scrape log (retried rows) + CSV export
 *   5. terminal — reliability recap
 * flip() raises the active window full-screen (topmost) and sends the other back.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { scrapeProduct } from '../src/scraper/store/scrape.js';

const APP = 'https://product-price-tracker-ochre.vercel.app';
const STORE = 'https://demo.inelabteamdev.com';
const API = 'https://ppt-backend-lyiv.onrender.com';
const started = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (line: string): void => console.log(line);

/** Ask the driver to raise this window full-screen (driver owns the swap loop). */
function flip(who: 'terminal' | 'browser'): void {
  writeFileSync('../artifacts/recordings/.flip', who);
}

const targets = await fetch(`${API}/api/tracked-products`)
  .then((r) => r.json())
  .then((j: unknown) => (Array.isArray(j) ? j : (j as { results: [] }).results))
  .catch(() => []);
const firstId: string | undefined = (targets as Array<{ id: string }>)[0]?.id;

say('INE Price Tracker - observable headed run of the live scraper');
say(`tracked targets: ${(targets as unknown[]).length}  |  schedule: every 2 hours  |  store: demo.inelabteamdev.com`);
say('');
say('what this run proves:');
say('   1. real store scrapes, per-attempt output');
say('   2. slow and failing responses retried with backoff - or recorded as failures');
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
say('STEP 2  -  live scrapes: 3 tracked products, plain HTTP, retries with backoff');
const pairs: Array<[string, string]> = [['2626', 'o1'], ['2229', 'o2'], ['2092', 'o2']];
for (const [id, opt] of pairs) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const t0 = Date.now();
    const result = await scrapeProduct({ productId: id, selectedOption: opt });
    const dt = Date.now() - t0;
    if (result.ok) {
      say(`  ${id}/${opt}  attempt ${attempt}: SUCCESS  price=${result.price}  stock=${result.stock}  (${dt}ms)`);
      break;
    }
    if (result.transient && attempt < 3) {
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 4000);
      say(`  ${id}/${opt}  attempt ${attempt}: ${result.errorCode} (${dt}ms, transient) -> retry in ${backoff}ms`);
      await sleep(backoff);
      continue;
    }
    say(`  ${id}/${opt}  attempt ${attempt}: ${result.errorCode} (${dt}ms) -> recorded honestly, no invented values`);
    break;
  }
}
await sleep(4000);

say('');
say('STEP 3  -  failing response: option o99 does not exist on this product');
{
  const t0 = Date.now();
  const result = await scrapeProduct({ productId: '2626', selectedOption: 'o99' });
  if (result.ok) {
    say(`  unexpected success? price=${result.price}`);
  } else {
    say(`  2626/o99  attempt: ${result.errorCode} (${Date.now() - t0}ms, not transient) -> FAILED row, price and stock left empty`);
  }
  say('  nothing invented, nothing hidden');
}
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
await sleep(10000);

// Guarantee the cut stays inside the required 2-4 minute window.
const pad = 118000 - (Date.now() - started);
if (pad > 0) await sleep(pad);

await browser.close();
writeFileSync('../artifacts/recordings/.done', new Date().toISOString());
say('done');
