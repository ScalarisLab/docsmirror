'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BIN = path.resolve(__dirname, '..', 'bin', 'docsmirror-lsp.js');

/**
 * A minimal LSP client over stdio, just enough framing and request/response
 * matching to drive the real server process, which is the only way to
 * exercise `isScanned` in server.ts: it gates every request handler, and
 * nothing below that layer knows the file was skipped.
 */
class LspClient {
  constructor(cwd) {
    this.process = spawn(process.execPath, [BIN, '--stdio'], { cwd });
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.process.stdout.on('data', (chunk) => this.onData(chunk));
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }
      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const match = /Content-Length: (\d+)/.exec(header);
      const length = match !== null ? Number(match[1]) : 0;
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) {
        return;
      }
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + length);
      const message = JSON.parse(body);
      if (typeof message.id === 'number' && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
      }
    }
  }

  send(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  notify(method, params) {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
  }

  dispose() {
    this.process.kill();
  }
}

async function makeProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-server-scan-'));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'docs', 'convention.md'),
    [
      '# Convention',
      '',
      'Example:',
      '',
      '```ts',
      '/**',
      ' * @docs decisions/retry-policy.md#idempotency',
      ' */',
      '```',
    ].join('\n'),
    'utf8',
  );
  await fs.mkdir(path.join(root, 'docs', 'decisions'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'docs', 'decisions', 'retry-policy.md'),
    ['# Retry policy', '', '## Idempotency', '', 'Safe by design.'].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'retry.ts'),
    ['/**', ' * @docs decisions/retry-policy.md#idempotency', ' */', 'export function retry() {}'].join('\n'),
    'utf8',
  );
  return root;
}

test('a @docs example inside a markdown file is prose, not a live pointer', async () => {
  const root = await makeProject();
  const client = new LspClient(root);
  try {
    await client.send('initialize', { processId: null, rootUri: `file://${root.replace(/\\/g, '/')}`, capabilities: {} });
    client.notify('initialized', {});

    const docUri = `file://${root.replace(/\\/g, '/')}/docs/convention.md`;
    const docText = await fs.readFile(path.join(root, 'docs', 'convention.md'), 'utf8');
    client.notify('textDocument/didOpen', {
      textDocument: { uri: docUri, languageId: 'markdown', version: 1, text: docText },
    });

    const pointerLine = docText.split('\n').findIndex((line) => line.includes('@docs'));
    const markdownHover = await client.send('textDocument/hover', {
      textDocument: { uri: docUri },
      position: { line: pointerLine, character: 10 },
    });
    assert.equal(markdownHover.result, null);

    const sourceUri = `file://${root.replace(/\\/g, '/')}/retry.ts`;
    const sourceText = await fs.readFile(path.join(root, 'retry.ts'), 'utf8');
    client.notify('textDocument/didOpen', {
      textDocument: { uri: sourceUri, languageId: 'typescript', version: 1, text: sourceText },
    });

    const sourceLine = sourceText.split('\n').findIndex((line) => line.includes('@docs'));
    const sourceHover = await client.send('textDocument/hover', {
      textDocument: { uri: sourceUri },
      position: { line: sourceLine, character: 10 },
    });
    assert.notEqual(sourceHover.result, null);
    assert.match(sourceHover.result.contents.value, /Idempotency/);
  } finally {
    client.dispose();
  }
});
