/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Tatoeba English⇄Japanese sentence pairs → the app's offline phrase file.
// Pure (strings in, object out) so it is unit-tested; build-phrases.mjs does the downloading.

const POLITE = /(です|ます|ません|ました|でした|ましょう|ください|ございます|下さい)(か|ね|よ)?[。？！?!」]*$/;
const BAD = /[()（）[\]【】{}<>＜＞#*_|\\]/;

/** Rows of a Tatoeba sentences file (`id \t lang \t text`) as id → text. */
export function parseSentences(tsv, keep) {
  const out = new Map();
  for (const line of tsv.split('\n')) {
    const a = line.indexOf('\t');
    const b = line.indexOf('\t', a + 1);
    if (a < 0 || b < 0) continue;
    const id = line.slice(0, a);
    if (keep && !keep.has(id)) continue;
    out.set(id, line.slice(b + 1).trim());
  }
  return out;
}

const enDedupe = (s) => s.toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();

/**
 * @param ja   id → Japanese text
 * @param en   id → English text
 * @param links `[jaId, enId]` translation links
 * @returns pairs `[english, japanese]`, most useful first: `max` English sentences, each with
 *   up to 2 Japanese ways of saying it
 */
export function buildPairs(ja, en, links, max = 100_000) {
  // English sentence → its Japanese translations
  const groups = new Map();
  for (const [jaId, enId] of links) {
    const j = ja.get(jaId);
    const e = en.get(enId);
    if (!j || !e) continue;
    // Short, plain conversational sentences: no dialogue fragments, notes or markup
    if (e.length < 2 || e.length > 90 || j.length > 60 || BAD.test(e) || BAD.test(j)) continue;
    if (!/[぀-ヿ一-鿿]/.test(j) || !/[a-z]/i.test(e)) continue;
    const key = enDedupe(e) + (/\?\s*$/.test(e) ? '?' : '');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { en: e, ja: new Set() }));
    g.ja.add(j);
  }
  // No frequency list exists for Tatoeba: an English sentence that many contributors chose to
  // translate is a common one, and short sentences are what people say at a counter
  const ranked = [...groups.values()].sort((a, b) => b.ja.size - a.ja.size || a.en.length - b.en.length);
  const pairs = [];
  let sentences = 0;
  for (const g of ranked) {
    if (sentences++ >= max) break;
    // The shortest polite Japanese first (the app's default register), and the shortest plain
    // form as well, so Japanese→English also understands the casual way of saying it
    const byLength = [...g.ja].sort((a, b) => a.length - b.length);
    const polite = byLength.find((j) => POLITE.test(j));
    const plain = byLength.find((j) => !POLITE.test(j));
    const variants = [polite, plain].filter(Boolean);
    for (const j of variants) pairs.push([g.en, j]);
  }
  return pairs;
}
