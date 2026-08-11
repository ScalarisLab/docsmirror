'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DocsResolver,
  LocalDocsRoot,
  computeStaleness,
  findOrphanDocuments,
  parseSource,
  validateProject,
} = require('../dist/index.js');

async function makeDocsRoot() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-'));
  await fs.mkdir(path.join(directory, 'decisions'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'index.md'),
    ['# Index', '', '- [Retry policy](decisions/retry-policy.md)'].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(directory, 'decisions', 'retry-policy.md'),
    ['# Retry policy', '', '## Idempotency', '', 'Retries are safe: the endpoint is idempotent.'].join('\n'),
    'utf8',
  );
  await fs.writeFile(path.join(directory, 'lonely.md'), '# Lonely\n', 'utf8');
  return directory;
}

test('resolves a pointer to its section', async () => {
  const root = new LocalDocsRoot(await makeDocsRoot());
  const resolver = new DocsResolver(root);
  const [pointer] = parseSource('// @docs decisions/retry-policy.md#idempotency').pointers;

  const resolution = await resolver.resolve(pointer);
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.title, 'Idempotency');
  assert.match(resolution.markdown, /^## Idempotency/);
  assert.ok(resolution.file.uri.startsWith('file://'));
  assert.equal(resolution.staleness, 'fresh');
});

test('a bare pointer resolves to the whole document', async () => {
  const resolver = new DocsResolver(new LocalDocsRoot(await makeDocsRoot()));
  const [pointer] = parseSource('// @docs decisions/retry-policy').pointers;

  const resolution = await resolver.resolve(pointer);
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.title, 'Retry policy');
  assert.equal(resolution.section, undefined);
});

test('reports a missing file and a missing anchor distinctly', async () => {
  const resolver = new DocsResolver(new LocalDocsRoot(await makeDocsRoot()));

  const missingFile = await resolver.resolve(parseSource('// @docs decisions/ghost.md').pointers[0]);
  assert.equal(missingFile.status, 'file-not-found');

  const missingAnchor = await resolver.resolve(
    parseSource('// @docs decisions/retry-policy.md#idempotencyy').pointers[0],
  );
  assert.equal(missingAnchor.status, 'anchor-not-found');
  assert.deepEqual(missingAnchor.available, ['retry-policy', 'idempotency']);
});

test('validation turns broken pointers into issues and suggests the near miss', async () => {
  const resolver = new DocsResolver(new LocalDocsRoot(await makeDocsRoot()));
  const report = await validateProject(
    [
      { path: 'src/ok.ts', text: '// @docs decisions/retry-policy.md#idempotency' },
      { path: 'src/broken.ts', text: '// @docs decisions/ghost.md\n// @docs decisions/retry-policy.md#idempotencyy' },
    ],
    resolver,
  );

  assert.equal(report.pointerCount, 3);
  assert.equal(report.resolvedCount, 1);
  assert.deepEqual(
    report.issues.map((issue) => issue.kind),
    ['file-not-found', 'anchor-not-found'],
  );
  assert.equal(report.issues[1].suggestion, '#idempotency');
  assert.equal(report.issues[1].range.line, 1);
});

test('orphan detection follows pointers and index links', async () => {
  const root = new LocalDocsRoot(await makeDocsRoot());
  const resolver = new DocsResolver(root);
  const report = await validateProject(
    [{ path: 'src/ok.ts', text: '// @docs decisions/retry-policy.md#idempotency' }],
    resolver,
  );

  const orphans = await findOrphanDocuments(root, report.referencedDocuments, ['index.md']);
  assert.deepEqual(
    orphans.map((issue) => issue.file),
    ['lonely.md'],
  );
  assert.equal(orphans[0].severity, 'warning');
});

test('staleness follows the configured thresholds', () => {
  const now = new Date('2026-08-04T00:00:00Z');
  const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000);
  const options = { agingAfterDays: 90, staleAfterDays: 180 };

  assert.equal(computeStaleness(daysAgo(1), options, now), 'fresh');
  assert.equal(computeStaleness(daysAgo(100), options, now), 'aging');
  assert.equal(computeStaleness(daysAgo(365), options, now), 'stale');
  assert.equal(computeStaleness(undefined, options, now), 'unknown');
});
