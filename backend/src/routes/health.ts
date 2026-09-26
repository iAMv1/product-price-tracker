import { Router } from 'express';
import { env, integrationReadiness } from '../config/env.js';
import { resolveDb } from '../http/deps.js';

export const healthRouter = Router();

/**
 * Cheap health probe (hit by the keep-alive layers every ~10 minutes).
 * Two different questions, reported separately:
 *   integrations.* — is the configuration present at all (env presence)
 *   database       — can we actually talk to it right now (SELECT 1, 2s cap)
 * Always HTTP 200 while the process serves: a DB blip must not make the
 * runtime declare the SERVICE dead (Render health checks / keep-alive would
 * thrash), but the body makes dependency state visible to operators and to
 * the cron keep-alive's stored response body.
 */
healthRouter.get('/', async (req, res) => {
  let database: 'not_configured' | 'reachable' | 'unreachable';
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const db = await resolveDb(req);
    if (db === null) {
      database = 'not_configured';
    } else {
      await Promise.race([
        db.query('SELECT 1'),
        new Promise<never>((_, reject) => {
          probeTimer = setTimeout(() => reject(new Error('db probe timeout')), 2000);
        }),
      ]);
      database = 'reachable';
    }
  } catch {
    database = 'unreachable';
  } finally {
    if (probeTimer !== undefined) clearTimeout(probeTimer);
  }
  res.json({
    status: 'ok',
    service: 'product-price-tracker-backend',
    environment: env.nodeEnv,
    integrations: integrationReadiness(),
    database,
    checkedAt: new Date().toISOString(),
  });
});
