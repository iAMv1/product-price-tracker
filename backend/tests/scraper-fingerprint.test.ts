import { describe, expect, it } from 'vitest';
import {
  HOVER_MAX_MOVES,
  HOVER_MIN_DWELL_MS,
  HOVER_THROTTLE_MS,
} from '../src/scraper/store/constants.js';
import { sha256Hex } from '../src/scraper/store/crypto.js';
import {
  buildFingerprint,
  synthesizeHoverSnapshot,
} from '../src/scraper/store/fingerprint.js';

describe('hover snapshot + fingerprint (SCRAPE-001)', () => {
  it('satisfies the trackers own thresholds (minMoves 8, minDwellMs 600)', () => {
    const now = 1_790_345_458_500;
    const snapshot = synthesizeHoverSnapshot(now);
    expect(snapshot.moves.length).toBeGreaterThanOrEqual(8);
    expect(snapshot.moves.length).toBeLessThanOrEqual(HOVER_MAX_MOVES);
    expect(snapshot.dwellMs).toBeGreaterThanOrEqual(HOVER_MIN_DWELL_MS);
    expect(snapshot.trusted).toBe(true);
    expect(snapshot.clickAt).toBe(now);

    for (let i = 1; i < snapshot.moves.length; i += 1) {
      const prev = snapshot.moves[i - 1];
      const curr = snapshot.moves[i];
      if (prev === undefined || curr === undefined)
        throw new Error('move missing');
      // Throttle-respecting spacing and monotonic timestamps.
      expect(curr[2] - prev[2]).toBeGreaterThanOrEqual(HOVER_THROTTLE_MS);
      // Inside a 1440x900 viewport, over the price area.
      expect(curr[0]).toBeGreaterThanOrEqual(0);
      expect(curr[0]).toBeLessThanOrEqual(1440);
      expect(curr[1]).toBeGreaterThanOrEqual(0);
      expect(curr[1]).toBeLessThanOrEqual(900);
    }
  });

  it('builds a well-formed att whose hash binds the derivations', () => {
    const now = 1_790_345_458_500;
    const snapshot = synthesizeHoverSnapshot(now);
    const { att, c } = buildFingerprint(snapshot, now);
    expect(c).toBe(sha256Hex(att));
    const parsed = JSON.parse(att) as {
      env: Record<string, unknown>;
      ix: unknown;
    };
    const env = parsed.env;
    expect(env['canvas']).toMatch(/^[0-9a-f]{16}$/);
    expect(env['gl']).toMatch(/^[0-9a-f]{16}$/);
    expect(parsed.ix).toEqual(snapshot);
  });
});
