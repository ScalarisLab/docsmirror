'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DocsProject } = require('../dist/index.js');

/**
 * `DocsProject.search` reads the corpus through the project's shared
 * per-document cache (see `documentsNow` in `project.ts`) instead of
 * re-reading and re-parsing every file on every keystroke. These tests exist
 * to catch the failure mode that caching invites: a result that is correct
 * once and then silently goes stale after a write.
 */
const roots = [];

test.after(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function makeProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-web-search-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'docs', 'retry-policy.md'),
    ['# Retry policy', '', 'Retries are safe: the endpoint is idempotent.'].join('\n'),
    'utf8',
  );
  return root;
}

test('finds a document by title and by prose', async () => {
  const root = await makeProject();
  const project = await DocsProject.open(root);

  // A one-heading document also matches on its own top-level anchor, so a
  // title hit and a heading hit for the same H1 both survive, they carry
  // different anchors (undefined vs. the H1's own slug) and are legitimately
  // two results, not a duplicate.
  const byTitle = await project.search('retry policy');
  assert.ok(byTitle.some((result) => result.path === 'retry-policy.md' && result.match === 'document'));

  const byProse = await project.search('idempotent');
  assert.ok(byProse.some((result) => result.path === 'retry-policy.md' && result.match === 'prose'));
});

test('an empty query matches nothing and never has to read the corpus', async () => {
  const root = await makeProject();
  const project = await DocsProject.open(root);
  assert.deepEqual(await project.search('   '), []);
});

test('a write invalidates the cached index, so a new term is found immediately', async () => {
  const root = await makeProject();
  const project = await DocsProject.open(root);

  assert.deepEqual(await project.search('circuitbreaker'), []);

  await project.writeDocument(
    'retry-policy.md',
    ['# Retry policy', '', 'Retries are safe, unless a circuitbreaker is already open.'].join('\n'),
  );

  const results = await project.search('circuitbreaker');
  assert.equal(results.length, 1);
  assert.equal(results[0].path, 'retry-policy.md');
});

test('a document added after the index was built is found once the manifest is rebuilt', async () => {
  const root = await makeProject();
  const project = await DocsProject.open(root);

  await project.search('retry'); // builds and caches the index over one document
  await fs.writeFile(path.join(root, 'docs', 'timeouts.md'), ['# Timeouts', '', 'How long is too long.'].join('\n'), 'utf8');
  await project.writeDocument('retry-policy.md', ['# Retry policy', '', 'Retries are safe.'].join('\n'));

  const results = await project.search('timeouts');
  assert.ok(results.some((result) => result.path === 'timeouts.md'));
});
