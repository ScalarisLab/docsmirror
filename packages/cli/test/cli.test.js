'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);
const BIN = path.resolve(__dirname, '..', 'bin', 'docsmirror.js');

const GOOD_SOURCE = [
  '/**',
  ' * Retries are safe here.',
  ' * @docs decisions/retry-policy.md#idempotency',
  ' */',
  'export function retry() {}',
].join('\n');

const BROKEN_SOURCE = [
  '// @docs decisions/ghost.md',
  '// @docs decisions/retry-policy.md#idempotencyy',
].join('\n');

/** Runs the CLI and resolves with its exit code and streams, never throwing on failure. */
async function docsmirror(args, cwd) {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function makeProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-cli-'));
  await fs.mkdir(path.join(root, 'docs', 'decisions'), { recursive: true });
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'docs', 'index.md'),
    ['# Index', '', 'Entry point.', '', '- [Retry policy](decisions/retry-policy.md)'].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'docs', 'decisions', 'retry-policy.md'),
    ['# Retry policy', '', 'When an operation may be retried.', '', '## Idempotency', '', 'Safe.'].join('\n'),
    'utf8',
  );
  await fs.writeFile(path.join(root, 'src', 'retry.ts'), GOOD_SOURCE, 'utf8');
  return root;
}

test('exits 0 when every pointer resolves', async () => {
  const root = await makeProject();
  const { code, stdout } = await docsmirror(['check'], root);

  assert.equal(code, 0);
  assert.match(stdout, /1 pointer found, 1 resolved, 0 issues\./);
});

test('exits 1 on a missing file and a missing anchor, and suggests the near miss', async () => {
  const root = await makeProject();
  await fs.writeFile(path.join(root, 'src', 'broken.ts'), BROKEN_SOURCE, 'utf8');

  const { code, stdout } = await docsmirror(['check'], root);
  assert.equal(code, 1);
  assert.match(stdout, /No document at `decisions\/ghost\.md`/);
  assert.match(stdout, /has no heading anchored at `#idempotencyy`\. Did you mean `#idempotency`\?/);
});

test('reports orphans only when asked', async () => {
  const root = await makeProject();
  await fs.writeFile(path.join(root, 'docs', 'lonely.md'), '# Lonely\n', 'utf8');

  assert.equal((await docsmirror(['check'], root)).code, 0);

  const withOrphans = await docsmirror(['check', '--orphans'], root);
  assert.equal(withOrphans.code, 1);
  assert.match(withOrphans.stdout, /lonely\.md/);
  assert.match(withOrphans.stdout, /warning\s+No @docs pointer and no index reaches this document\./);
});

test('reports a usage error distinctly from a failed check', async () => {
  const root = await makeProject();

  const unknownFlag = await docsmirror(['check', '--nope'], root);
  assert.equal(unknownFlag.code, 2);
  assert.match(unknownFlag.stderr, /Unknown option: --nope/);

  const missingDocs = await docsmirror(['check', '--docs', 'absent'], root);
  assert.equal(missingDocs.code, 2);
  assert.match(missingDocs.stderr, /docs root not found/);
});

test('the JSON report carries the issues and a machine-readable summary', async () => {
  const root = await makeProject();
  await fs.writeFile(path.join(root, 'src', 'broken.ts'), BROKEN_SOURCE, 'utf8');

  const { code, stdout } = await docsmirror(['check', '--json'], root);
  assert.equal(code, 1);

  const report = JSON.parse(stdout);
  assert.equal(report.ok, false);
  assert.equal(report.summary.issueCount, 2);
  assert.deepEqual(
    report.issues.map((issue) => issue.kind).sort(),
    ['anchor-not-found', 'file-not-found'],
  );
});

test('writes a manifest describing the documentation surface', async () => {
  const root = await makeProject();

  const written = await docsmirror(['manifest'], root);
  assert.equal(written.code, 0);
  assert.match(written.stdout, /2 documents, 3 anchors, 1 code reference\./);

  const manifest = JSON.parse(await fs.readFile(path.join(root, 'docsmirror.json'), 'utf8'));
  assert.equal(manifest.docsRoot, 'docs');
  const node = manifest.nodes.find((entry) => entry.path === 'decisions/retry-policy.md');
  assert.equal(node.summary, 'When an operation may be retried.');
  assert.deepEqual(node.referencedBy, [
    { file: 'src/retry.ts', line: 3, symbol: 'retry', anchor: 'idempotency' },
  ]);
});

test('check fails once the committed manifest no longer matches the documentation', async () => {
  const root = await makeProject();
  assert.equal((await docsmirror(['manifest'], root)).code, 0);
  assert.equal((await docsmirror(['check'], root)).code, 0);
  assert.equal((await docsmirror(['manifest', '--check'], root)).code, 0);

  await fs.appendFile(path.join(root, 'docs', 'decisions', 'retry-policy.md'), '\n## Backoff\n\nWait.\n');

  const drifted = await docsmirror(['check'], root);
  assert.equal(drifted.code, 1);
  assert.match(drifted.stdout, /manifest no longer describes the documentation on disk/);

  assert.equal((await docsmirror(['manifest'], root)).code, 0);
  assert.equal((await docsmirror(['check'], root)).code, 0);
});

test('a project without a manifest passes unless one is required', async () => {
  const root = await makeProject();

  assert.equal((await docsmirror(['check'], root)).code, 0);

  const required = await docsmirror(['check', '--manifest'], root);
  assert.equal(required.code, 1);
  assert.match(required.stdout, /No manifest found\. Run `docsmirror manifest` to create it\./);
});
