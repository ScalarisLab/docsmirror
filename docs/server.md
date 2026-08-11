# The language server

## The server

`@docsmirror/server` is where every editor feature lives. One process, spoken to over LSP, serves
VS Code, JetBrains IDEs, Neovim, Zed, Helix and Emacs alike, the alternative, an extension per
editor, would mean reimplementing the same hover five times and watching four of them fall behind.

It announces `hoverProvider` and `definitionProvider` unconditionally, and adds
`inlayHintProvider` and `documentLinkProvider` only when the client advertises support for them, so
a minimal client never receives a capability it cannot use. Request handlers never throw: a failure
returns an empty result and is logged to the client's output channel, because a language server
that takes the editor down with it is worse than one that shows nothing.

Everything it knows about the convention comes from `@docsmirror/core`. That is deliberate, see
[Architecture](architecture.md#packages), and it is why a pointer that fails in CI fails in the
editor with the identical message.

## Launching

The server speaks stdio by default and needs no arguments:

```bash
npx --package @docsmirror/server docsmirror-lsp --stdio
```

`--stdio` is accepted and ignored, since many clients pass it unconditionally; `--node-ipc` selects
IPC when the client spawns the server as a Node child process, which is what the VS Code client
uses.

## Editor clients

A client is a shell: start the process, attach it to **all** file types, the convention is
language-agnostic, so selecting by language would be wrong, and forward the `docsmirror`
[settings](#settings) section. It should also watch `**/*.{md,markdown}` and
`docsmirror.config.json` so the server learns when documentation changes.

VS Code users install [`docsmirror-vscode`](../packages/vscode); what that client renders on top
of the protocol, collapsed markers, the inline documentation view, is
[its own document](vscode.md). For anything else, the generic recipe is the command above plus a
file-scheme document selector. In Neovim with `nvim-lspconfig`, for instance, that is a `cmd` of
`{ 'docsmirror-lsp', '--stdio' }` and a `filetypes` list left unset so it attaches everywhere.

If you find yourself implementing a hover or a diagnostic inside a client, it belongs in the server
instead, where every other editor gets it too.

## Hover

The headline feature, and the one that makes the convention pay for itself. Hovering a pointer
returns the **full target section** as markdown, headings, tables, code blocks, links, preceded
by a compact header line naming the document and its freshness.

A section is written to be read on a documentation page, not in a tooltip, so the server reshapes
it without changing what it says: the section's own heading becomes the hover title rather than a
full-width banner, remaining headings are demoted to stay below it, and relative links are
rewritten to absolute URIs so they still work from inside the hover box.

Images are emitted exactly as written. Client support for rendering them varies, and DocsMirror
deliberately does not depend on it, a client that shows the alt text instead loses decoration, not
information.

A pointer that does not resolve still produces a hover, and that hover says what is wrong: the
document does not exist, or the anchor does not, with the nearest matching anchor suggested when
there is one. Showing nothing would leave the reader unable to tell a broken pointer from a broken
editor.

## Inlay hints

A persistent hint on the pointer line carrying the section title, the target's last-modified date
and a staleness badge. This is the always-visible surface, and it is **text only**, that is the
protocol's ceiling, not an implementation shortcut. See the honest statement of what no IDE can
render inline in the [README](../README.md#what-can-and-cannot-be-rendered-inline).

The label is resolved lazily through `inlayHint/resolve`, so scrolling a large file does not read
every target document; the tooltip carrying the full section arrives only when the reader points at
the hint.

Turn them off with `docsmirror.inlayHints.enabled`. A client that draws the pointer line itself can
also suppress them without touching the user's settings, by rewriting the configuration it serves:
the hints are read through a configuration pull on every settings change, so what the client
answers is what the server believes. That is exactly what the
[VS Code client](vscode.md#collapsed-markers) does while its markers are on: the server's hint
would be a second copy of the same sentence on the same line.

## Custom requests

Two requests exist outside the protocol, for clients that render the convention themselves. Their
method names and result shapes are exported from the package, both from the main entry and from
the dependency-free `dist/protocol` module, so a bundling client ships the contract without the
server behind it.

### The pointers request

`docsmirror/pointers` takes `{ textDocument: { uri } }` and answers with every pointer in the
document: its range, the `path#anchor` sub-range a client would hide, whether it resolved, and the
section's title to draw in its place.

It exists because a client drawing its own pointer line cannot get there from the standard
requests, links carry no title, hints carry no range, diagnostics carry neither, and stitching
the three together would mean the client reimplementing the convention badly.

`docsRootFound: false` says the project has no documentation folder at all. It is the one fact a
client needs beyond the markers themselves, an empty marker list means *this file points at
nothing*, a missing docs root means *nothing in this project can resolve*, and a client should
draw nothing in that case: the [diagnostic](#diagnostics) already says the one true thing.

### The section request

`docsmirror/section` takes `{ textDocument, position }` and answers with the pointer's section as
markdown, title, docs-root-relative path, freshness line, and the body with front matter stripped
and relative links absolutized.

Hover already renders a section, but a client cannot reuse it: a hover is a `MarkupContent` the
editor owns and disposes, and a client that wants the prose somewhere of its own needs the markdown
in its hands. It is fetched per pointer rather than shipped with every marker, because a marker
answer is drawn on every keystroke and a section is not: the inline client asks for them once per
document, ahead of the reader, and keeps them.

The position is matched by **line**, not by column. Once a pointer is collapsed there is no column
left to aim at, and "expand the documentation on this line" is the question being asked anyway.

## Diagnostics

The anti-rot mechanism made continuous. The server runs core's `validateSource`, the same function
`docsmirror check` runs, on every open document, so a broken pointer appears in the Problems panel
while you type and clears the moment you fix it.

Everything is reported at **warning** severity, under the source name `docsmirror`. A pointer aimed
at a missing anchor is a documentation problem, and dressing it as an error next to real compiler
errors is how a check earns itself a permanent `// eslint-disable`-shaped workaround.

Validation is debounced, and re-runs when a document under the docs root changes: the client's
watched-file notifications invalidate the cached docs root, so renaming a heading immediately
lights up every pointer that targeted it.

One case is reported differently on purpose. When the project has **no docs root at all**, every
pointer in the file would otherwise be reported as a missing document, dozens of warnings that all
blame the file for something that is true of the tool's own bearings. Instead the server emits a
single `docs-root-not-found` warning saying so, and naming the folder it looked for and where. The
difference between *this pointer is wrong* and *I do not know where your documentation is* is the
difference between a diagnostic worth reading and noise.

Turn them off with `docsmirror.diagnostics.enabled`.

## Definition

Go-to-definition on a pointer jumps to the markdown file, positioned at the heading line of the
anchored section, or at the top of the document for a bare pointer. Clients that support
`LocationLink` get the originating pointer range too, which is what makes the peek preview show the
right span.

## Document links

The pointer range is also published as a document link with the same target, so ctrl-click works in
clients that prefer links to definitions. It costs nothing once the pointer is parsed, and some
editors expose only one of the two.

## Pointer index

Hover, inlay hints, definition, links and diagnostics all ask the same question of the same text.
The server parses each open document once per version and caches the result, rather than five times
per keystroke. The cache is keyed by document version, so it is never stale, and entries are
dropped when a document closes.

## Labels

One vocabulary across every surface, so the same document never reads two ways: `Fresh`, `Aging`,
`Stale`, and `Undated` when the docs root cannot supply a modification date. Dates render as
`updated 2026-07-14 · Aging`. What the thresholds mean, and how to change them, is in
[Staleness](staleness.md#how-staleness-is-computed).

## Workspaces

The server resolves a docs root per **project**, and finds the project from the file, not from the
window. Each root loads its own `docsmirror.config.json` and gets its own resolver and cache.

### Finding the project root

An editor window is not a project. People open a folder holding several checkouts side by side, or
a monorepo whose packages each document themselves. Resolving the docs root as
`<workspace folder>/docs` breaks both: open a container folder and every pointer in every project
inside it reports as broken, because the container has no `docs/` of its own. A validator that
cries wolf on a whole corpus is worse than no validator, it teaches the reader to ignore it.

So ownership is decided by walking up from the file, stopping at the workspace folder:

1. the nearest ancestor holding a `docsmirror.config.json`, an explicit declaration wins over any
   guess, wherever it sits;
2. failing that, the nearest ancestor that both looks like a project (`package.json`, `.git`,
   `pyproject.toml`, `go.mod`, `Cargo.toml` and the rest) **and** has the configured docs folder;
3. failing that, the nearest ancestor that merely has the docs folder;
4. failing everything, the workspace folder itself.

The walk never goes above what the user opened, and its result is cached per directory, it runs on
every hover, every keystroke's diagnostics and every marker redraw, so walking the filesystem each
time would cost more than the answer is worth. The cache is dropped when a configuration file
changes or the docs root setting moves, which are the only things that can change an answer.

A document belonging to no folder falls back to the single root the client reported at
initialisation.

## Settings

Sent by the client under the `docsmirror` section. Settings are a thin override layer over
`docsmirror.config.json`: what they set wins, what they omit keeps the file's value, so CI and the
editor stay in agreement by default.

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| `docsmirror.docsRoot` | string | `docs` | Docs root, relative to the workspace folder. |
| `docsmirror.staleness.agingAfterDays` | number | `90` | Age at which a document becomes `Aging`. |
| `docsmirror.staleness.staleAfterDays` | number | `180` | Age at which a document becomes `Stale`. |
| `docsmirror.inlayHints.enabled` | boolean | `true` | Show the hint on the pointer line. |
| `docsmirror.diagnostics.enabled` | boolean | `true` | Report broken pointers as problems. |

Unknown fields and wrong types are ignored rather than rejected. A language server that refuses to
start over a typo in a settings file is a broken editor.

Settings the server never sees, the marker toggle, the inline view, tracing, are the VS Code
client's own, listed in [Client-only settings](vscode.md#client-only-settings).
