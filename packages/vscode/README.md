# DocsMirror for VS Code

A `@docs decisions/caching.md#why-a-write-through-cache` comment is precise and unreadable. This
extension collapses it into the thing you actually wanted, the section's title, and expands it,
in place, into the documentation itself.

Everything it knows comes from the
[DocsMirror language server](https://github.com/ScalarisLab/docsmirror/tree/main/packages/server):
hovers, inlay hints, go-to-definition, document links and diagnostics are all the server's, so the
same behaviour is available in any editor that speaks LSP.

## Install and try it

The extension is not on the Marketplace. Build the `.vsix` and install it:

```bash
npm install
npm run package --workspace packages/vscode
code --install-extension packages/vscode/docsmirror-vscode.vsix
```

Then reload VS Code and open a project that has a `docs/` folder and at least one `@docs` pointer
in a comment, for example:

```ts
/**
 * @docs decisions/caching.md#why-a-write-through-cache
 */
```

The path is relative to the docs root. If your documentation does not live in `docs/`, point
`docsmirror.docsRoot` at the right folder, in the Settings UI under *Extensions → DocsMirror*, or
in `.vscode/settings.json`:

```json
{ "docsmirror.docsRoot": "documentation" }
```

A `docsmirror.config.json` at the workspace root works too, and is the better place for it when the
setting should be shared with the rest of the team and with CI.

### What you should see

**The pointer line collapses.** Where the file says

```ts
 * @docs decisions/caching.md#why-a-write-through-cache
```

the editor shows

```text
 * @docs Why a write-through cache ▾
```

The file on disk is never touched, the pointer is what the CLI and CI read, and it is still there.
Put the cursor on the line and the raw text comes straight back so you can edit it. `@docs` stays
visible so the line still reads as a pointer, and ctrl-click still opens the document.

The label is the section's title, a chevron, and nothing else on purpose. The line is a control:
it says what the section is called and which way it will move when clicked, and a control reads as
a control when it says one thing. The date and the freshness line are in the hover, where there is
room for them.

**Expand it in place** by clicking `@docs` (or the line's indentation, or the background past the
end of the line, the painted label itself cannot take a click), with <kbd>Alt</kbd>+<kbd>D</kbd>,
or with *DocsMirror: Expand Documentation Here* in the Command Palette. A peek view opens between
the lines of code showing the target section at its heading; <kbd>Escape</kbd> closes it. The
shortcut is only active while the cursor is on a pointer line, so it never takes the key away from
anything else.

### Reading the documentation inside the comment

The peek view is the fallback. The real thing is the section rendered **in the comment itself**, in
the text flow, pushing the code down. Click the marker and the section opens where it stands, with
the content already fetched and rendered before you asked; click it again and it closes. Nothing
ever opens by itself, a screenful of documentation nobody asked for is a screenful of code nobody
can see.

<kbd>Alt</kbd>+<kbd>D</kbd> does the same from the keyboard: it closes the section under the cursor
when one is open, and opens it when none is. A section you closed stays closed, scrolling past it,
and editing above it, will not reopen it. Closing one is also how you get the raw `path#anchor`
back to edit it, since an open section keeps its own pointer line collapsed.

Only what is near the screen costs anything: scrolling an open section out of view destroys its
webview and scrolling back rebuilds it from what was already rendered and measured. So the cost of
a file is set by the height of your window, not by how many pointers the file holds. Measured on an
890-line file with 27 pointers, typing and scrolling are as fast with every visible section open as
with none, and reading the file top to bottom leaves memory where it found it, see
[what it costs, measured](https://github.com/ScalarisLab/docsmirror/blob/main/docs/vscode.md#what-it-costs-measured).

It is off by default because it needs a VS Code API that is still *proposed*, which VS Code only
grants at startup. To turn it on:

1. set `docsmirror.inlineDocs.enabled` to `true`;
2. run **Preferences: Configure Runtime Arguments** from the Command Palette and add
   `"enable-proposed-api": ["docsmirror.docsmirror-vscode"]`;
3. restart VS Code.

Without step 2 the setting does nothing and expanding keeps opening the peek view.

> Declaring a proposed API is also what makes this extension ineligible for the Marketplace. That is
> a deliberate trade for a tool installed from a local `.vsix`; removing `enabledApiProposals` from
> `package.json` makes it publishable again, and the feature then simply never switches on.

The rest:

| Feature | How to trigger it | What appears |
| --- | --- | --- |
| **Hover** | Point at the marker or the pointer | A tooltip with the section's heading, its freshness line, then the whole section rendered as markdown, tables, code blocks and links included |
| **Go to definition** | <kbd>F12</kbd>, or <kbd>Ctrl</kbd>-click, on the pointer | The markdown file opens, scrolled to the heading the anchor names. A bare pointer with no `#anchor` opens at the top of the file |
| **Diagnostics** | Change the anchor to something that does not exist | A warning in the Problems panel within about a second, *"`decisions/caching.md` has no heading anchored at `#nope`. Did you mean `#why-a-write-through-cache`?"*, which clears as soon as you undo |

A pointer that does not resolve never collapses. It keeps its raw text and is marked `⚠ unresolved`
in red, beside the warning it already produced, because a tidy label on a pointer that leads nowhere
would be worse than no label.

### Where it looks for your documentation

Not next to the folder you opened, next to the **file**. DocsMirror walks up from each file to the
nearest project that owns it: the nearest `docsmirror.config.json`, failing that the nearest folder
that looks like a project (`package.json`, `.git`, `go.mod`, `Cargo.toml` and friends) and has a
`docs/` folder, failing that the nearest folder with one. It never looks above the folder you
opened.

That means you can open a folder holding several checkouts side by side, or a monorepo whose
packages document themselves separately, and each file is still checked against its own
documentation.

If a file's project genuinely has no docs folder, you get **one** warning saying so, naming the
folder it looked for and where, rather than one "missing document" per pointer.

Nothing appears at all? Open *Output → DocsMirror* to see what the server reported, and check that
`docsmirror.docsRoot` matches your layout.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `docsmirror.docsRoot` | `docs` | Folder that `@docs` paths are relative to. Overrides `docsmirror.config.json`. |
| `docsmirror.markers.enabled` | `true` | Collapse a resolved pointer into its marker. Needs inlay hints on; with it off, the server's plain inlay hint annotates the line instead. |
| `docsmirror.inlineDocs.enabled` | `false` | Render the section inside the comment when its marker is clicked. Needs the proposed API granted at startup. |
| `docsmirror.staleness.agingAfterDays` | `90` | Days after which a document is reported as aging. |
| `docsmirror.staleness.staleAfterDays` | `180` | Days after which a document is reported as stale. |
| `docsmirror.inlayHints.enabled` | `true` | Master switch for annotating pointer lines, marker or hint. Off means the line is left alone. |
| `docsmirror.diagnostics.enabled` | `true` | Report an unresolvable path or a missing anchor as a problem. |
| `docsmirror.trace.server` | `off` | Trace client/server communication. |

## Commands

| Command | What it does |
| --- | --- |
| `DocsMirror: Expand Documentation Here` | Opens a peek view on the pointer under the cursor, or, with the inline view on, closes the section already open there, and opens it again. Bound to <kbd>Alt</kbd>+<kbd>D</kbd>. |
| `DocsMirror: Restart Language Server` | Restarts the server, for instance after changing `docsmirror.config.json` outside the workspace. |

## Working on the extension

`npm run build` compiles and bundles; `npm run watch` rebuilds on change. Open the repository in
VS Code and run the **Run Extension** launch configuration to try your changes in a second window.

The extension and the server are bundled into `dist/` by esbuild, because a `.vsix` cannot carry
the symlinked workspace dependency that links them during development. The server is still a file
of its own and still runs as a separate process, see
[Packaging for VS Code](https://github.com/ScalarisLab/docsmirror/blob/main/docs/vscode.md#packaging-for-vs-code).

Almost nothing in this package is a language feature. `markers.ts` hides text and `peek.ts` opens a
peek, both are VS Code presentation that LSP has no notion of, and both draw entirely on what the
server resolved. Anything that has an opinion about the convention belongs in the server, where
every other editor gets it too. The shape of that split is
[Collapsed markers](https://github.com/ScalarisLab/docsmirror/blob/main/docs/vscode.md#collapsed-markers).
