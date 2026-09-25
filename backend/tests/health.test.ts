import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('reports ok and the readiness of each integration', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'product-price-tracker-backend',
    });
    expect(response.body.integrations).toEqual({
      database: expect.any(Boolean),
      schedulerAuth: expect.any(Boolean),
      userAuth: expect.any(Boolean),
    });
    expect(Number.isNaN(Date.parse(response.body.checkedAt))).toBe(false);
  });

  it('does not leak credential values', async () => {
    const response = await request(createApp()).get('/health');

    expect(JSON.stringify(response.body)).not.toContain('postgres');
    expect(JSON.stringify(response.body)).not.toContain('dev-cron-secret');
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404 rather than an HTML error page', async () => {
    const response = await request(createApp()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.error).toBe('not_found');
  });
});
