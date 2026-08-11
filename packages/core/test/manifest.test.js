'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DocsResolver,
  LocalDocsRoot,
  MANIFEST_FORMAT_VERSION,
  buildManifest,
  documentSummary,
  manifestsEqual,
  proseSummary,
  serializeManifest,
  splitLines,
  symbolAfterComment,
} = require('../dist/index.js');

async function makeProject() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-manifest-'));
  await fs.mkdir(path.join(directory, 'decisions'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'index.md'),
    ['# Index', '', 'Entry point.', '', '- [Retry policy](decisions/retry-policy.md)'].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(directory, 'decisions', 'retry-policy.md'),
    [
      '# Retry policy',
      '',
      'When an operation may be retried, and what makes that safe. More prose here.',
      '',
      '## Idempotency',
      '',
      'Retries are safe when the endpoint is idempotent by design.',
      '',
      '## Backoff',
      '',
      'Wait longer after each failure.',
    ].join('\n'),
    'utf8',
  );
  return directory;
}

const SOURCE = [
  '/**',
  ' * Retries are safe here.',
  ' * @docs decisions/retry-policy.md#idempotency',
  ' */',
  'export async function retry(operation) {}',
].join('\n');

async function build(sources, now = () => new Date('2026-08-04T00:00:00Z')) {
  const docsDirectory = await makeProject();
  const root = new LocalDocsRoot(docsDirectory);
  const manifest = await buildManifest({
    sources,
    resolver: new DocsResolver(root),
    root,
    docsRoot: 'docs',
    indexes: ['index.md'],
    now,
  });
  return manifest;
}

test('describes every document, its anchors and its summary', async () => {
  const manifest = await build([{ path: 'src/retry.ts', text: SOURCE }]);

  assert.equal(manifest.docsmirror, MANIFEST_FORMAT_VERSION);
  assert.equal(manifest.docsRoot, 'docs');
  assert.deepEqual(
    manifest.nodes.map((node) => node.path),
    ['decisions/retry-policy.md', 'index.md'],
  );

  const node = manifest.nodes[0];
  assert.equal(node.title, 'Retry policy');
  assert.equal(node.summary, 'When an operation may be retried, and what makes that safe.');
  assert.deepEqual(
    node.anchors.map((anchor) => anchor.slug),
    ['retry-policy', 'idempotency', 'backoff'],
  );
  assert.equal(
    node.anchors[1].summary,
    'Retries are safe when the endpoint is idempotent by design.',
  );
  assert.equal(node.staleness, 'fresh');
  assert.ok(node.words > 20);
});

test('inverts pointers into code references, with the symbol', async () => {
  const manifest = await build([{ path: 'src/retry.ts', text: SOURCE }]);
  const node = manifest.nodes[0];

  assert.deepEqual(node.referencedBy, [
    { file: 'src/retry.ts', line: 3, symbol: 'retry', anchor: 'idempotency' },
  ]);
  const anchored = node.anchors.find((anchor) => anchor.slug === 'idempotency');
  assert.equal(anchored.referencedBy.length, 1);
  assert.equal(node.anchors.find((anchor) => anchor.slug === 'backoff').referencedBy.length, 0);
});

test('counts the surface and its orphans', async () => {
  const manifest = await build([{ path: 'src/retry.ts', text: SOURCE }]);
  assert.deepEqual(manifest.stats, {
    documents: 2,
    anchors: 4,
    references: 1,
    orphans: 0,
    referencedDocuments: 1,
  });

  const unreferenced = await build([]);
  assert.equal(unreferenced.stats.references, 0);
  assert.equal(unreferenced.stats.orphans, 0, 'index.md links to the other document');
});

test('two manifests of the same surface are equal whenever they were built', async () => {
  const first = await build([{ path: 'src/retry.ts', text: SOURCE }]);
  const second = { ...first, generatedAt: '2020-01-01T00:00:00.000Z' };

  assert.ok(manifestsEqual(first, second));
  assert.ok(!manifestsEqual(first, { ...first, docsRoot: 'documentation' }));
  assert.ok(serializeManifest(first).endsWith('\n'));
});

test('comparison ignores mtime-derived fields, a fresh clone is not stale', async () => {
  // Each build creates its own temp project, so file mtimes differ between the
  // two, exactly what `git clone` does to a committed manifest. Pushing the
  // clock a year out also flips staleness from fresh to stale.
  const committed = await build([{ path: 'src/retry.ts', text: SOURCE }]);
  const cloned = await build([{ path: 'src/retry.ts', text: SOURCE }], () => new Date('2027-08-04T00:00:00Z'));

  assert.notDeepEqual(
    cloned.nodes.map((node) => node.staleness),
    committed.nodes.map((node) => node.staleness),
  );
  assert.ok(manifestsEqual(committed, cloned));

  // The date itself is just as volatile as the staleness derived from it.
  const shifted = {
    ...cloned,
    nodes: cloned.nodes.map((node) => ({ ...node, lastModified: '1999-01-01' })),
  };
  assert.ok(manifestsEqual(committed, shifted));

  const retitled = {
    ...cloned,
    nodes: cloned.nodes.map((node, index) => (index === 0 ? { ...node, title: 'Renamed' } : node)),
  };
  assert.ok(!manifestsEqual(committed, retitled));

  const reanchored = {
    ...cloned,
    nodes: cloned.nodes.map((node, index) =>
      index === 0 ? { ...node, anchors: node.anchors.map((anchor) => ({ ...anchor, slug: `${anchor.slug}-x` })) } : node,
    ),
  };
  assert.ok(!manifestsEqual(committed, reanchored));
});

test('summaries skip markup and honour front matter', () => {
  assert.equal(
    proseSummary(splitLines(['# Title', '', '- a list item', '', 'The real sentence. A second one.'].join('\n'))),
    'The real sentence.',
  );
  assert.equal(
    proseSummary(splitLines(['```', 'code(); // not prose', '```', '', 'Prose at last.'].join('\n'))),
    'Prose at last.',
  );
  assert.equal(
    documentSummary(['---', 'summary: Stated by the author.', '---', '', '# Title', '', 'Ignored.'].join('\n')),
    'Stated by the author.',
  );
  assert.equal(proseSummary(splitLines('# Only a heading')), undefined);
  assert.equal(
    documentSummary(['---', 'title: No summary key here', '---', '', 'Opening prose instead.'].join('\n')),
    'Opening prose instead.',
  );
});

test('names the declaration a comment introduces, or nothing', () => {
  const cases = [
    [['/** */', 'export async function retry(operation) {}'], 'retry'],
    [['# comment', 'class RetryPolicy:'], 'RetryPolicy'],
    [['// comment', 'export const backoff = (attempt) => attempt * 2;'], 'backoff'],
    [['// comment', 'interface Options {'], 'Options'],
    [['-- comment', 'CREATE TABLE accounts ('], 'accounts'],
    [['// comment', ''], undefined],
    [['// comment', '// another comment'], undefined],
  ];
  for (const [lines, expected] of cases) {
    assert.equal(symbolAfterComment(lines, 0), expected, lines.join(' / '));
  }
});
