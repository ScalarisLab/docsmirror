'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { headingText, parseSections, slugify, SlugRegistry } = require('../dist/index.js');

/**
 * The slug rule, case by case. Every row here is a bug that shipped somewhere
 * before it was a test, so this table is the contract, not an illustration.
 *
 * The rule: lowercase; remove everything that is not a letter, a digit, `_`,
 * `-` or whitespace; trim; replace EACH whitespace character with `-`.
 */
const SLUG_CASES = [
  ['Idempotency', 'idempotency', 'the ordinary case'],

  // Underscores survive. A `\w`-free "strip emphasis" pass eats these, and they
  // are exactly what a codebase documents: constants, enum values, columns.
  ['PROCESS_DEATH_WINDOW_MS', 'process_death_window_ms', 'a screaming-snake-case identifier'],
  ['`PROCESS_DEATH_WINDOW_MS`: how far back a death alert looks',
   'process_death_window_ms-how-far-back-a-death-alert-looks',
   'an identifier in backticks, followed by prose'],
  ['Draining the CITY_UNRESOLVED backlog without a fetch or geocode (`backfillCityFromText.ts`)',
   'draining-the-city_unresolved-backlog-without-a-fetch-or-geocode-backfillcityfromtextts',
   'underscores, parentheses, backticks and a dotted filename'],
  ['_leading and trailing_', '_leading-and-trailing_', 'underscores are never emphasis markers'],

  // Angle-bracketed element names are text, not HTML to be stripped: removing
  // the "tag" deletes the word the heading is actually about.
  ['Sitemap <lastmod> as evidence, not as a bare value',
   'sitemap-lastmod-as-evidence-not-as-a-bare-value',
   'an XML element name in angle brackets'],
  ['The "sous <status>" idiom in URLs', 'the-sous-status-idiom-in-urls', 'a bracketed name inside quotes'],

  // A digit means a decimal digit: `\p{N}` would keep superscripts GitHub drops.
  ['How a surface in m² is recognised', 'how-a-surface-in-m-is-recognised', 'a superscript is not a digit'],
  ['Section ①', 'section', 'a circled number is not a digit either, and step 3 trims before step 4'],

  // Accented and non-Latin letters survive. A `\w`-based class silently drops them.
  ['mentions légales', 'mentions-légales', 'an accented letter'],
  ['Déjà vu', 'déjà-vu', 'several accented letters'],
  ['Обзор', 'обзор', 'a non-Latin script'],

  // Runs of whitespace are never collapsed: each space becomes one hyphen.
  ['Search & Filter', 'search--filter', 'a removed symbol leaves the space on both sides, so two hyphens'],
  ['spaced    out', 'spaced----out', 'four spaces become four hyphens'],
  ['  trimmed  ', 'trimmed', 'leading and trailing whitespace is trimmed, not hyphenated'],

  // Emphasis and code markers are removed, being punctuation at step 2.
  ['**bold** and *italic*', 'bold-and-italic', 'asterisk emphasis'],
  ['`code` and ~~struck~~', 'code-and-struck', 'code spans and strikethrough'],

  // Punctuation goes; the words around it keep their separating spaces.
  ['What: why? (really)', 'what-why-really', 'colons, question marks, parentheses'],
  ['C++ / Rust', 'c--rust', 'removed symbols leave their surrounding spaces, so two hyphens'],
  ['100% done', '100-done', 'a percent sign'],
  ['[a link](https://example.com)', 'a-link', 'a link keeps its text, drops its target'],
  ['#', '', 'a heading with nothing sluggable'],
];

test('slugify follows the rule, character class by character class', () => {
  for (const [heading, expected, why] of SLUG_CASES) {
    assert.equal(slugify(heading), expected, `${why}: ${JSON.stringify(heading)}`);
  }
});

test('headingText keeps identifiers intact while dropping decoration', () => {
  assert.equal(headingText('`PROCESS_DEATH_WINDOW_MS`: how far back'), 'PROCESS_DEATH_WINDOW_MS: how far back');
  assert.equal(headingText('**bold** and *italic*'), 'bold and italic');
  assert.equal(headingText('[a link](https://example.com)'), 'a link');
});

test('repeated headings get GitHub numeric suffixes', () => {
  const registry = new SlugRegistry();
  assert.equal(registry.next('Idempotency'), 'idempotency');
  assert.equal(registry.next('Idempotency'), 'idempotency-1');
  assert.equal(registry.next('Idempotency'), 'idempotency-2');
  assert.equal(registry.next('Other'), 'other');
});

test('headings are found in a CRLF document', () => {
  const document = ['# Title', '', '## PROCESS_DEATH_WINDOW_MS', '', 'Body.'].join('\r\n');
  const sections = parseSections(document);

  assert.deepEqual(
    sections.map((section) => section.slug),
    ['title', 'process_death_window_ms'],
  );
  assert.equal(sections[1].title, 'PROCESS_DEATH_WINDOW_MS');
});

test('a lone CR does not hide the headings either', () => {
  const sections = parseSections('# Title\r\r## Second\r');
  assert.deepEqual(
    sections.map((section) => section.slug),
    ['title', 'second'],
  );
});
