#!/usr/bin/env node
/**
 * Phase 1 (STORE-001) spike — final attempt.
 *
 * Everything tried so far, and the outcome:
 *   - hover() + stationary dwell            -> locked, no network request
 *   - slow approach + 4s dwell              -> locked, no network request
 *   - continuous regular movement for 15s   -> locked, no network request
 *   - headed browser, webdriver masked      -> locked
 *   - 312 trusted mousemove events received -> locked
 *
 * The page accepts the events as trusted and still refuses to request a price.
 * So the gate is analysing movement *shape*, not event authenticity. This run
 * uses a seeded random walk with variable velocity and pauses, and polls the
 * copy text throughout so we can see whether any intermediate state is reached.
 *
 * Run: node backend/tools/read-price-spike.mjs [itemId]
 */

import { chromium } from 'playwright';

const BASE = (process.env['STORE_URL'] ?? 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const ITEM_ID = process.argv[2] ?? '2626';
const IGNORE = /\.(js|css|png|jpg|jpeg|svg|woff2?|ico)(\?|$)/;

/** Deterministic PRNG so an attempt is reproducible when it works. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function fetchManifest() {
  const response = await fetch(`${BASE}/api/v2/ui/manifest`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
  return response.json();
}

async function readCopy(page, classes) {
  return page.evaluate((cls) => {
    const element = document.querySelector(`.${cls['priceWrap']}`);
    const inner = element === null ? null : element.querySelector('button, [role="button"], a');
    return {
      wrap: element === null ? null : (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
      action: inner === null ? null : (inner.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
      hasRupee: document.body.innerText.includes('₹'),
    };
  }, classes);
}

async function main() {
  const manifest = await fetchManifest();
  console.log(`[spike] revision ${manifest.revision}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  page.on('request', (request) => {
    const url = request.url();
    if (!IGNORE.test(url)) console.log(`  -> ${request.method()} ${url.replace(BASE, '')}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!IGNORE.test(url)) console.log(`  <- ${response.status()} ${url.replace(BASE, '')}`);
  });

  try {
    await page.goto(`${BASE}/item/${ITEM_ID}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    const box = await page.locator(`.${manifest.classes.priceWrap}`).first().boundingBox();
    if (box === null) throw new Error('price area has no bounding box');
    console.log(`[spike] price area ${JSON.stringify(box)}`);

    const before = await readCopy(page, manifest.classes);
    console.log(`[spike] initial copy: ${JSON.stringify(before.wrap)}`);

    const random = makeRandom(20260925);
    const seen = new Set();
    let unlocked = false;

    // Approach from outside the element, then wander inside it at human speed.
    await page.mouse.move(4, 4);
    await page.waitForTimeout(200 + random() * 400);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 12 + Math.floor(random() * 30),
    });

    const deadline = Date.now() + 35_000;
    let tick = 0;

    while (Date.now() < deadline) {
      tick += 1;

      // Wander within the element with varying step size, not a fixed pattern.
      const targetX = box.x + 10 + random() * Math.max(1, box.width - 20);
      const targetY = box.y + 10 + random() * Math.max(1, box.height - 20);
      await page.mouse.move(targetX, targetY, { steps: 1 + Math.floor(random() * 6) });

      // Variable dwell: sometimes fast, sometimes a pause, like a real hand.
      const pause = random() < 0.25 ? 300 + random() * 700 : 20 + random() * 90;
      await page.waitForTimeout(pause);

      const state = await readCopy(page, manifest.classes);
      const signature = `${state.wrap ?? ''}|${state.action ?? ''}`;
      if (!seen.has(signature)) {
        seen.add(signature);
        console.log(`  [t+${tick}] state change: ${JSON.stringify(state.action)} / ${JSON.stringify(state.wrap)}`);
      }

      if (state.hasRupee) {
        unlocked = true;
        console.log(`  [t+${tick}] PRICE APPEARED`);
        break;
      }
    }

    const finalState = await readCopy(page, manifest.classes);
    const rupees = await page.evaluate(
      () => (document.body.innerText.match(/₹\s?[\d,]+(?:\.\d+)?/g) ?? []).slice(0, 8),
    );

    console.log('\n--- final --------------------------------------------------');
    console.log(`  wrap   : ${finalState.wrap}`);
    console.log(`  action : ${finalState.action}`);
    console.log(`  ₹      : ${JSON.stringify(rupees)}`);
    console.log(`  states seen: ${seen.size}`);

    console.log('\n--- verdict ------------------------------------------------');
    console.log(
      unlocked
        ? 'PASS — randomised human-shaped movement unlocked the price.'
        : 'LOCKED — the gate rejects automated pointer input even when it is trusted,',
    );
    if (!unlocked) {
      console.log('  randomised, variable-velocity and sustained for 35s.');
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[spike] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
