'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { TextDocument } = require('vscode-languageserver-textdocument');
const { Workspace } = require('../dist/workspace/Workspace.js');
const { PointerIndex } = require('../dist/pointer/PointerIndex.js');
const { hoverAt } = require('../dist/features/hover.js');
const { pointerMarkersFor } = require('../dist/features/pointers.js');
const { documentLinksFor } = require('../dist/features/documentLink.js');
const { diagnosticsFor } = require('../dist/features/diagnostics.js');
const { DEFAULT_SETTINGS } = require('../dist/settings.js');

/**
 * These exercise the LSP features directly against a real `Workspace` built
 * on a temp docs root, the same functions the language server wires to
 * `textDocument/hover`, `docsmirror/pointers`, `documentLink` and
 * `publishDiagnostics`, without going through the LSP transport itself.
 */
async function makeWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-server-'));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'docs', 'retry-policy.md'),
    ['# Retry policy', '', 'When an operation may be retried.', '', '## Idempotency', '', 'Safe by design.'].join(
      '\n',
    ),
    'utf8',
  );
  const workspace = await Workspace.create(root, DEFAULT_SETTINGS);
  return { root, workspace };
}

function sourceDocument(text) {
  return TextDocument.create('file:///project/src/retry.ts', 'typescript', 1, text);
}

test('hover on a resolved pointer shows the section title and body', async () => {
  const { workspace } = await makeWorkspace();
  const document = sourceDocument(['// @docs retry-policy.md#idempotency', 'export function retry() {}'].join('\n'));
  const index = new PointerIndex();

  const hover = await hoverAt(document, { line: 0, character: 10 }, workspace, index);

  assert.notEqual(hover, null);
  assert.match(hover.contents.value, /\*\*Idempotency\*\*/);
  assert.match(hover.contents.value, /Safe by design\./);
});

test('hover on an unresolved anchor suggests the near miss', async () => {
  const { workspace } = await makeWorkspace();
  const document = sourceDocument('// @docs retry-policy.md#idempotencyy');
  const index = new PointerIndex();

  const hover = await hoverAt(document, { line: 0, character: 10 }, workspace, index);

  assert.match(hover.contents.value, /Anchor not found/);
  assert.match(hover.contents.value, /Did you mean `#idempotency`\?/);
});

test('hover on a pointer to a document that does not exist explains that instead', async () => {
  const { workspace } = await makeWorkspace();
  const document = sourceDocument('// @docs ghost.md');
  const index = new PointerIndex();

  const hover = await hoverAt(document, { line: 0, character: 10 }, workspace, index);

  assert.match(hover.contents.value, /Unresolved pointer/);
  assert.match(hover.contents.value, /No document at `ghost\.md`/);
});

test('hover off a pointer line is null', async () => {
  const { workspace } = await makeWorkspace();
  const document = sourceDocument('export function retry() {}');
  const index = new PointerIndex();

  assert.equal(await hoverAt(document, { line: 0, character: 5 }, workspace, index), null);
});

test('pointer markers carry the resolved title and the ranges to draw it over', async () => {
  const { workspace } = await makeWorkspace();
  const document = sourceDocument(
    ['// @docs retry-policy.md#idempotency', '// @docs retry-policy.md#idempotency'].join('\n'),
  );
  const index = new PointerIndex();

  const result = await pointerMarkersFor(document, workspace, index);

  assert.equal(result.docsRootFound, true);
  assert.equal(result.markers.length, 2);
  for (const marker of result.markers) {
    assert.equal(marker.resolved, true);
    assert.equal(marker.label, 'Idempotency');
    // The target sub-range is what a client hides: it starts inside the
    // pointer range, at the `path#anchor` half, and both end together.
    assert.ok(marker.targetRange.start.character > marker.range.start.character);
    assert.equal(marker.targetRange.end.character, marker.range.end.character);
  }
});

test('pointer markers report a missing docs root once, not per pointer', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-server-'));
  const workspace = await Workspace.create(root, DEFAULT_SETTINGS);
  const document = sourceDocument('// @docs retry-policy.md#idempotency');
  const index = new PointerIndex();

  const result = await pointerMarkersFor(document, workspace, index);

  // `docsRootFound: false` is the one field that lets a client tell "this
  // file points at nothing" apart from "nothing here can resolve".
  assert.equal(result.docsRootFound, false);
  assert.deepEqual(result.markers, []);
});

test('an unresolved marker carries the written path as its label', async () => {
  const { workspace } = await makeWorkspace();
  const document = sourceDocument('// @docs missing.md#nope');
  const index = new PointerIndex();

  const [marker] = (await pointerMarkersFor(document, workspace, index)).markers;
  assert.equal(marker.resolved, false);
  assert.equal(marker.label, 'missing.md#nope');
});

test('a document link targets the file the pointer resolves to', async () => {
  const { workspace, root } = await makeWorkspace();
  const document = sourceDocument('// @docs retry-policy.md#idempotency');
  const index = new PointerIndex();

  const [link] = await documentLinksFor(document, workspace, index);
  assert.notEqual(link, undefined);
  assert.match(link.target, /retry-policy\.md$/);
  assert.match(link.target, new RegExp(require('node:url').pathToFileURL(root).protocol));
});

test('diagnostics report an unresolved anchor and stay quiet for a resolved one', async () => {
  const { workspace } = await makeWorkspace();

  const broken = sourceDocument('// @docs retry-policy.md#nope');
  const brokenDiagnostics = await diagnosticsFor(broken, workspace);
  assert.equal(brokenDiagnostics.length, 1);
  assert.equal(brokenDiagnostics[0].code, 'anchor-not-found');

  const clean = sourceDocument('// @docs retry-policy.md#idempotency');
  assert.deepEqual(await diagnosticsFor(clean, workspace), []);
});
