# DocsMirror documentation

DocsMirror keeps source comments short and the explanation in markdown. A comment states the rule
in one line and points at the document that justifies it:

```ts
/**
 * Retries are safe here: the endpoint is idempotent by design.
 * @docs decisions/retry-policy.md#idempotency
 */
```

Around that convention sits a generated map of the whole documentation surface, the
[manifest](manifest.md), and the surfaces that consume it: a CLI gate, a language server, an MCP
server for agents, and a local web app for reading and writing the documentation itself.

This folder is also the project dogfooding itself, every `@docs` pointer in this repository's
source resolves into these files, and `docsmirror check` fails the build if one stops resolving.

## The convention

- [The convention](convention.md), the pointer syntax, anchors, and how comments are scanned.
- [Staleness](staleness.md), what the badge means and how to tune it.

## The map

- [The manifest](manifest.md), the machine-readable description of the documentation surface,
  what it contains and how it is kept current.
- [Architecture](architecture.md), the packages and the pluggable docs root.

## The surfaces

- [The `docsmirror` CLI](cli.md), checking pointers, orphan detection, generating the manifest.
- [The language server](server.md), hover, inlay hints, diagnostics, and how to wire any LSP
  client to it.
- [The VS Code client](vscode.md), collapsed markers, the inline documentation view, and how the
  extension is packaged.
- [The MCP server](mcp.md), how a coding agent discovers and reads documentation.
- [The web app](web.md), `docsmirror serve`: browse, search, edit, and read history locally.
- [History](history.md), reading a documentation folder's git history: the repository graph,
  per-file timelines, and diffs.

## For agents

- [Working with AI agents](agents.md), the portable instruction file for coding agents.
