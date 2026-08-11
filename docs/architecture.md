# Architecture

## Packages

| Package | What it is |
| --- | --- |
| `@docsmirror/core` | The convention itself: comment scanning, pointer parsing, heading slugs, section extraction, resolution, validation. Zero runtime dependencies. |
| `@docsmirror/history` | Reads git history, a repository-level graph of commits touching the docs, a per-note timeline, a diff between revisions. Zero runtime dependencies. |
| `@docsmirror/server` | The language server: hover, inlay hints, go-to-definition, document links, diagnostics. |
| `@docsmirror/web` | The local documentation app behind `docsmirror serve`: browse, search, edit and see history. |
| `@docsmirror/cli` | `docsmirror check`, the anti-rot gate a project wires into its test suite or build, plus `manifest` and `serve`. |
| `@docsmirror/mcp` | The MCP server: the manifest and the docs, exposed as tools and resources for a coding agent. |
| `docsmirror-vscode` | A thin VS Code client that launches the server as a child process at build time. It contains no language feature of its own. |

Every surface reads pointers through `core` and nowhere else. That is what makes the CLI and the
editor agree: a pointer that fails in CI fails in the editor, with the same message. A second
implementation of the parser would be a second definition of the convention, so there is only one.
The same holds one level up: `core`'s `openProject` is the single way a project is opened:
configuration, docs root and resolver constructed in one place, and the CLI, the MCP server and
the web app all call it rather than assembling those pieces themselves.
`core` and `history` are the two foundation packages: each has zero runtime dependencies on the
rest of the workspace, and everything else is built on one or both of them.

The dependency graph is a DAG, not a layer per package. `server` depends only on `core`. `web`
depends on `core` and `history`, it is the piece that turns git log into the "updated *date*" and
the diff view in the local app. `mcp` depends only on `core`, since it hands an agent the manifest
and the docs, not the docs' history. `cli` depends on both `core` and `web`: the least obvious edge
in the graph, because `docsmirror serve` is a `cli` command but its implementation, the server that
answers HTTP requests for the local app, lives in `web`. `cli` bundles it rather than the other way
around so that `web` stays usable as a library on its own. `docsmirror-vscode` sits above all of it
at build time only: it launches `server` as a child process rather than importing it, so the
extension carries no bundled server logic of its own.

The editor integration is a language server rather than an extension per editor for the same
reason `cli` reuses `web` instead of reimplementing it: one server serves VS Code, JetBrains, Neovim,
Zed, Helix and Emacs; each client is a shell that launches a process. Adding an editor should never
mean reimplementing a feature.

## Pluggable docs root

A pointer path is resolved by a `DocsRoot`:

```ts
interface DocsRoot {
  readonly id: string;
  read(path: string): Promise<DocFile | undefined>;
  list(): Promise<readonly string[]>;
  write?(path: string, content: string): Promise<void>;
  invalidate(path?: string): void;
}
```

`LocalDocsRoot` is the only implementation shipped: a folder on disk, with an mtime-keyed cache and
a `list()` used by orphan detection. It also resolves an extension-less pointer and refuses any
path that would escape the root.

Pointer paths are root-relative precisely so this interface can be satisfied by something that is
not a folder, a hosted documentation service, a docs site behind an API, a monorepo-wide shared
docs package. Such a root implements `read` and `list`, and nothing above it changes: the resolver,
the CLI and the language server are written against the interface, never against the filesystem.

`write` is optional, and the only member that is: reading is what makes something a docs root at
all, and a hosted, read-only service is still one. `@docsmirror/web`'s editor is the single caller:
`DocsProject.writeDocument` goes through `root.write`, not through `node:fs`, which is what makes
editing a property of the root rather than something only `LocalDocsRoot` can do. A root that omits
`write` simply cannot be edited; nothing above it assumes otherwise.

Two consequences worth knowing:

- `lastModified` and `uri` are optional on `DocFile`. A root that cannot supply a modification date
  makes staleness `unknown` rather than wrong; a root that cannot supply a URI simply has no
  go-to-definition target. Surfaces degrade, they do not break.
- `invalidate()` is how a watcher tells a root that a document changed. The language server calls it
  when the client reports a file change under the docs root.
