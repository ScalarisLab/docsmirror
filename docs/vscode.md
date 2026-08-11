# The VS Code client

Almost nothing in `docsmirror-vscode` is a language feature. Hover, go-to-definition, document
links, inlay hints and diagnostics all live in the [language server](server.md), where every
LSP-speaking editor gets them. What this package owns is presentation LSP has no notion of: the
collapsed marker drawn over the pointer, and the documentation it expands into, a peek view
everywhere, the section rendered inside the comment where the editor allows it. Everything the
client draws comes from the server through the [custom requests](server.md#custom-requests);
anything with an opinion about the convention belongs on the other side of that line.

## Collapsed markers

A pointer is machine text: `@docs decisions/caching.md#why-a-write-through-cache` is precise and
unreadable, and it sits in the middle of prose a human is trying to read. So the client collapses
it, the `path#anchor` half is hidden and the section's title is written in its place, leaving
`* @docs Why a write-through cache ▾`.

The `@docs` keyword deliberately survives the collapse. It says the line is a pointer rather than a
comment somebody styled oddly, and it keeps a visible span for the document link to sit on, so
ctrl-click still works on a line whose target is hidden.

The hiding is a **client** concern: it is a text decoration, which LSP has no notion of, and only
the editor knows where its cursor is. Everything the label says comes from the server through
[`docsmirror/pointers`](server.md#the-pointers-request), because the title is an answer about the
convention.

Three properties make the collapse safe to leave on:

- **The file is never rewritten.** The pointer on disk is the source of truth that the CLI, CI and
  every other editor read. Prettifying it in the buffer would be a different, worse tool.
- **Only a resolved pointer collapses.** A pointer whose document or anchor is missing has no title
  to show, so it keeps its raw text and is marked, in red, as unresolved, beside the warning it
  already produced. A marker that looked fine while pointing nowhere would be worse than no marker.
- **The caret inside the pointer uncollapses it**, so the pointer is always there to be edited. The
  client redraws that from its own cache rather than asking again, because a reveal that arrives
  after the caret reads as a stutter. It stays collapsed while its section is open below it: a
  reader who just clicked a line closed does not want it to answer with the raw path.

### What the label says, and what it leaves out

The title and a chevron. Nothing else.

That is a deliberate subtraction. The line used to carry a reference count and a staleness word too,
and an earlier version wrote the date and `Fresh` on every line, a wall of identical grey text
nobody read, long enough that VS Code truncated it mid-word. A badge that is always there carries no
information, and the line is now a **control**: it says what the section is called and which way it
will move when clicked. The date and the full freshness line still exist in the hover, where there
is room for them.

### Expanding one

The marker is the collapsed half of an accordion, and the other half opens in the best form the
editor allows: [inline](#inline-documentation) when that is switched on and granted, otherwise the
**peek view**, the target section, at its heading, in an embedded editor between two lines of code,
dismissed with Escape. Everyone gets an expansion; some get a better one.

`Alt+D` works either half from the keyboard, and so does clicking `@docs` itself, the comment prefix
and indentation before it, or the background past the end of the line, all real text or real, empty
space, which is what a click needs to land on to report a position at all. The label reading the
section's title is neither: it is a decoration's own painted content, drawn over characters hidden by
`display: none` to make room for it, and a decoration is painted pixels, not a control, clicking
precisely on it lands on nothing the editor's click hit-testing knows how to answer. Rendering the
label as a genuinely clickable inlay hint instead was tried; it only renders at all when the editor's
own `editor.inlayHints.enabled` setting allows it, and a label that is sometimes not there at all is a
worse trade than one that is always there and is opened next to, not on.

Worth knowing about the click on `@docs` itself:

- Opening or closing **parks the caret at column 0** of that line. Clicking the same character twice
  changes no selection and the editor reports nothing, so without the park a second click on `@docs`
  could not close what the first one had just opened.
- A pointer you came to edit rather than open is reached by keyboard, arrowing or Home/End onto it
  reveals the raw text without triggering a click.
- The click contract belongs to the accordion: with `docsmirror.markers.enabled` off there is no
  chevron inviting a click, and clicking a pointer line simply places the caret, the way it does in
  any other text. `Alt+D` still opens the expansion from the keyboard.

Once a section is open, hovering the same line no longer shows the hover tooltip. The prose is
already sitting in the comment; a tooltip repeating it would be the same paragraph shown twice,
once where the reader put it and once floating over it. The client tracks which lines are
expanded and tells the hover request to stand down for exactly those, through the language client's
own hover middleware, the server itself is not asked and does not need to know, since expansion is
purely client-side state.

## Inline documentation

The section's prose rendered **inside the comment**, in the text flow, pushing the code down.
Reading the code and reading why it is that way become the same act, which is the whole point of
putting a pointer in the code in the first place.

### Asked for, and instant

A section opens because the reader [clicked its marker](#expanding-one), and only then. Nothing
opens by itself: a screenful of documentation nobody asked for is a screenful of code nobody can
see, and the reader is the one who knows which of the two they came for.

What *is* done ahead of time is the half that costs nothing. Every resolved pointer in the document
has its section fetched through [`docsmirror/section`](server.md#the-section-request), rendered and
cached before anyone asks, a string and a number each, so the marker carries its real title from
the first paint and opening one is a single step with the content already in hand. Nothing pops in
when the reader lands on it, because by then it is already there. A webview, which costs a renderer
process, is created at the moment a section is opened and at no other.

An open section survives scrolling and survives edits above it, which move its line with the text;
it closes when the reader clicks it again, when `Alt+D` is pressed on its line, or when an edit
rewrites the line it was pinned to.

### Why it is a setting, and off by default

There is exactly one way to put arbitrary rendered content inline in a VS Code editor:
`window.createWebviewTextEditorInset`, which is a **proposed** API. Proposed APIs are real, but VS
Code only hands one to an extension that declares it in `enabledApiProposals` *and* was granted it
at startup, and it refuses to publish such an extension to the Marketplace.

So the feature asks to be turned on, the extension checks at runtime that the function is actually
there, and everything falls back to the peek view when it is not. Nothing is ever written into the
source file to fake the effect: duplicating documentation into code is the exact thing this tool
exists to stop. The feature was verified working on VS Code 1.131.

The content is rendered with `marked`, the same renderer `@docsmirror/web` uses for the same
convention, with the same raw-HTML-is-escaped rule, since this webview runs with scripts enabled and
a project's own docs are not something to trust with that. An earlier version asked the editor's own
markdown extension to do this, through an internal command (`markdown.api.render`) with no
guarantee of being there; when it was not, prose rendered as its own unrendered markdown instead of
failing loudly. A bundled renderer is a few dozen kilobytes; a hover-looking sentence that shows its
brackets is a defect nobody reports as one.

An inset is pinned to a line number and cannot be moved, so an edit that changes the *number* of
lines closes the sections below it. Typing inside a line moves nothing and closes nothing, which is
almost all typing.

### What the webview is allowed

The page needs scripts, it measures its own height, so everything else is locked down around
that. A Content-Security-Policy loads nothing by default; the one inline script runs on a nonce
minted per page; images load only from the webview's own resource scheme, `https:` and `data:`.
Link targets are allowlisted at render time: `http(s)`, `mailto` and in-document anchors keep their
link, and anything else, `javascript:` above all, which `marked` passes through untouched, keeps
its words and loses its href, the same treatment `@docsmirror/web` gives a target it will not open.

Images the server absolutized to `file:` URIs are rewritten through `asWebviewUri` when the widget
is built, with the workspace folders as the resource roots, because a webview refuses `file:`
outright, the hover renders those URIs natively, the inset has to be handed them in its own scheme.

### Standing still

An inset cannot be resized and cannot be moved, so every correction is a new webview and every new
webview is a flinch the reader sees. Four rules make the widget hold still, and each of them exists
because its absence was visible:

- **The height is known before the inset is created.** It is measured once, then remembered
  **between sessions**, keyed by the section, a digest of its rendered content, the editor's row
  height, the pointer's column and the width prose wrapped at, since a height is only true for the
  layout it was measured in. A section never seen under those conditions is *estimated* from its
  markdown, wrapped at the width the last widget reported. So the code below a section settles once,
  where it will stay, and the create-measure-recreate dance is gone from every opening but the
  first-ever one of a given section. A stale entry, content that changed since it was measured,
  simply never matches its digest again and ages out of the bounded memory on its own.
- **A widget is never shown before it is right.** The page paints on the editor's background,
  invisible, reports its laid-out height, and is revealed only once that height has been accepted.
  When the estimate missed, the replacement happens behind a surface that never showed the wrong
  thing, no flash of a webview's own empty frame, no re-flow anybody watches. A miss of one row is
  accepted rather than corrected: a row of editor background costs nothing, a rebuild costs a flinch.
- **Hysteresis at the edge of the viewport.** A widget is built while its line is within 20 rows of
  the screen and released only past 80, so a scroll that rocks around a boundary, or a line sitting
  exactly on the edge, never oscillates between having a webview and not. What the collapsed marker
  is told is which sections are *open*, not which are mounted, so the pointer line itself never
  flickers back as the widget behind it comes and goes.
- **One widget per view, not per document.** The same file open in two columns gets a webview in
  each, keyed by the column. Sharing one meant the two editors fought over it on every scroll.

One thing is **not** animated, and saying so is more useful than claiming otherwise. An inset is
created at a fixed height, so the rows it occupies appear in a single step: the code below moves
down at once, the way it does when a folded region is unfolded. What the widget animates is its own
content easing into the room the editor just made, a 120 ms fade and a short rise, which is what
makes an open read as a movement rather than a jolt. Growing the reserved rows smoothly would mean
destroying and recreating the inset once per frame, which is the flicker this design exists to
remove.

### Wearing the editor's typography

The widget takes `editor.fontFamily`, `editor.fontSize`, `editor.fontWeight` and `editor.lineHeight`
from the workspace configuration, reproducing VS Code's own reading of `lineHeight`, which is a
multiplier below 8, pixels above it, and 1.5× the font size at 0, and its colours from the theme's
CSS variables, so it repaints itself when the theme changes and is rebuilt when the typography does.

Prose is set in the UI font, on the editor's row height, at the editor's font size. Code inside it,
inline spans and fenced blocks alike, is set in the **editor's own font at the editor's own size**,
so an embedded snippet lines up with the code around it instead of reading as a quotation from
somewhere else. And the whole widget indents itself to the column the `@docs` keyword starts at,
measuring the editor font in the page to convert that column into pixels, so the prose begins where
the comment begins rather than at the window's edge.

The right edge needs the same care for a less obvious reason: an inset is as wide as the **whole**
editor, and the minimap and the scrollbar are painted over it. Prose left to run the full width
simply disappeared under the minimap, mid-sentence. The widget therefore reserves what
`editor.minimap` and `editor.scrollbar.verticalScrollbarSize` say those can take. The minimap's real
width is not published to extensions, so the reservation is its widest possible value: too much
leaves editor background at the end of a line, too little hides words, and only one of those is a
defect.

### What it costs, measured

An inset is a webview, and VS Code gives each one its own renderer process.

**These numbers are a ceiling this design no longer reaches**, and they are kept because a ceiling
is worth knowing. They were measured when every pointer on screen opened by itself, so the worst
case was scrolling a pointer-dense file from top to bottom, a webview built for every marker that
crossed the viewport. Sections are opened by hand now: what the reader has not clicked costs a
cached string and nothing else, and the numbers below are what the same file did when it was
building thirty-odd of them unasked.

Measured on VS Code 1.131 against an 890-line file carrying 27 pointers, in a VS Code launched with
its own user-data and extensions directory so nothing else was installed. The same run was done
twice, once with `inlineDocs.enabled` off (collapsed markers only) and once on; the off run is the
control. Latency here is the extension host's round trip, an edit until the editor acknowledges
it, a scroll until the editor reports its new viewport, **not** renderer paint, which this
instrument cannot see.

| | typing | pressing Enter | scrolling |
|---|---|---|---|
| collapsed markers only | 5.0 ms (p95 12.2) | 6.3 ms | 2.5 ms |
| sections open by themselves | 4.3 ms (p95 12.7) | 5.9 ms | 2.6 ms |
| full screen, markers only | 4.5 ms | 7.0 ms | 3.9 ms |
| full screen, sections open | 3.2 ms | 5.4 ms | 1.8 ms |

**Latency does not move.** It is the same feature that makes it so: an edit inside a line moves no
inset, so nothing is torn down and nothing is rebuilt while a line is being typed, and scrolling
only schedules work rather than doing it.

The cost that is real is **processes, and they are transient**:

| | processes | window memory |
|---|---|---|
| markers only, throughout | 11, flat | 1.5–2.4 GB |
| sections open, sitting still | 14 | 2.5 GB |
| sections open, mid-sweep of the whole file | peaks at 33 | 1.0–2.3 GB |
| thirty seconds after the sweep | back to 12 | 0.8 GB |

A full sweep of the file creates and destroys webviews faster than Chromium reclaims the processes,
so the count climbs to about three times the baseline while the scrolling lasts, and then comes
back down on its own. **Memory does not follow it**: the peak with sections open, 2.5 GB, is the
peak without them, 2.4 GB. That is the difference the viewport rule makes. The same file read by
opening and closing sections by hand, before the viewport bounded anything, took the window from 14
processes and 2.8 GB to 40 and 6.1 GB and held it there for minutes.

Three changes since have moved that ceiling down, and none of them can move it up. Sections open
**only when clicked**, so a scroll through a file now builds nothing at all. A section's measured
height is remembered [between sessions](#standing-still), so an opening costs one webview instead of
the two a first open used to need. And the viewport gained its [hysteresis](#standing-still): the
widgets a scroll used to build and destroy at the edge of the screen are no longer built.

What is spent unconditionally is the prefetch, one `docsmirror/section` round trip and one markdown
render per distinct section in the open document, both of which produce a string. No webview, no
process, no paint.

What it does cost is **room**. A long section is a long section: one of the sections in that file
renders 25 rows tall, which is most of a normal window. `MAX_HEIGHT` caps an inset at 32 rows:
an inset cannot resize itself past that, VS Code gives it a fixed height once and never again, but
the prose inside it can still scroll to its real end, so a section longer than the cap is reachable
in full rather than fading into a bottom nobody can get to. The marker closes it again in one click,
wherever the reader has scrolled to.

## Packaging for VS Code

A `.vsix` is a flat archive with no install step: whatever the extension needs at runtime has to be
inside it. In this repository the client reaches the server through a workspace link, and a link is
exactly what an archive cannot carry, so `npm run package` in `packages/vscode` bundles both with
esbuild, `src/extension.ts` into `dist/extension.js` and the server's launcher into
`dist/server.js`, with `vscode` left external because the editor supplies it.

Bundling changes how the code ships, never where it runs. The client still points
`TransportKind.ipc` at `dist/server.js`, so the server is still spawned as its own Node process and
still crashes, restarts and traces independently of the extension host. Collapsing it into the
extension would make the VS Code client the only place features exist, which is the arrangement
this package exists to avoid.

TypeScript compiles to `out/` for type checking and declarations only; nothing there is shipped.

## Client-only settings

Most `docsmirror.*` settings are forwarded to the server and documented with it, see
[Settings](server.md#settings). Three never leave the client:

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| `docsmirror.markers.enabled` | boolean | `true` | Collapse resolved pointers into markers. With it off, the server's plain inlay hint annotates the line instead. Requires `docsmirror.inlayHints.enabled`. |
| `docsmirror.inlineDocs.enabled` | boolean | `false` | Render sections inside the comment. Needs the proposed API granted at startup. |
| `docsmirror.trace.server` | string | `off` | Trace the LSP traffic in the output channel. |
