#!/usr/bin/env node
/**
 * Phase 1 (STORE-001): decode the bundle's obfuscated string table.
 *
 * The bundle hides every interesting constant behind a numeric lookup:
 *
 *   var P = lr;
 *   function lr(e) { e -= 164; let n = ur(), r = n[e]; return lr.vScEMk(r) }
 *
 * where `ur()` is the table and `vScEMk` is a base64 variant. The table is a
 * single dot-separated literal, and a self-defending wrapper rotates the array
 * at load time:
 *
 *   (function (e, t) { ... r.push(r.shift()) ... })(ur, 362272);
 *
 * Rather than transcribe the decoder (and risk getting the operator precedence
 * in its for-loop wrong), this extracts `vScEMk` verbatim and evaluates it. The
 * rotation is then recovered by brute force using a known oracle: `P(242)` must
 * be `"length"`, because callers use it as `.length`.
 *
 * Run: node backend/tools/decode-table.mjs [--all]
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(HERE, '..', 'tests', 'fixtures', 'raw');
const OUT_FILE = join(RAW_DIR, 'decoded_strings.json');

const INDEX_OFFSET = 164;

async function findBundle() {
  const entries = await readdir(RAW_DIR);
  const match = entries.find((name) => /^assets_index-.*\.js$/.test(name));
  if (match === undefined) throw new Error(`No bundle in ${RAW_DIR}.`);
  return join(RAW_DIR, match);
}

/** Extracts the dot-separated table literal from `function ur()`. */
function extractTableLiteral(source) {
  const anchor = source.indexOf('function ur(){');
  if (anchor === -1) throw new Error('function ur() not found');

  const firstTick = source.indexOf('`', anchor);
  const secondTick = source.indexOf('`', firstTick + 1);
  if (firstTick === -1 || secondTick === -1) throw new Error('table literal not found');

  return source.slice(firstTick + 1, secondTick);
}

/** Extracts `lr.vScEMk = function (e) { ... }` exactly, via brace matching. */
function extractDecoderSource(source) {
  const anchor = source.indexOf('lr.vScEMk=');
  if (anchor === -1) throw new Error('lr.vScEMk not found');

  const start = source.indexOf('function', anchor);
  const open = source.indexOf('{', start);
  if (start === -1 || open === -1) throw new Error('decoder body not found');

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced decoder body');
}

function main2() {}

async function main() {
  const bundlePath = await findBundle();
  const source = await readFile(bundlePath, 'utf8');

  const tableLiteral = extractTableLiteral(source);
  const table = tableLiteral.split('.');
  const decoderSource = extractDecoderSource(source);

  console.log(`[decode] table entries  : ${table.length}`);
  console.log(`[decode] table chars    : ${tableLiteral.length}`);
  console.log(`[decode] decoder source : ${decoderSource.slice(0, 80)}...`);

  // Evaluate the decoder exactly as shipped, rather than reimplementing it.
  const decodeEntry = eval(`(${decoderSource})`);

  // Which rotation does the self-defending wrapper settle on? Recover it from
  // the one index whose meaning is certain: P(242) is used as `.length`.
  const wantedIndex = 242 - INDEX_OFFSET;
  let rotation = -1;
  let rotated = null;

  // The loader does `r.push(r.shift())` repeatedly, so after k shifts the entry
  // at logical position i is the original at (i + k) % N. Build that array and
  // test it directly, so the search cannot disagree with the result it selects.
  for (let k = 0; k < table.length; k += 1) {
    const candidateArray = [...table.slice(k), ...table.slice(0, k)];
    const encoded = candidateArray[wantedIndex];
    if (encoded === undefined) continue;
    try {
      if (decodeEntry(encoded) === 'length') {
        rotation = k;
        rotated = candidateArray;
        break;
      }
    } catch {
      /* not a decodable entry */
    }
  }

  if (rotation === -1 || rotated === null) {
    throw new Error('could not recover the table rotation');
  }
  console.log(`[decode] rotation       : ${rotation} shifts (recovered via P(242) === "length")`);

  const decode = (index) => {
    const encoded = rotated[index - INDEX_OFFSET];
    if (encoded === undefined) return undefined;
    try {
      return decodeEntry(encoded);
    } catch {
      return undefined;
    }
  };

  // Sanity check against values already known from reading the code.
  const expectations = [
    [242, 'length'],
    [285, 'char'],
    [264, 'CodeAt'],
  ];
  console.log('\n--- sanity checks ------------------------------------------');
  for (const [index, expected] of expectations) {
    const actual = decode(index);
    const ok = actual === expected;
    console.log(`  P(${index}) = ${JSON.stringify(actual)} expected ${JSON.stringify(expected)} ${ok ? 'OK' : 'MISMATCH'}`);
  }

  const map = {};
  for (let index = 0; index < table.length + INDEX_OFFSET; index += 1) {
    const value = decode(index);
    if (value !== undefined && value !== '') map[index] = value;
  }

  await writeFile(OUT_FILE, JSON.stringify(map, null, 2), 'utf8');
  console.log(`\n[decode] wrote ${Object.keys(map).length} strings to ${OUT_FILE}`);

  const interesting = [164, 177, 183, 185, 186, 187, 188, 191, 193, 197, 199, 200, 205, 207, 215, 216, 220, 221, 225, 227, 232, 239, 240, 241, 242, 245, 246, 249, 250, 252, 253, 254, 258, 259, 261, 263, 267, 270, 271, 273, 277, 282, 286, 288, 289, 291, 292, 294, 295, 297, 299];
  console.log('\n--- the indices that matter --------------------------------');
  for (const index of interesting) {
    console.log(`  P(${index}) = ${JSON.stringify(decode(index))}`);
  }

  if (process.argv.includes('--all')) {
    console.log('\n--- all entries -------------------------------------------');
    for (const [index, value] of Object.entries(map)) {
      console.log(`  P(${index}) = ${JSON.stringify(value)}`);
    }
  }
}

main().catch((error) => {
  console.error('[decode] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
