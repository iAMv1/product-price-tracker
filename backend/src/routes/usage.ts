import { Router, type Request, type Response } from 'express';
import {
  getUsageStats,
  recordUsagePing,
} from '../persistence/repositories.js';
import { requireDb } from '../http/deps.js';

/**
 * Deployment usage telemetry (owner visibility into who uses this backend).
 *
 * Why headers, not a body: fetch/sendBeacon always send Origin/Referer, and
 * browser JavaScript cannot set Origin arbitrarily — a self-reported body
 * field would be gameable by any client. (An arbitrary HTTP client can of
 * course forge headers; this telemetry distinguishes deployments, not
 * attackers.)
 * Why no IP/UA storage: the question is "which sites hit my API", and
 * answering it needs hosts only; storing less is the privacy posture.
 */
function hostOf(value: string | undefined): string {
  if (!value) return '';
  try {
    return new URL(value).hostname.slice(0, 253);
  } catch {
    return '';
  }
}

export const usageRouter = Router();

usageRouter.post('/usage-ping', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  await recordUsagePing(db, {
    originHost: hostOf(req.get('origin')),
    path: typeof req.body?.path === 'string' ? req.body.path.slice(0, 512) : '',
    referrerHost: hostOf(req.get('referer')),
  });
  res.status(202).json({ recorded: true });
});

usageRouter.get('/usage-stats', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  res.json(await getUsageStats(db));
});
