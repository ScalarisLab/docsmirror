'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  documentTitle,
  findSection,
  linkedDocuments,
  parseSections,
  sectionMarkdown,
  slugify,
} = require('../dist/index.js');

const DOCUMENT = [
  '---',
  'title: front matter is skipped',
  '---',
  '# Retry policy',
  '',
  'Intro.',
  '',
  '## Idempotency',
  '',
  'Retries are safe: the endpoint is idempotent.',
  '',
  '### Exception',
  '',
  'Unless the reference matches.',
  '',
  '## Idempotency',
  '',
  'A repeated heading.',
  '',
  '```md',
  '## Not a heading',
  '```',
].join('\n');

test('slugifies headings the way GitHub does', () => {
  assert.equal(slugify('Idempotency'), 'idempotency');
  assert.equal(slugify('`code` and **bold**'), 'code-and-bold');
  assert.equal(slugify('What: why? (really)'), 'what-why-really');
  assert.equal(slugify('Déjà vu'), 'déjà-vu');
});

test('parses sections, skipping front matter and fenced code', () => {
  const sections = parseSections(DOCUMENT);
  assert.deepEqual(
    sections.map((section) => section.slug),
    ['retry-policy', 'idempotency', 'exception', 'idempotency-1'],
  );
  assert.equal(documentTitle(sections), 'Retry policy');
  assert.equal(findSection(sections, 'Idempotency').headingLine, 7);
  assert.equal(findSection(sections, 'nope'), undefined);
});

test('a section carries its subsections and stops at the next sibling', () => {
  const sections = parseSections(DOCUMENT);
  const markdown = sectionMarkdown(DOCUMENT, findSection(sections, 'idempotency'));
  assert.match(markdown, /^## Idempotency/);
  assert.match(markdown, /### Exception/);
  assert.doesNotMatch(markdown, /A repeated heading/);
});

test('setext headings are recognised', () => {
  const sections = parseSections(['Title', '=====', '', 'Body', '', 'Sub', '---'].join('\n'));
  assert.deepEqual(
    sections.map((section) => [section.title, section.level]),
    [
      ['Title', 1],
      ['Sub', 2],
    ],
  );
});

test('collects only links that stay inside the docs root', () => {
  const markdown = [
    '[sibling](./sibling.md)',
    '[up](../top.md)',
    '[external](https://example.com/x.md)',
    '[absolute](/x.md)',
    '[anchor](#section)',
    '[reference][ref]',
    '',
    '[ref]: nested/target.md',
  ].join('\n');
  assert.deepEqual(linkedDocuments('guides/index.md', markdown).sort(), [
    'guides/nested/target.md',
    'guides/sibling.md',
    'top.md',
  ]);
});

test('a link inside fenced code is an example, not navigation', () => {
  const markdown = [
    '```md',
    '[example](fenced.md)',
    '[def]: also-fenced.md',
    '```',
    '',
    '[real](real.md)',
  ].join('\n');
  assert.deepEqual(linkedDocuments('index.md', markdown), ['real.md']);
});
