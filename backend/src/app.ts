import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
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
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('[ppt] unhandled request error:', message);

  res.status(500).json({
    error: 'internal_error',
    message,
  });
};

/**
 * Builds the Express application without binding a port, so tests can exercise
 * routes in-process via supertest. Deps are injectable: tests pass fakes,
 * production omits them (lazy DATABASE_URL, global fetch, real scraper).
 */
export function createApp(deps: AppDeps = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  if (deps.db !== undefined) app.locals.db = deps.db;
  if (deps.storeFetch !== undefined) app.locals.storeFetch = deps.storeFetch;
  if (deps.scrape !== undefined) app.locals.scrape = deps.scrape;

  app.use('/health', healthRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/tracked-products', trackedRouter);
  app.use('/api/internal', internalRouter);
  app.use('/api', exportRouter);

  app.use(notFound);
  app.use(handleError);

  return app;
}
