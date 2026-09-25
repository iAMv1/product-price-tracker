#!/usr/bin/env node
/**
 * Phase 1 (STORE-001): recover the obfuscated string table and its decoder.
 *
 * The bundle reaches its string constants numerically (`P(193)`, `n(227)`,
 * `t(242)`) rather than writing them out. Those lookups hide the challenge
 * endpoint and the price path.
 *
 * A previous attempt looked for strictly adjacent string literals and found
 * nothing, because array elements are comma-separated. This version allows
 * commas and whitespace between literals, then locates the decoder that indexes
 * the table.
 *
 * Run: node backend/tools/extract-strings.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(HERE, '..', 'tests', 'fixtures', 'raw');

async function findBundle() {
  const entries = await readdir(RAW_DIR);
  const match = entries.find((name) => /^assets_index-.*\.js$/.test(name));
  if (match === undefined) throw new Error(`No bundle in ${RAW_DIR}. Run discover-store.mjs first.`);
  return join(RAW_DIR, match);
}

function literalsOf(source) {
  const out = [];
  const re = /`(?:[^`\\]|\\.){0,400}?`|"(?:[^"\\]|\\.){0,400}?"|'(?:[^'\\]|\\.){0,400}?'/g;
  for (const match of source.matchAll(re)) {
    out.push({ index: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return out;
}

/** Literals separated only by commas/whitespace form an array literal. */
function findTables(literals) {
  const tables = [];
  let run = [];

  for (const literal of literals) {
    const previous = run[run.length - 1];
    if (previous === undefined) {
      run = [literal];
      continue;
    }

    const gap = source_slice_cache.slice(previous.end, literal.index);
    if (/^[,\s]*$/.test(gap) && gap.includes(',') || /^[\s]*$/.test(gap)) {
      run.push(literal);
    } else {
      if (run.length >= 8) tables.push(run);
      run = [literal];
    }
  }
  if (run.length >= 8) tables.push(run);
  return tables;
}

// A module-level slice used by findTables to inspect the gaps between literals.
let source_slice_cache = '';

function contextOf(source, index, before, after) {
  return source.slice(Math.max(0, index - before), index + after);
}

async function main() {
  const bundlePath = await findBundle();
  const source = await readFile(bundlePath, 'utf8');
  source_slice_cache = source;

  console.log(`[strings] ${bundlePath}`);
  console.log(`[strings] ${source.length} bytes`);

  const literals = literalsOf(source);
  console.log(`[strings] ${literals.length} string literals`);

  const tables = findTables(literals).sort((a, b) => b.length - a.length);
  console.log(`\n--- array-like literal runs (>=8 entries): ${tables.length} ---`);
  for (const table of tables.slice(0, 6)) {
    const first = table[0];
    console.log(`  run of ${table.length} at offset ${first.index}, first entries:`);
    for (const literal of table.slice(0, 8)) {
      console.log(`      ${literal.text.slice(0, 80)}`);
    }
  }

  console.log('\n--- looking for the decoder definition ---');
  const definitions = [
    /(?:var|let|const)\s+P\s*=/g,
    /function\s+P\s*\(/g,
    /(?:var|let|const)\s+n\s*=\s*\{[^}]{0,80}\}\s*,?\s*P\s*=/g,
    /\bP\s*=\s*(?:function|\()/g,
  ];

  let found = false;
  for (const pattern of definitions) {
    for (const match of source.matchAll(pattern)) {
      found = true;
      console.log(`\n  pattern ${pattern} at ${match.index}:`);
      console.log(contextOf(source, match.index, 200, 600));
    }
  }

  if (!found) {
    console.log('  No definition of P found by those patterns.');
    console.log('  Falling back: showing context of the first P( usage.');
    const firstUse = source.search(/\bP\(\d{1,3}\)/);
    if (firstUse >= 0) console.log(contextOf(source, firstUse, 400, 300));
  }

  console.log('\n--- decoder candidates: functions that touch a big array ---');
  // The decoder is usually a small function that indexes an array with a
  // numeric argument, often after an arithmetic shift.
  const decoderish = /function\s+[A-Za-z_$]{1,3}\s*\([a-z]\)\s*\{[^}]{0,220}\}/g;
  let shown = 0;
  for (const match of source.matchAll(decoderish)) {
    const body = match[0];
    if (!/\[[a-z][^]]*\]/.test(body)) continue;
    if (body.length < 40) continue;
    console.log(`\n  at ${match.index}: ${body.slice(0, 300)}`);
    shown += 1;
    if (shown >= 8) break;
  }
}

main().catch((error) => {
  console.error('[strings] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
