#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Downloads Tatoeba's English and Japanese sentences and the links between them, and writes
// public/dict/phrases-en-ja.json: up to 100,000 human-translated sentence pairs that the app
// stores on the device ("Get ready for offline") and answers from with no connection.
//
//   npm run phrases              # build (run again to update; Tatoeba grows daily)
//   --if-missing                 # do nothing when the file already exists (used by prebuild)
//   --max 50000                  # fewer pairs (smaller download)
//
// Needs `bzip2` on the machine (standard on macOS and Linux). Licence: CC BY 2.0 FR, credited
// in Settings › Offline.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildPairs, parseSentences } from './phrases-convert.mjs';

const OUT = resolve(process.cwd(), 'public/dict/phrases-en-ja.json');
const argv = process.argv.slice(2);
const MAX = Number(argv[argv.indexOf('--max') + 1]) || 100_000;
const BASE = 'https://downloads.tatoeba.org/exports/per_language';

if (argv.includes('--if-missing') && existsSync(OUT)) process.exit(0);

const dir = mkdtempSync(join(tmpdir(), 'tatoeba-'));
try {
  const get = async (path) => {
    const res = await fetch(`${BASE}/${path}`);
    if (!res.ok) fail(`${path}: ${res.status}`);
    const file = join(dir, path.split('/').pop());
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`Downloaded ${path} (${(statSync(file).size / 1e6).toFixed(1)} MB)`);
    return execFileSync('bzip2', ['-dc', file], { maxBuffer: 2 ** 30 }).toString('utf8');
  };

  const linksTsv = await get('jpn/jpn-eng_links.tsv.bz2');
  const links = linksTsv
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((r) => r.length >= 2);
  const ja = parseSentences(await get('jpn/jpn_sentences.tsv.bz2'));
  // The English file is large: keep only sentences that have a Japanese translation
  const en = parseSentences(await get('eng/eng_sentences.tsv.bz2'), new Set(links.map((r) => r[1])));

  const pairs = buildPairs(ja, en, links, MAX);
  if (pairs.length < 1000) fail(`only ${pairs.length} pairs`);
  const sentences = new Set(pairs.map((p) => p[0])).size;
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(resolve(OUT, '..'), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ source: 'Tatoeba', licence: 'CC BY 2.0 FR', date, pairs }));
  writeFileSync(OUT.replace(/\.json$/, '.meta.json'), JSON.stringify({ date, sentences, pairs: pairs.length }));
  console.log(`Wrote ${OUT}: ${sentences.toLocaleString()} English sentences, ${pairs.length.toLocaleString()} pairs, ${(statSync(OUT).size / 1e6).toFixed(1)} MB`);
  // A sample, so a build log shows what users will get
  for (const i of [0, 1, 2, 10, 100, 1000, 10000, pairs.length - 1]) if (pairs[i]) console.log(`  #${i}: ${pairs[i][0]} → ${pairs[i][1]}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function fail(msg) {
  console.error(`[phrases] ${msg}. The app still works; offline mode uses its built-in phrases and the dictionary.`);
  process.exit(argv.includes('--if-missing') ? 0 : 1); // never break a build over the phrase file
}
