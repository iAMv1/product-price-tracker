import { Router, type Request, type Response } from 'express';
import { listRuns } from '../persistence/repositories.js';
import { requireDb } from '../http/deps.js';

/** Run feed: recent scheduler/manual/headed invocations with batch counts. */
export const runsRouter = Router();

runsRouter.get('/runs', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const raw = req.query['limit'];
  const limit = typeof raw === 'string' ? Number(raw) : NaN;
  res.json({ results: await listRuns(db, Number.isInteger(limit) ? limit : 20) });
});
