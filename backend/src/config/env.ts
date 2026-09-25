import 'dotenv/config';

function readOptional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function readPort(): number {
  const raw = readOptional('PORT', '4000');
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid PORT: ${JSON.stringify(raw)}`);
  }
  return port;
}

const nodeEnv = readOptional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

export const env = {
  nodeEnv,
  isProduction,

  port: readPort(),

  /** Supabase Postgres connection string. Empty until credentials exist. */
  databaseUrl: readOptional('DATABASE_URL', ''),

  /** INE mock store origin. Overridable for probes against a mirror. */
  storeUrl: readOptional(
    'STORE_URL',
    'https://demo.inelabteamdev.com',
  ).replace(/\/$/, ''),

  /** Shared secret the external scheduler must present on internal endpoints. */
  cronSecret: readOptional('CRON_SECRET', isProduction ? '' : 'dev-cron-secret'),

  /** Comma-separated list of allowed browser origins. */
  corsOrigins: readOptional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ''),
} as const;

/**
 * Reports which external integrations are configured, without ever exposing a
 * credential. Surfaced on /health so the deployment phase can be verified from
 * a single request instead of guessing from logs.
 */
export function integrationReadiness(): {
  database: boolean;
  schedulerAuth: boolean;
} {
  return {
    database: env.databaseUrl !== '',
    schedulerAuth: env.cronSecret !== '',
  };
}

/**
 * Fails fast on boot when a production deployment is missing a credential that
 * correctness or security depends on. Deliberately not called in tests.
 */
export function assertProductionConfig(): void {
  if (!isProduction) return;

  const missing: string[] = [];
  if (env.databaseUrl === '') missing.push('DATABASE_URL');
  if (env.cronSecret === '') missing.push('CRON_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Refusing to start in production without: ${missing.join(', ')}`,
    );
  }
}
