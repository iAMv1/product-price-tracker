import { Router } from 'express';
import { env, integrationReadiness } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'product-price-tracker-backend',
    environment: env.nodeEnv,
    integrations: integrationReadiness(),
    checkedAt: new Date().toISOString(),
  });
});
