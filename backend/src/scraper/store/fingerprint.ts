import {
  CANVAS_PROBE,
  GL_PROBE,
  HOVER_MAX_MOVES,
  HOVER_THROTTLE_MS,
} from './constants.js';
import { fnvHash16, sha256Hex } from './crypto.js';

/**
 * Interaction-gate telemetry (OBS-20260925-003/004). The client passes the
 * hover tracker's snapshot as the fingerprint's `ix`; the server only checks
 * plausibility (thresholds below), which a synthesized snapshot satisfies —
 * confirmed by the 200 in VER-20260925-002.
 */

export interface HoverSnapshot {
  hoverAt: number;
  dwellMs: number;
  moves: Array<[number, number, number]>;
  clickAt: number;
  trusted: boolean;
}

/**
 * Deterministic dwell over the price area: 40 moves, 65ms apart (above the
 * 40ms throttle), monotonic timestamps, dwell well past 600ms, coordinates
 * inside a 1440x900 viewport over the price area. `now` is injectable so
 * tests can pin the output.
 */
export function synthesizeHoverSnapshot(now: number = Date.now()): HoverSnapshot {
  const moveCount = HOVER_MAX_MOVES;
  const stepMs = HOVER_THROTTLE_MS + 25;
  const span = moveCount * stepMs;
  const hoverAt = now - span - 400;

  const moves: Array<[number, number, number]> = [];
  let x = 640;
  let y = 470;
  for (let i = 0; i < moveCount; i += 1) {
    x += ((i * 37) % 23) - 11;
    y += ((i * 53) % 17) - 8;
    x = Math.min(1180, Math.max(560, x));
    y = Math.min(540, Math.max(455, y));
    moves.push([x, y, hoverAt + i * stepMs]);
  }

  return { hoverAt, dwellMs: now - hoverAt, moves, clickAt: now, trusted: true };
}

export interface Fingerprint {
  /** `att` — the exact JSON string sent on the wire (its hash is verified). */
  att: string;
  /** `c = _r(att)` — fingerprint hash binding every derived value. */
  c: string;
}

/** Plausible desktop environment; only its hash is ever verified. */
export function buildFingerprint(
  snapshot: HoverSnapshot,
  now: number = Date.now(),
): Fingerprint {
  const att = JSON.stringify({
    env: {
      canvas: fnvHash16(CANVAS_PROBE),
      gl: fnvHash16(GL_PROBE),
      hc: 8,
      scr: [1920, 1080, 1],
      frames: [16.6, 16.7, 16.6, 16.8, 16.7, 16.6, 16.7, 16.6],
      at: now,
    },
    ix: snapshot,
  });
  return { att, c: sha256Hex(att) };
}
