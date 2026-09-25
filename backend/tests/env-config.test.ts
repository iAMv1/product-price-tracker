import { describe, expect, it } from 'vitest';
import { assertProductionConfig } from '../src/config/env.js';

describe('assertProductionConfig', () => {
  it('passes outside production regardless of credentials', () => {
    expect(() =>
      assertProductionConfig({ nodeEnv: 'development', databaseUrl: '', cronSecret: '' }),
    ).not.toThrow();
    expect(() =>
      assertProductionConfig({ nodeEnv: 'test', databaseUrl: '', cronSecret: '' }),
    ).not.toThrow();
  });

  it('refuses production boot naming every missing credential', () => {
    expect(() =>
      assertProductionConfig({ nodeEnv: 'production', databaseUrl: '', cronSecret: '' }),
    ).toThrow(/DATABASE_URL.*CRON_SECRET/);
    expect(() =>
      assertProductionConfig({ nodeEnv: 'production', databaseUrl: 'x', cronSecret: '' }),
    ).toThrow(/CRON_SECRET/);
  });

  it('passes production boot when both credentials exist', () => {
    expect(() =>
      assertProductionConfig({ nodeEnv: 'production', databaseUrl: 'x', cronSecret: 'y' }),
    ).not.toThrow();
  });
});
