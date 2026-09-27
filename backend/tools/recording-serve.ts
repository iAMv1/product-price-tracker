/**
 * Manual recording rig: runs the observable chain and IDLES so a human can
 * drive the screens while the terminal narrates every request live.
 *
 *   REAL STORE -> LOCAL BACKEND :4100 (fault-armed, HTTP-logged) ->
 *   LOCAL DB -> LOCAL FRONTEND :5175 -> human's browser + recorder.
 *
 * No browser automation, no seeding, no scripted scrapes: every row the
 * terminal prints comes from the human's own clicks. Ctrl+C stops everything.
 *
 * Safety: refuses non-localhost DATABASE_URL before anything boots.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { closePool, getPool } from '../src/persistence/db.js';
import { withDemoFault } from './fault-inject.js';
import { scrapeProduct } from '../src/scraper/store/scrape.js';

const BACKEND_PORT = 4100;
const FRONTEND_PORT = 5175;
const LOCAL_API = `http://127.0.0.1:${BACKEND_PORT}`;
const LOCAL_APP = `http://localhost:${FRONTEND_PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
{
  const raw = process.env['DATABASE_URL'];
  let host: string | null = null;
  try {
    host = raw === undefined || raw.trim() === '' ? null : new URL(raw.trim()).hostname;
  } catch {
    host = null;
  }
  if (host === null || !LOCAL_DB_HOSTS.has(host)) {
    console.error(
      `[recording] refusing to run: DATABASE_URL must point at local Postgres ` +
        `(got ${host === null ? 'missing/unparsable' : JSON.stringify(host)}).`,
    );
    process.exit(1);
  }
}

// Request log ON (access + upstream fetch lines), fault armed for the demo:
// the human's FIRST manual scrape fails once with HTTP 503, then the runner
// retries it to success — the retried->success chain, live, on their click.
process.env['PPT_HTTP_LOG'] ??= '1';
if ((process.env['DEMO_FAULT'] ?? '') === '') {
  process.env['DEMO_FAULT'] = 'http-503-once';
}

const pool = await getPool();
if (pool === null) throw new Error('[recording] getPool() returned null despite local DATABASE_URL');
const db = pool;
const app = createApp({ db, scrape: withDemoFault(scrapeProduct) });
const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
  const s = app.listen(BACKEND_PORT, '127.0.0.1', () => resolve(s));
});
console.log(`[recording] local backend on ${LOCAL_API} (fault-armed, request log ON)`);

const frontendDir = join(process.cwd(), '..', 'frontend');
const viteBin = join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
const vite: ChildProcess = spawn(
  process.execPath,
  [viteBin, '--port', String(FRONTEND_PORT), '--strictPort'],
  { cwd: frontendDir, stdio: 'inherit', env: { ...process.env, VITE_BACKEND_ORIGIN: LOCAL_API } },
);
async function waitFor(url: string, label: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`[recording] ${label} ready`);
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

console.log('');
console.log('CHAIN IS LIVE. Open in your browser (and record this terminal + browser):');
console.log(`  ${LOCAL_APP}/#/app`);
console.log('');
console.log('Every line below comes from YOUR clicks: [http] = your browser calling');
console.log('the local API, [store] = the runner fetching the real INE mock store,');
console.log('[ppt][timing] = scrape vs DB-commit vs HTTP attribution.');
console.log('Your FIRST manual scrape carries an armed HTTP 503: watch attempt 1');
console.log('-> retried, backoff, attempt 2 -> success. Production path is HTTP-first;');
console.log('no browser writes prices. Ctrl+C here stops backend + frontend.');
console.log('');

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  vite.kill('SIGINT');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
  console.log('[recording] stopped');
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
await new Promise(() => {});
