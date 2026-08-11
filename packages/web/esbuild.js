#!/usr/bin/env node
/**
 * Bundles the search algorithm for the browser.
 *
 * `search.ts` has no runtime dependency on Node or on the project: given a
 * corpus and a query, it is a pure function. The live server calls it against
 * documents read from disk; a static export calls the exact same bundle
 * against a corpus baked in at export time, so a reader gets the same ranking
 * either way. This is the one part of the front end that is not shipped as
 * hand-written `public/*.js`, because it is the one part that must stay
 * byte-for-byte the same function the server runs.
 * @docs web.md#static-export
 */
'use strict';

const path = require('node:path');
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const here = (...segments) => path.join(__dirname, ...segments);

const options = {
  entryPoints: [here('src/search.ts')],
  outfile: here('dist/browser/search.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  sourcemap: watch,
  logLevel: 'info',
};

async function main() {
  const context = await esbuild.context(options);
  if (watch) {
    await context.watch();
    return;
  }
  await context.rebuild();
  await context.dispose();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
