'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesAny } = require('../dist/index.js');

test('`*` matches within a path segment, never across slashes', () => {
  assert.ok(matchesAny('src/index.ts', ['src/*.ts']));
  assert.ok(!matchesAny('src/deep/index.ts', ['src/*.ts']));
  assert.ok(!matchesAny('src/index.js', ['src/*.ts']));
});

test('`**` crosses directories, including zero of them', () => {
  assert.ok(matchesAny('src/a/b/c.ts', ['**/*.ts']));
  assert.ok(matchesAny('c.ts', ['**/*.ts']));
  assert.ok(matchesAny('node_modules/pkg/index.js', ['**/node_modules/**']));
  assert.ok(matchesAny('node_modules/index.js', ['**/node_modules/**']));
});

test('`?` matches exactly one character, never a slash', () => {
  assert.ok(matchesAny('a.ts', ['?.ts']));
  assert.ok(!matchesAny('ab.ts', ['?.ts']));
  assert.ok(!matchesAny('a/b', ['a?b']));
});

test('character classes match a set, and `!` negates it', () => {
  assert.ok(matchesAny('file1.md', ['file[123].md']));
  assert.ok(!matchesAny('file4.md', ['file[123].md']));
  assert.ok(matchesAny('file4.md', ['file[!123].md']));
  assert.ok(!matchesAny('file1.md', ['file[!123].md']));
});

test('a path matching both include and exclude is dropped, exclusion wins', () => {
  // scanSources applies exactly this rule: excluded first, included second.
  const include = ['src/**'];
  const exclude = ['src/generated/**'];
  const kept = (path) => !matchesAny(path, exclude) && matchesAny(path, include);
  assert.ok(kept('src/index.ts'));
  assert.ok(!kept('src/generated/schema.ts'));
});

test('an unmatched `[` is a literal character, not a syntax error', () => {
  assert.ok(matchesAny('a[b', ['a[b']));
  assert.ok(!matchesAny('ab', ['a[b']));
  assert.ok(matchesAny('a]b', ['a]b']));
});

test('an empty pattern list never matches', () => {
  assert.ok(!matchesAny('anything', []));
});
