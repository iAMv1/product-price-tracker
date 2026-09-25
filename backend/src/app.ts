import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import type { AppDeps } from './http/deps.js';
import { exportRouter } from './routes/export.js';
import { healthRouter } from './routes/health.js';
import { internalRouter } from './routes/internal.js';
import { productsRouter } from './routes/products.js';
import { trackedRouter } from './routes/tracked.js';

const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `No route matches ${req.method} ${req.path}`,
  });
};

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  // Log the detail server-side; the client gets a generic shape so pg
  // constraint text and stack traces never leak to callers.
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('[ppt] unhandled request error:', message);

  res.status(500).json({
    error: 'internal_error',
    message: 'unexpected error',
  });
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
 * Builds the Express application without binding a port, so tests can exercise
 * routes in-process via supertest. Deps are injectable: tests pass fakes,
 * production omits them (lazy DATABASE_URL, global fetch, real scraper).
 */
export function createApp(deps: AppDeps = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  if (deps.db !== undefined) app.locals.db = deps.db;
  if (deps.storeFetch !== undefined) app.locals.storeFetch = deps.storeFetch;
  if (deps.scrape !== undefined) app.locals.scrape = deps.scrape;

  app.use('/health', healthRouter);
  app.use('/api/internal', internalRouter);
  app.use('/api', publicApiLimiter);
  app.use('/api/products', productsRouter);
  app.use('/api/tracked-products', trackedRouter);
  app.use('/api', exportRouter);

  app.use(notFound);
  app.use(handleError);

  return app;
}
