/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Converts jmdict-simplified JSON (https://github.com/scriptin/jmdict-simplified) into the
// compact offline dictionary the app loads: one array row per word, common words first.
//   [kanji ("|"-joined), kana ("|"-joined), glosses (senses " / ", glosses "; "), common 0|1, part of speech]

const MAX_SENSES = 3;
const MAX_GLOSSES = 3;

export function convertJmdict(jmdict) {
  const rows = [];
  for (const w of jmdict.words) {
    const senses = w.sense
      .map((s) => s.gloss.filter((g) => g.lang === 'eng').slice(0, MAX_GLOSSES).map((g) => g.text))
      .filter((g) => g.length)
      .slice(0, MAX_SENSES);
    if (!senses.length) continue;
    const common = w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);
    rows.push([
      w.kanji.map((k) => k.text).join('|'),
      w.kana.map((k) => k.text).join('|'),
      senses.map((g) => g.join('; ')).join(' / '),
      common ? 1 : 0,
      w.sense[0]?.partOfSpeech?.[0] || '',
    ]);
  }
  rows.sort((a, b) => b[3] - a[3]); // stable: common words first, JMdict order within
  return {
    format: 1,
    source: `JMdict (Electronic Dictionary Research and Development Group) via jmdict-simplified ${jmdict.version}`,
    license: 'CC BY-SA 4.0 — https://www.edrdg.org/edrdg/licence.html',
    date: jmdict.dictDate,
    words: rows,
  };
}
