import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { listActiveTrackedProducts } from '../persistence/repositories.js';
import { rowToTarget, runAllTargets } from '../scraper/runner.js';
import { readDeps, requireDb } from '../http/deps.js';

/**
 * Scheduler entrypoint (SCHED-001). External cron (cron-job.org) POSTs here
 * every 2 hours with `Authorization: Bearer <CRON_SECRET>`. No in-process
 * loop anywhere — free-tier instances may sleep between invocations.
 */

export const internalRouter = Router();

function authorized(req: Request): boolean {
  const header = req.headers.authorization ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = env.cronSecret;
  if (presented === '' || expected === '') return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

internalRouter.post('/scrape-all', async (req: Request, res: Response) => {
  if (!authorized(req)) {
    res.status(401).json({ error: 'unauthorized', message: 'valid Bearer CRON_SECRET required' });
    return;
  }
  const db = await requireDb(req, res);
  if (db === null) return;
  const { scrape } = readDeps(req);
  const rows = await listActiveTrackedProducts(db);
  const summary = await runAllTargets(db, {
    triggerType: 'scheduled',
    targets: rows.map(rowToTarget),
    scrape,
  });
  res.json(summary);
});
