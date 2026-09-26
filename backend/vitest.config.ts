import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The scheduler tests assert the Bearer contract against a fixed token.
    // Pinning it here keeps the suite hermetic: CI has no .env, a fresh
    // checkout may have none either, and dotenv never overrides variables
    // that are already set — so every environment runs the same contract.
    env: {
      CRON_SECRET: 'dev-cron-secret',
    },
  },
});
