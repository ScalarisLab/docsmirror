'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DocsProject } = require('../dist/project/DocsProject.js');
const { toolNamed } = require('../dist/tools/index.js');
const { ToolFailure } = require('../dist/errors.js');

/**
 * Every tool is exercised through `toolNamed(...).run(args, snapshot)`, the
 * same call the MCP transport makes, minus the transport, against a real
 * temp project, since the whole point of these tools is what they derive
 * from a live manifest and a live docs root.
 */
async function makeSnapshot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-mcp-'));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'docs', 'retry-policy.md'),
    ['# Retry policy', '', 'When an operation may be retried.', '', '## Idempotency', '', 'Safe by design.'].join(
      '\n',
    ),
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'src', 'retry.ts'),
    ['/**', ' * @docs retry-policy.md#idempotency', ' */', 'export function retry() {}'].join('\n'),
    'utf8',
  );
  const project = new DocsProject(root);
  return { root, snapshot: await project.current() };
}

test('list_documentation returns every document and anchor, no body text', async () => {
  const { snapshot } = await makeSnapshot();
  const payload = JSON.parse(await toolNamed('list_documentation').run({}, snapshot));

  const doc = payload.documents.find((entry) => entry.path === 'retry-policy.md');
  assert.notEqual(doc, undefined);
  assert.equal(doc.title, 'Retry policy');
  assert.equal(doc.references, 1);
  assert.ok(doc.anchors.some((anchor) => anchor.anchor === 'idempotency'));
});

test('read_documentation returns a single section when anchor is given', async () => {
  const { snapshot } = await makeSnapshot();
  const whole = await toolNamed('read_documentation').run({ path: 'retry-policy.md' }, snapshot);
  assert.match(whole, /Safe by design\./);
  assert.match(whole, /# Retry policy/);

  const section = await toolNamed('read_documentation').run(
    { path: 'retry-policy.md', anchor: 'idempotency' },
    snapshot,
  );
  assert.match(section, /## Idempotency/);
  assert.match(section, /Safe by design\./);
  assert.doesNotMatch(section, /When an operation may be retried\./);
});

test('read_documentation rejects a document outside the map with a recoverable message', async () => {
  const { snapshot } = await makeSnapshot();
  await assert.rejects(
    () => toolNamed('read_documentation').run({ path: 'ghost.md' }, snapshot),
    (error) => error instanceof ToolFailure && /ghost\.md/.test(error.message),
  );
});

test('find_references lists the pointer into the document, and narrows by anchor', async () => {
  const { snapshot } = await makeSnapshot();
  const whole = JSON.parse(await toolNamed('find_references').run({ path: 'retry-policy.md' }, snapshot));
  assert.equal(whole.count, 1);
  assert.equal(whole.references[0].file, 'src/retry.ts');
  assert.equal(whole.references[0].anchor, 'idempotency');

  const narrowed = JSON.parse(
    await toolNamed('find_references').run({ path: 'retry-policy.md', anchor: 'idempotency' }, snapshot),
  );
  assert.equal(narrowed.count, 1);
});

test('search_documentation finds the section by a term in its heading', async () => {
  const { snapshot } = await makeSnapshot();
  const results = JSON.parse(await toolNamed('search_documentation').run({ query: 'idempotency' }, snapshot));
  assert.ok(results.results.some((hit) => hit.path === 'retry-policy.md' && hit.anchor === 'idempotency'));
});

test('search_documentation returns a note, not an error, when nothing matches', async () => {
  const { snapshot } = await makeSnapshot();
  const results = JSON.parse(
    await toolNamed('search_documentation').run({ query: 'nonexistentterm' }, snapshot),
  );
  assert.deepEqual(results.results, []);
  assert.match(results.note, /No section contains these words/);
});

test('get_manifest returns the same document count as list_documentation', async () => {
  const { snapshot } = await makeSnapshot();
  const manifest = JSON.parse(await toolNamed('get_manifest').run({}, snapshot));
  assert.equal(manifest.stats.documents, 1);
  assert.equal(manifest.stats.references, 1);
});

test('a required argument missing throws a ToolFailure an agent can act on', async () => {
  const { snapshot } = await makeSnapshot();
  await assert.rejects(
    () => toolNamed('read_documentation').run({}, snapshot),
    (error) => error instanceof ToolFailure && /`path`/.test(error.message),
  );
});
