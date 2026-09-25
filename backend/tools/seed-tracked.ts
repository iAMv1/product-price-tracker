#!/usr/bin/env tsx
/**
 * Seed the 2–3 tracked products the assignment requires on the live
 * dashboard. Each track triggers an immediate first scrape, so history and
 * logs exist from minute one; the 2-hour cron then extends them unattended.
 *
 * Run: npx tsx tools/seed-tracked.ts <backend-base-url>
 * Example: npx tsx tools/seed-tracked.ts https://ppt-backend.onrender.com
 */
const BASE = (process.argv[2] ?? 'http://localhost:4000').replace(/\/$/, '');

const SEEDS = [
  { storeProductId: '2626', selectedOption: 'o1' }, // Redwick Ukulele Nano — Instrument only
  { storeProductId: '2229', selectedOption: 'o2' }, // Tamarack MIDI Keyboard Edge — Starter bundle
  { storeProductId: '2092', selectedOption: 'o2' }, // Junova Kids Tablet Go — 128 GB
];

let failed = 0;
for (const seed of SEEDS) {
  const response = await fetch(`${BASE}/api/tracked-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(seed),
  });
  const body = (await response.json()) as Record<string, unknown>;
  console.log(
    `${seed.storeProductId}/${seed.selectedOption} -> HTTP ${response.status}`,
    JSON.stringify({
      productName: body['productName'],
      deduped: body['deduped'],
      firstScrape: body['firstScrape'],
    }),
  );
  if (!response.ok) failed += 1;
}
if (failed > 0) {
  console.error(`seeded with ${failed} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('seeded 3 tracked targets');
}
