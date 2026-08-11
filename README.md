# DocsMirror

A long explanatory comment is expensive. Every reader pays for it, including every AI agent that
opens the file and loads prose it did not need, and nothing ever checks whether it is still true.
Deleting it is worse: the knowledge was real.

DocsMirror moves the explanation into markdown and leaves a pointer behind.

```ts
/**
 * Retries are safe here: the endpoint is idempotent by design.
 * @docs decisions/retry-policy.md#idempotency
 */
export async function retry(operation: Operation): Promise<Result> {
```

One line of claim, one line of pointer. The reasoning lives in `docs/decisions/retry-policy.md`
under `## Idempotency`, where it can be reviewed, linked and versioned like everything else. Your
editor shows you that section without leaving the file, and CI fails the day the pointer stops
resolving.

## The convention

```
@docs <path>#<anchor>
```

- **`<path>` is relative to your docs root** (`docs/` by default), never to the file carrying the
  pointer. Source files move between directories; the pointer survives. It also means the root can
  be swapped for something that is not a folder, without touching a single comment.
- **`<anchor>` is a GitHub-style heading slug**, and it is optional. A bare `@docs architecture.md`
  points at the whole document. A section is the heading and everything under it.
- **A pointer occupies its own comment line**, in any language: `//`, `#`, `--`, `;`, `%`,
  `/* */`, `<!-- -->`, `""" """` and more. DocsMirror scans comment syntax, not an abstract syntax
  tree, so it works in languages it has never heard of.

Full details, including what is rejected and why: [docs/convention.md](docs/convention.md).

## The manifest

A pointer tells you where the reasoning for *this* code lives. It does not tell you what a
repository documents in total, and an agent that wants to know has exactly one option today: read
the whole folder and hope. That is the original problem one level up.

`docsmirror manifest` generates `docsmirror.json`: a machine-readable description of the entire
documentation surface: every document, a derived one-line summary of what it covers, every anchor,
and **which code points at it**.

```json
{
  "path": "decisions/retry-policy.md",
  "title": "Retry policy",
  "summary": "When an operation may be retried, and what makes that safe.",
  "anchors": [{ "slug": "idempotency", "title": "Idempotency", "level": 2 }],
  "referencedBy": [{ "file": "src/http/retry.ts", "line": 42, "symbol": "retry", "anchor": "idempotency" }]
}
```

Publishing a description of a surface is what lets a caller stop guessing at it. This does that for
a codebase's documentation, and it is what an agent fetches **first**: one file path to open instead
of forty.

The map is bidirectional: the source says "explained there", and the manifest inverts it into
"this code depends on this document". Summaries are derived from the prose, never hand-maintained,
and `docsmirror check` fails when the committed manifest no longer matches what is on disk.
Details: [docs/manifest.md](docs/manifest.md).

## Adopting it in an existing repository

1. **You already have a `docs/` folder?** Then you are set up. If your documentation lives
   somewhere else, add a `docsmirror.config.json` at the repository root:

   ```json
   { "docsRoot": "documentation" }
   ```

2. **Move one long comment.** Take the worst explanatory comment you have, put it in a document
   under a heading, and leave the claim plus the pointer behind. You do not need to convert
   anything else; a pointer is useful on its own from the first one.

3. **Wire the check into CI**, so the pointer cannot rot:

   ```bash
   npx @docsmirror/cli check
   ```

   ```json
   { "scripts": { "test": "docsmirror check && <your tests>" } }
   ```

   Generate the map at the same time with `npx @docsmirror/cli manifest`, and commit
   `docsmirror.json`; `check` then fails whenever it drifts from the documentation.

4. **Install the editor integration** (below), so writing a pointer pays off immediately.

5. **Tell your AI agents about it.** [`skill/docsmirror.md`](skill/docsmirror.md) teaches an agent to
   resolve a pointer against the docs root, to fetch the target only when it is relevant, and, the
   part that compounds, to put its own long explanations in `docs/` and leave a pointer instead. For
   Claude Code, drop it in as-is at `.claude/skills/docsmirror/SKILL.md`; for anything else, append
   it to `AGENTS.md`, `CLAUDE.md`, `.cursorrules` or a system prompt. Details:
   [docs/agents.md](docs/agents.md).

## `docsmirror check`

The anti-rot mechanism, and the highest-value piece. It scans your sources, resolves every pointer,
and exits non-zero when one is broken:

```
src/http/retry.ts
  42:5  error  `decisions/retry-policy.md` has no heading anchored at `#idempotency`. Did you mean `#idempotent-writes`?

38 files scanned, 24 pointers found, 23 resolved, 1 issue.
```

It reports a pointer whose document does not exist, a pointer whose anchor does not exist, a
malformed pointer, and, with `--orphans`, a document that no pointer and no index can reach. Full
reference, including configuration and the `--json` report: [docs/cli.md](docs/cli.md).

## In your editor

DocsMirror is a **language server**, not an extension for one editor. Every editor that speaks LSP
gets the same five features from the same process: VS Code, JetBrains IDEs, Neovim, Zed, Helix,
Emacs.

| Feature | What you get on a `@docs` line |
| --- | --- |
| **Hover** | The full target section, rendered as markdown: headings, tables, code blocks, links. This is where the documentation actually appears. |
| **Inlay hint** | A persistent hint showing the section title, its last-modified date and a staleness badge. |
| **Diagnostics** | An unresolvable path or a missing anchor reported live, in the Problems panel, while you type: the same check CI runs. |
| **Go to definition** | Jumps to the markdown file, at the right heading. |
| **Document link** | Ctrl-click the pointer. |

### What can and cannot be rendered inline

Being honest about this, because it drives what DocsMirror does and does not promise:
**persistent, rich, non-text content rendered inline in the code flow does not exist natively in
any IDE.** VS Code decorations are text plus CSS. JetBrains custom inlays are a proprietary,
incompatible API. There is no cross-editor mechanism that keeps a rendered table or an image
sitting in your source file.

So the choice is real, and DocsMirror ships all three sides of it:

- **persistent and textual**: the inlay hint, always visible, text only. In VS Code it also stands
  in for the pointer, which is collapsed out of the way;
- **rich and on demand**: the hover, full markdown, appearing where the pointer is;
- **inline and on demand**: the peek view, an embedded editor holding the target section open
  between two lines of code until you dismiss it. Source text, not rendered markdown, which is the
  ceiling of what an editor can inline through stable APIs. VS Code goes one step further behind
  `docsmirror.inlineDocs.enabled`: fully rendered markdown inside the comment, built on an API that
  is still proposed and therefore off by default; peek is the fallback everywhere else.

Nothing here renders images or interactive components permanently in your buffer, and no tool can.
Image rendering inside a hover varies by client: DocsMirror emits the markdown and lets the client
decide.

### VS Code

The extension lives in [`packages/vscode`](packages/vscode). Until it reaches the marketplace,
package and install it from the repository:

```bash
npm run package -w docsmirror-vscode
code --install-extension packages/vscode/docsmirror-vscode.vsix
```

It launches the server and adds only what LSP has no notion of: collapsing a pointer into its
marker, and expanding that marker into a peek.

### Any other LSP client

Point your client at the server binary: it speaks stdio and needs no arguments.

```bash
npx --package @docsmirror/server docsmirror-lsp --stdio
```

Attach it to all file types (the convention is language-agnostic) and send your settings under the
`docsmirror` section. See [docs/server.md](docs/server.md) for a per-editor example and the full
settings schema.

## For your agents

The manifest is what an agent needs; MCP is how it gets it.

```bash
npx --package @docsmirror/mcp docsmirror-mcp
```

Five tools: `list_documentation` to discover, `search_documentation` to find,
`read_documentation` to read one section, `find_references` to see what code depends on a document,
`get_manifest` for the whole map, plus every document as an MCP resource at `docs://<path>`. The
map is built from the live filesystem and rebuilt when documentation changes, so an agent is never
handed a stale index. Details: [docs/mcp.md](docs/mcp.md).

Pair it with [`skill/docsmirror.md`](skill/docsmirror.md), which teaches an agent to read the
manifest first and to leave a pointer instead of a long comment.

## Reading and writing documentation locally

```bash
npx @docsmirror/cli serve
```

A local app to browse, search, **edit** and see the history of the repository's markdown. It reads
and writes the real files in your working tree and binds to loopback only; it is a dev tool, not a
hosted site.

Three columns: the docs tree on the left, the document in the middle with breadcrumbs, and on the
right its table of contents plus **Referenced by**: the code whose `@docs` pointers target the
page you are reading. That last panel is the thing no other documentation tool can show you.
`Cmd`/`Ctrl`-`K` searches the manifest. Editing happens in place, and history hangs off the
"updated *date*" in the header rather than a separate screen.

History comes from git rather than from a versioning format invented inside the documents: a
repository-level graph of commits touching the docs, a linear timeline per note, and a diff between
any two revisions. Details: [docs/web.md](docs/web.md).

## Packages

| Package | What it is |
| --- | --- |
| [`@docsmirror/core`](packages/core) | The convention itself: parsing, resolution, validation, and the manifest. Zero runtime dependencies. |
| [`@docsmirror/cli`](packages/cli) | `docsmirror check`, `manifest`, `serve`. |
| [`@docsmirror/server`](packages/server) | The language server. |
| [`@docsmirror/mcp`](packages/mcp) | The MCP server, for coding agents. |
| [`@docsmirror/web`](packages/web) | The local documentation app. |
| [`@docsmirror/history`](packages/history) | Reads git history. Zero runtime dependencies. |
| [`docsmirror-vscode`](packages/vscode) | A thin VS Code client. |

Every surface reads pointers through `core`, which is why the editor and CI can never disagree
about what a pointer means.

The docs root is an interface, not a folder path: `LocalDocsRoot` is simply the implementation
that reads from disk. That is what makes it possible to point DocsMirror at a hosted documentation
service later without changing a single comment in your code. That backend is not built;
[docs/architecture.md](docs/architecture.md#pluggable-docs-root) describes exactly what implementing
one requires.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This repository dogfoods its own convention: `npm run check`
validates every pointer in it. To browse the documentation end to end rather than through the links
above, start at [docs/index.md](docs/index.md).

## License

[MIT](LICENSE).
