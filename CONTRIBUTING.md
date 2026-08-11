# Contributing to DocsMirror

## Getting set up

```bash
npm install
npm run build      # builds every package, in dependency order
npm test           # the test suites
npm run check      # DocsMirror validating its own pointers and manifest
npm run manifest   # regenerate docsmirror.json after changing documentation
```

Node 18 or newer. There is no test framework dependency and no bundler outside the VS Code client:
the build is `tsc -b` across TypeScript project references, the tests are `node --test`, and only
`packages/vscode` bundles (esbuild, because an extension ships as a single file).

To run the extension while developing it, open this repository in VS Code and press `F5`: the
`Run Extension` configuration in `.vscode/launch.json` builds the client and the server and starts
an Extension Development Host. `npm run serve` starts the local documentation app against this
repository's own `docs/`.

## The layout

| Package | What belongs there |
| --- | --- |
| `packages/core` | The convention: comment scanning, pointer parsing, slugs, section extraction, resolution, validation, and the manifest. |
| `packages/cli` | `check`, `manifest`, `serve`, and nothing that is not a command-line concern. |
| `packages/server` | The language server and everything an editor sees. |
| `packages/mcp` | The MCP server and everything a coding agent sees. |
| `packages/web` | The local documentation app: HTTP API and front end. |
| `packages/history` | Reading git. No knowledge of the convention. |
| `packages/vscode` | A client that launches the language server. No language feature. |
| `skill/` | The portable instruction file for AI coding agents. |
| `docs/` | The documentation this project points at, including its own. |

Two rules keep that honest:

- **`core` owns the convention.** If the CLI or the server needs to know what a pointer means, it
  asks `core`. A second parser would be a second definition of the convention, and the two would
  drift. If `core` does not expose what you need, extend `core`.
- **`core` has no runtime dependencies**, and the other packages take on as few as possible, all
  MIT/ISC/Apache-2.0. It is a parser and a resolver; it should not need anything.

## House rules

- **English only** in code, comments, identifiers and user-visible strings.
- **No dead code.** No TODO, no commented-out block, no empty stub, no placeholder. If something is
  out of scope, say so in a pull request or in the documentation, not with a marker in the source.
- **Documentation is part of the change.** If you alter behaviour, a public API, the configuration
  or a workflow, update `docs/` in the same pull request. Prefer extending an existing document
  over adding a new one.
- **Follow the convention here too.** A long explanation belongs in `docs/` behind a pointer. Run
  `npm run check` before opening a pull request; it validates every pointer in this repository, and
  the same command is what adopters run in their own.

## Adding an editor client

A new client should be a shell that starts `@docsmirror/server` over stdio or IPC and forwards the
`docsmirror` configuration section. If you find yourself implementing a hover or a diagnostic in a
client, it belongs in the server instead, where every other editor gets it too.

## Pull requests

Keep the typecheck green (`npm run typecheck`), keep `npm test` green, and describe what changed
and why. New behaviour in `core` should come with a test in `packages/core/test`.

Contributions are accepted under the [MIT license](LICENSE) that covers the repository; submitting
a pull request is your agreement to license the change the same way.
