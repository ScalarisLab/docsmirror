'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasDatedContent, renderDatedSections, splitDatedBlocks } = require('../dist/index.js');

test('a document with no marker is one undated block, unchanged by rendering', () => {
  const markdown = 'Retries are safe: the endpoint is idempotent.';
  assert.deepEqual(splitDatedBlocks(markdown), [{ date: undefined, markdown }]);
  assert.equal(renderDatedSections(markdown), markdown);
  assert.equal(hasDatedContent(markdown), false);
});

test('splits on a marker that occupies its own line', () => {
  const markdown = [
    'Retries are safe: the endpoint is idempotent.',
    '',
    '<!-- @as-of 2026-01-15 -->',
    '',
    'Confirmed against the payments team.',
  ].join('\n');

  assert.deepEqual(splitDatedBlocks(markdown), [
    { date: undefined, markdown: 'Retries are safe: the endpoint is idempotent.' },
    { date: '2026-01-15', markdown: 'Confirmed against the payments team.' },
  ]);
  assert.equal(hasDatedContent(markdown), true);
});

test('a leading marker produces no empty undated block', () => {
  const markdown = ['<!-- @as-of 2026-01-15 -->', '', 'Written from the start with a date.'].join('\n');
  assert.deepEqual(splitDatedBlocks(markdown), [{ date: '2026-01-15', markdown: 'Written from the start with a date.' }]);
});

test('later markers each start their own block', () => {
  const markdown = [
    'Original claim.',
    '<!-- @as-of 2026-01-15 -->',
    'First revision.',
    '<!-- @as-of 2026-03-01 -->',
    'Second revision.',
  ].join('\n');

  assert.deepEqual(
    splitDatedBlocks(markdown).map((block) => block.date),
    [undefined, '2026-01-15', '2026-03-01'],
  );
});

test('an invalid calendar date is left as ordinary text', () => {
  const markdown = ['<!-- @as-of 2026-02-30 -->', '', 'Not a real day.'].join('\n');
  assert.deepEqual(splitDatedBlocks(markdown), [{ date: undefined, markdown }]);
  assert.equal(hasDatedContent(markdown), false);
});

test('renders dated blocks with a visible label and a rule between them', () => {
  const markdown = [
    'Original claim.',
    '',
    '<!-- @as-of 2026-01-15 -->',
    '',
    'First revision.',
  ].join('\n');

  assert.equal(
    renderDatedSections(markdown),
    ['Original claim.', '---\n\n**As of 2026-01-15**\n\nFirst revision.'].join('\n\n'),
  );
});

test('a marker with content around it in a comment block is still recognized', () => {
  const markdown = ['Some prose.', '  <!-- @as-of 2026-01-15 -->  ', 'More prose.'].join('\n');
  assert.deepEqual(
    splitDatedBlocks(markdown).map((block) => block.date),
    [undefined, '2026-01-15'],
  );
});
