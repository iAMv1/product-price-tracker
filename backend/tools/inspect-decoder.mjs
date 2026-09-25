#!/usr/bin/env node
/**
 * Phase 1 (STORE-001): find the string table behind the `P` decoder.
 *
 * Established so far, from the bundle:
 *
 *   var P = lr;
 *   function lr(e, t) {
 *     e -= 164;                 // index offset
 *     let n = ur(), r = n[e];   // ur() supplies the table
 *     ...
 *     lr.vScEMk = <decoder>     // base64 with swapped letter case -> percent -> decodeURIComponent
 *   }
 *
 * This locates `ur` and prints its body so the table can be reproduced.
 *
 * Run: node backend/tools/inspect-decoder.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(HERE, '..', 'tests', 'fixtures', 'raw');

async function findBundle() {
  const entries = await readdir(RAW_DIR);
  const match = entries.find((name) => /^assets_index-.*\.js$/.test(name));
  if (match === undefined) throw new Error(`No bundle in ${RAW_DIR}.`);
  return join(RAW_DIR, match);
}

function show(source, index, before, after, label) {
  console.log(`\n=== ${label} @ ${index} ===`);
  console.log(source.slice(Math.max(0, index - before), index + after));
}

async function main() {
  const source = await readFile(await findBundle(), 'utf8');

  const anchor = source.indexOf('var P=lr;');
  console.log(`[decoder] "var P=lr;" at ${anchor}`);
  if (anchor === -1) throw new Error('decoder anchor not found; bundle changed');

  // The table supplier is called immediately inside the decoder.
  const urUse = source.indexOf('ur()', anchor);
  console.log(`[decoder] first ur() use at ${urUse}`);
  show(source, urUse, 120, 200, 'ur() use site');

  // Locate the definition of ur. Minifiers emit one of a few shapes.
  const patterns = [
    /function\s+ur\s*\(/g,
    /(?:var|let|const)\s+ur\s*=/g,
    /\bur\s*=\s*function/g,
    /\bur\s*=\s*\(\)\s*=>/g,
  ];

  let found = false;
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      found = true;
      show(source, match.index, 60, 900, `definition matching ${pattern}`);
    }
  }

  if (!found) {
    console.log('\n[decoder] no direct definition matched. Dumping the region before');
    console.log('the decoder, which is where the table is usually defined.');
    show(source, anchor, 4000, 200, 'region before decoder');
  }
}

main().catch((error) => {
  console.error('[decoder] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
