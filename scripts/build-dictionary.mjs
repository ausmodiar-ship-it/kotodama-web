#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Downloads the latest English JMdict from jmdict-simplified's GitHub releases and writes
// public/dict/jmdict-en-ja.json, which the app stores on the device for offline use.
//
//   npm run dict              # full dictionary (~219k words); run again to update (JMdict changes weekly)
//   npm run dict -- --common  # ~22k common words only (much smaller)
//   --if-missing              # do nothing when the file already exists (used by prebuild)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { convertJmdict } from './jmdict-convert.mjs';

const OUT = resolve(process.cwd(), 'public/dict/jmdict-en-ja.json');
const args = new Set(process.argv.slice(2));

if (args.has('--if-missing') && existsSync(OUT)) process.exit(0);

const res = await fetch('https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest', {
  headers: { 'User-Agent': 'kotodama-build', Accept: 'application/vnd.github+json' },
});
if (!res.ok) fail(`GitHub API ${res.status}`);
const release = await res.json();
const pattern = args.has('--common') ? /^jmdict-eng-common-\d[\w.+-]*\.json\.tgz$/ : /^jmdict-eng-\d[\w.+-]*\.json\.tgz$/;
const asset = release.assets.find((a) => pattern.test(a.name));
if (!asset) fail(`No matching asset in release ${release.tag_name}`);

console.log(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`);
const dir = mkdtempSync(join(tmpdir(), 'jmdict-'));
try {
  const archive = join(dir, asset.name);
  const dl = await fetch(asset.browser_download_url);
  if (!dl.ok) fail(`Download failed: ${dl.status}`);
  writeFileSync(archive, Buffer.from(await dl.arrayBuffer()));
  execFileSync('tar', ['-xzf', archive, '-C', dir]);
  const jsonFile = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!jsonFile) fail('Archive contained no .json file');

  const compact = convertJmdict(JSON.parse(readFileSync(join(dir, jsonFile), 'utf8')));
  mkdirSync(resolve(OUT, '..'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(compact));
  // Sidecar for the in-app update check (the licence asks that the data is kept up to date)
  writeFileSync(OUT.replace(/\.json$/, '.meta.json'), JSON.stringify({ date: compact.date, words: compact.words.length }));
  console.log(`Wrote ${OUT}: ${compact.words.length.toLocaleString()} words, ${(statSync(OUT).size / 1e6).toFixed(1)} MB`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function fail(msg) {
  console.error(`[dictionary] ${msg}. The app still works; offline mode falls back to its small built-in phrase list.`);
  process.exit(args.has('--if-missing') ? 0 : 1); // never break a build over the dictionary
}
