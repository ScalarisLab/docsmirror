#!/usr/bin/env node
/**
 * Bundles the extension and the language server into `dist/`.
 *
 * A `.vsix` is a flat archive: it cannot carry the symlinked workspace
 * dependency an installed extension would need, so both entry points are
 * inlined here. The server stays a file of its own and is still spawned as a
 * separate process, bundling changes how the code is shipped, never where it
 * runs.
 * @docs vscode.md#packaging-for-vs-code
 */
'use strict';

const path = require('node:path');
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const here = (...segments) => path.join(__dirname, ...segments);

/** The extension host module, and the server process it launches. */
const targets = [
  { entryPoints: [here('src/extension.ts')], outfile: here('dist/extension.js') },
  { entryPoints: [here('../server/bin/docsmirror-lsp.js')], outfile: here('dist/server.js') },
];

/** `vscode` is provided by the editor at runtime and must never be bundled. */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: watch,
  logLevel: 'info',
};

async function main() {
  const contexts = await Promise.all(targets.map((target) => esbuild.context({ ...common, ...target })));
  if (watch) {
    await Promise.all(contexts.map((context) => context.watch()));
    return;
  }
  await Promise.all(contexts.map(async (context) => {
    await context.rebuild();
    await context.dispose();
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
