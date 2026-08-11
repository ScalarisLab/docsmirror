'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSource } = require('../dist/index.js');

test('reads a pointer from a JSDoc block and reports its range', () => {
  const source = [
    '/**',
    ' * Retries are safe: the endpoint is idempotent.',
    ' * @docs decisions/retry-policy.md#idempotency',
    ' */',
    'function retry() {}',
  ].join('\n');

  const { pointers, malformed } = parseSource(source);
  assert.equal(malformed.length, 0);
  assert.equal(pointers.length, 1);
  const [pointer] = pointers;
  assert.equal(pointer.path, 'decisions/retry-policy.md');
  assert.equal(pointer.anchor, 'idempotency');
  assert.equal(pointer.line, 2);
  assert.equal(pointer.column, 3);
  assert.equal(source.split('\n')[pointer.line].slice(pointer.column, pointer.endColumn), pointer.raw);
  assert.deepEqual(pointer.comment, { startLine: 0, endLine: 3 });
});

test('supports line comments of several languages', () => {
  const cases = [
    ['// @docs guide.md', 'guide.md'],
    ['# @docs guide.md#setup', 'guide.md'],
    ['-- @docs guide.md', 'guide.md'],
    ['; @docs guide.md', 'guide.md'],
    ['<!-- @docs guide.md -->', 'guide.md'],
  ];
  for (const [line, expected] of cases) {
    const { pointers } = parseSource(line);
    assert.equal(pointers.length, 1, `no pointer found in ${line}`);
    assert.equal(pointers[0].path, expected);
  }
});

test('ignores a pointer that is not inside a comment', () => {
  const { pointers, malformed } = parseSource('const text = "@docs guide.md";');
  assert.equal(pointers.length, 0);
  assert.equal(malformed.length, 0);
});

test('drops a comment closer glued to the pointer', () => {
  const { pointers } = parseSource('/* @docs guide.md#setup */');
  assert.equal(pointers[0].path, 'guide.md');
  assert.equal(pointers[0].anchor, 'setup');

  const glued = parseSource('/* @docs guide.md#setup*/');
  assert.equal(glued.pointers[0].anchor, 'setup');
});

test('the range covers a target that repeats text of the marker itself', () => {
  const line = '// @docs docs';
  const { pointers } = parseSource(line);
  const [pointer] = pointers;
  assert.equal(pointer.path, 'docs');
  assert.equal(line.slice(pointer.column, pointer.endColumn), '@docs docs');
});

test('a bare pointer targets the whole file', () => {
  const { pointers } = parseSource('// @docs architecture.md');
  assert.equal(pointers[0].anchor, undefined);
});

test('anchors are matched case-insensitively', () => {
  const { pointers } = parseSource('// @docs guide.md#Idempotency');
  assert.equal(pointers[0].anchor, 'idempotency');
});

test('normalises the path and rejects one that escapes the docs root', () => {
  assert.equal(parseSource('// @docs ./guide.md').pointers[0].path, 'guide.md');
  assert.equal(parseSource('// @docs sub\\guide.md').pointers[0].path, 'sub/guide.md');

  const escaping = parseSource('// @docs ../secrets.md');
  assert.equal(escaping.pointers.length, 0);
  assert.equal(escaping.malformed[0].reason, 'path-outside-root');

  const absolute = parseSource('// @docs /etc/passwd');
  assert.equal(absolute.malformed[0].reason, 'path-outside-root');
});

test('flags a pointer with no path and one written as a markdown link', () => {
  assert.equal(parseSource('// @docs').malformed[0].reason, 'missing-path');
  assert.equal(parseSource('// @docs [retry-policy](decisions/retry-policy.md)').malformed[0].reason, 'markdown-link');
});

test('prose mentioning the marker is not a pointer', () => {
  const prose = [
    '// A `@docs` marker is not a pointer.',
    '// The @docs, when written inline.',
    '// Scans a project for @docs pointers.',
    ' * See the @docs guide.md convention for details.',
  ];
  for (const line of prose) {
    const { pointers, malformed } = parseSource(line);
    assert.deepEqual([pointers.length, malformed.length], [0, 0], `misread: ${line}`);
  }

  const trailing = parseSource("// @docs 'guide.md'");
  assert.equal(trailing.pointers[0].path, 'guide.md');
});

test('finds several pointers across one block comment', () => {
  const { pointers } = parseSource(['/*', ' * @docs a.md#one', ' * @docs b.md#two', ' */'].join('\n'));
  assert.deepEqual(
    pointers.map((pointer) => `${pointer.path}#${pointer.anchor}`),
    ['a.md#one', 'b.md#two'],
  );
});
