import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import type { AppDeps } from './http/deps.js';
import { alertsRouter } from './routes/alerts.js';
import { byProductRouter } from './routes/byproduct.js';
import { changeRouter } from './routes/change.js';
import { exportRouter } from './routes/export.js';
import { healthRouter } from './routes/health.js';
import { internalRouter } from './routes/internal.js';
import { productsRouter } from './routes/products.js';
import { runsRouter } from './routes/runs.js';
import { trackedRouter } from './routes/tracked.js';

const notFound: RequestHandler = (req, res) => {
  // Reflect only a sanitized path — never raw attacker-controlled text.
  const safePath = req.path.replace(/[^a-zA-Z0-9/._-]/g, '').slice(0, 120);
  res.status(404).json({
    error: 'not_found',
    message: `No route matches ${req.method} ${safePath}`,
  });
};

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  // Log the detail server-side; the client gets a generic shape so pg
  // constraint text and stack traces never leak to callers.
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('[ppt] unhandled request error:', message);

  // Body-parser marks client faults with .type — surface the right status
  // instead of laundering every client mistake into a 500.
  const type = (error as { type?: string }).type;
  const status = (error as { status?: number }).status;
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large', message: 'request body exceeds 100kb' });
    return;
  }
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'bad_request', message: 'malformed JSON body' });
    return;
  }
  const safeStatus = typeof status === 'number' && status >= 400 && status < 500 ? status : 500;
  res.status(safeStatus).json(
    safeStatus === 500
      ? { error: 'internal_error', message: 'unexpected error' }
      : { error: 'request_failed', message },
  );
};

/**
 * One search walks up to 40 upstream store pages: without a throttle a burst
 * of searches multiplies into thousands of upstream fetches. The authed
 * scheduler endpoint is exempt (1 call per 2h + Bearer secret).
 */
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

/**
 * The cron endpoint is exempt from the public bucket (1 call / 2 h) — but
 * exempt must not mean UNTHROTTLED: without a gate, unauthenticated 401s
 * from secret guessing would run at ~180/s forever. 30 / 15 min covers
 * cron-job.org plus manual runs and makes brute force pointless.
 */
const internalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'too many internal calls' },
});

/**
 * Search is THE amplification point (≤40 upstream pages × 3 retries per
 * call). Type-ahead fires often and the recording session repeats queries,
 * so this sub-limit is generous per client while still bounding the
 * upstream storm a single IP can trigger: 60 searches / 15 min.
 */
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'too many searches — wait a few minutes' },
});

/**
 * Builds the Express application without binding a port, so tests can exercise
 * routes in-process via supertest. Deps are injectable: tests pass fakes,
 * production omits them (lazy DATABASE_URL, global fetch, real scraper).
 */
export function createApp(deps: AppDeps = {}) {
  const app = express();

  // Render's proxy appends the real client IP as the last X-Forwarded-For
  // hop; trust exactly one proxy so express-rate-limit keys per client
  // instead of collapsing every visitor into one shared global bucket.
  app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(helmet());
  // `*` must mean "any origin" (string) — as an array entry it silently
  // matches nothing and fail-closes CORS while looking configured.
  const corsOrigin = env.corsOrigins.includes('*') ? '*' : env.corsOrigins;
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  if (deps.db !== undefined) app.locals.db = deps.db;
  if (deps.storeFetch !== undefined) app.locals.storeFetch = deps.storeFetch;
  if (deps.scrape !== undefined) app.locals.scrape = deps.scrape;

  app.use('/health', healthRouter);
  app.use('/api/internal', internalLimiter);
  app.use('/api/internal', internalRouter);
  app.use('/api', publicApiLimiter);
  app.use('/api/products/search', searchLimiter);
  app.use('/api/products', productsRouter);
  app.use('/api/tracked-products', byProductRouter);
  app.use('/api/tracked-products', trackedRouter);
  app.use('/api', changeRouter);
  app.use('/api', alertsRouter);
  app.use('/api', runsRouter);
  app.use('/api', exportRouter);

  app.use(notFound);
  app.use(handleError);

  return app;
}
