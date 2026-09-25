import { createApp } from './app.js';
import { assertProductionConfig, env } from './config/env.js';

assertProductionConfig();

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(
    `[ppt] backend listening on http://localhost:${env.port} (${env.nodeEnv})`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[ppt] received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  });
}
