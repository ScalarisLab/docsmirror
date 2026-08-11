# The web app

```bash
docsmirror serve
```

A local application for reading and writing the repository's documentation: browse it, search it,
edit it, and see how it changed over time. It reads and writes the real markdown files in the
working tree.

## Local, not hosted

This is a **dev server**, deliberately. It binds to `127.0.0.1`, it edits files in your checkout,
and it has no accounts, no database and no deployment story. Documentation lives in the repository
and is reviewed like code; a hosted editor writing to a branch behind your back would break that.

Hosting stays possible later, and the [pluggable docs root](architecture.md#pluggable-docs-root) is
what keeps the door open, but it is a separate product decision, not something this server quietly
becomes.

## The composition

**There is no application frame.** No navigation bar, no rails, no panels, no cards, no shadows, no
rounded corners, and no region of the screen lighter or darker than the page. Everything on screen
either belongs to the document's composition or does not exist.

The page is a corpus sidebar on the left, then the sheet: the document's head, its contents pinned
down the left of the prose, the prose itself, and the apparatus floated into the right margin as
figures the prose runs around. Structure is *injected where it is relevant* rather than kept
permanently open beside the text.

**The sheet is not capped.** The content takes the width it is given, and the measure comes from
the two live columns either side of it, the contents on the left and the figures on the right,
rather than from a number. That is how a page with marginalia is measured. The cost is real and
is stated in [The measure](#the-measure): where neither column happens to be occupied, a very wide
window gives a very long line.

What used to be chrome is now type:

- **The sidebar** on the left lists the whole corpus and carries the search field. It is a column
  of the page, not a frame; see [Finding your way](#finding-your-way).
- **The running head** carries where you are, what this page is, and what you can do with it, the
  breadcrumb, the agent reference, the copy controls, edit, history, settings, and the title. It
  stays in view and condenses as you read; see [The head condenses](#the-head-condenses).
- **The foot** says which document this is within its folder, offers the two either side of it, and
  links out to the corpus index, the manifest and the health view.
- **Editing** happens in place and **history** opens under the page head. Neither is a mode.

Rules that hold everywhere, because breaking one of them is what makes an interface start looking
like a template:

- **Monospace appears inside code and nowhere else**, fenced blocks and inline spans. Every path,
  anchor, `file:line`, count and date is set in the text face and told apart by weight, size,
  letter-spacing, colour and `tabular-nums`. A count is a number in a sentence, not a terminal.
- **One flat background colour per theme**, and horizontal rules only. There is no vertical rule
  anywhere in the app: regions are separated by space and by type, never by a line down the page.
- **The accent is rationed to values the pointer index produced.** If a figure is coloured, some
  code is looking at it. Nothing else in the interface may use that colour.

Type is the platform's own UI sans for prose and interface, so the app never asks the network for a
font before it can render a word, and **IBM Plex Mono** for code, SIL Open Font License 1.1,
vendored under `public/fonts`.

## The head condenses

The document's head stays in view and shrinks as the reader goes down the page. It is **not a
navigation bar and must never become one**: it spans the sheet's column and never the window, it
carries no rule, no shadow and no colour of its own, and it keeps its alignment with the prose. The
only paint it puts down is the page's own paper, so the prose passes *behind* it rather than
through it, one flat colour still, and no region lighter than the page.

- **The title shrinks continuously**, interpolated from its display size to reading size. It is
  *scaled*, not resized, and the head's own box is *translated*, not shortened: nothing in the
  condensation lays the document out again, which is what keeps it smooth on a nine-hundred-line
  page. What that costs instead is one measurement per document, and one more whenever the window
  changes width, because the title's size is set in `vw`.
- **One number drives all of it.** `--head-progress` runs from 0 to 1 and the stylesheet turns it
  into the title's scale, the counter-shift that keeps the crumb and the actions where they are,
  and the fade of the sentence around the pointer. A scroll-driven animation sets it where the
  browser supports one, off the main thread, and `head.js` sets the same property by hand where
  it does not.
- **The agent reference loses its sentence, not its pointer.** At rest the head says the whole
  instruction; condensed, only `@docs path` survives, because that is the part a reader cannot
  reconstruct and the part the copy control acts on. The clipboard payload is unchanged either way.
- **Reduced motion still pins.** It stops interpolating: the head takes its two states directly,
  with no travel between them.
- **A heading reached by anchor lands below the head.** The condensed height is measured into
  `--head-condensed` and every prose heading carries it as `scroll-margin-top`. A sticky element
  eating the anchor target is the classic defect of this pattern, and it is the one thing here that
  would make a `@docs pointer#anchor` resolve in CI and land nowhere in the browser.

## Finding your way

Four things answer orientation, and they answer different questions. The sidebar answers "what
exists"; the other three answer "where am I", "what else is in here" and "what comes next", each at
the moment it is asked rather than permanently.

- **The sidebar** is a left column listing the whole corpus: every folder, collapsible, with the
  current document marked and its ancestors already open on arrival. It is the one question the
  page itself cannot answer, without it a reader cannot see what else exists without leaving what
  they are reading.

  It is **a column of the page, not application chrome**: no fill of its own, no rule down its
  edge, no shadow. It is told apart from the reading column by space and alignment alone, and every
  standing constraint applies to it unchanged. Folders are **collapsed by default**, because a
  whole corpus listed flat is not navigation, and each row carries how many `@docs` pointers reach
  into it, the corpus's second dimension, visible before opening anything.

- **The contents is a column of the reading area**, down the left of the prose, the mirror of the
  figures floated into its right. The prose runs beside it and, at the end of the document, closes
  over it. It stays pinned while that prose scrolls past.

  `position: sticky` does not compose with `float` in any engine, so the two effects are split
  across two elements: the **shelf** floats, which is what makes the prose wrap; the **pin** inside
  it sticks, which is what keeps the contents in view. The shelf's height is measured, the prose's
  height less a tail, so the pin lets go before the document ends instead of hanging beside the
  foot. Reserving the lane can only make the prose taller, so that height is approached from below
  until it stops growing; reserving it with an enormous height and reading the result once is
  wrong, because a right-floated figure that cannot fit beside a lane that tall is dropped past the
  whole of it and the number that comes back is the size of the hole.

  The lane needs room for all three of itself, a measure and the figure margin, so below `82rem`
  the contents keeps its old place at the head of the prose. Scrolling adds a second way to reach
  it there: once that slot scrolls out of view, the contents docks against the bottom of the
  viewport instead, and lets go the moment scrolling back up returns the slot to view, so jumping
  between sections stays one tap away without the contents becoming a band the prose has to scroll
  past to be read.
- **The breadcrumb expands.** The innermost crumb is a disclosure, not a label: opening it lists
  the current folder's documents, each with its pointer count, the current one marked. It answers
  "what else is in *here*" without making the reader scan the whole sidebar.
- **The corpus index** is the same structure given a whole page, with both figures per folder, how
  many documents it holds and how many pointers reach into it, each aggregated over sub-folders so
  the two numbers count the same territory.
- **The foot of the page places you in a sequence**, "3 of 28 in `decisions/crawl`", and offers
  the previous and next document in it.

A folder's `index.md` is its landing page rather than a child of it, everywhere the structure is
shown, because that is how documentation sets are actually written.

Below the width at which the sidebar has room, it moves above the document instead, with its own
scroll, so the corpus is never more than a scroll away. Below `44rem` a screen is too short to
spare that much room before the document even starts, so the tree collapses behind a single line,
"Browse the corpus", the same disclosure a folder uses, never an icon standing in for one. It stays
open only for the page it was opened on; picking a document closes it again.

## The measure

The sheet has no maximum width, so the measure is whatever the contents lane and the figure margin
leave between them. Measured on `decisions/crawl/circuit-breaker.md`, in the real face at the real
size, taking the 90th percentile line so that the short last line of every paragraph does not
flatter the number:

| Window | Full line | Widest line on the page |
| --- | --- | --- |
| 1100 px | 92 characters | 95 |
| 1440 px | 98 characters | 137 |
| 1920 px | 122 characters | 194 |
| 2560 px | 167 characters | 275 |

Typography puts a comfortable line at 45–90 characters, so **only the narrowest of these is inside
it**. The widest line is worse than the typical one for a reason worth knowing: it is the tail,
where the contents has let go and the prose has closed over it, and there the line runs the full
width of the sheet. The same happens in any band where no figure happens to be floating.

This is recorded rather than fixed. Capping the sheet again is a product decision, not a bug fix,
and it would undo the composition the uncapped sheet was asked for.

## Contextual widgets

The apparatus is **composed into the margin**, beside the prose it belongs to. A widget is a
`float: right` figure that the prose wraps around, text flows beside it, above it and below it,
exactly like a figure in a book. A widget is never a full-width band above the text.

Two rules govern the system. Adding a widget means satisfying both; it does not mean inventing a
new mechanism.

### A widget appears because the data says so

**There are no keyword rules anywhere in this feature.** No vocabulary list, no
`if the text mentions X`, no pattern matched against prose. Every widget is triggered by a
measurable condition over the manifest, the reverse reference map, or a rate compared with the rest
of the corpus. A widget that appeared because a page "mentioned Redis" would be a guess wearing the
costume of a fact.

| Widget | Data condition that triggers it | Where it is pinned |
| --- | --- | --- |
| **A pointer here is broken** | `/api/health` reports an unresolved pointer whose `target` is this document. | Document-level; the first passage with room. |
| **Referenced from** | The manifest anchor for a section has a non-empty `referencedBy`. | That section, strictly. |
| **Also read by the same code** | Another document's incoming pointers come from at least one source file that also points here, a non-empty intersection of two reference sets. | The section whose own pointers contribute most of the overlap. |
| **Leans on** | `/api/emphasis` finds a term whose rate here is a multiple of its rate across the corpus, carried by at least three documents and at most half of them, with at least two other documents dense enough to open. | The section carrying the most occurrences. |

The last two are worth stating plainly, because they are navigation no other documentation tool
offers. **Same-code neighbours** make two pages adjacent because the same source file depends on
both, whether or not their prose shares a word. **Leans on** discovers the term rather than being
told it: the term is never named in the code, so the same implementation finds `host` in a
crawler's documentation and something else entirely in someone else's. Stop words need no list:
a word carried by every document has no lift and cannot win.

Thresholds are measured, not guessed, against a large private corpus of roughly four hundred
documents and some fifteen hundred pointers. There, requiring **two** shared source files made the
same-code widget fire on nothing at all, because a `@docs` pointer is written once per topic and
reference sets come out almost disjoint; one shared file still names a specific source file that
depends on both pages, and the widget shows which file so the reader can judge it.

The `target` field on a validation issue exists for exactly this reason: a surface that wants to
say "something is wrong with the page you are reading" needs the pointer's destination as data,
and reading it back out of the message text would make every consumer depend on the wording.

### A widget sits where it fits, measured

A float needs a run of prose at least as tall as itself to wrap around it. Against a three-line
section it would collide with the next heading and read as broken. So placement asks the layout
rather than the author:

- A **passage** is the run of blocks between one heading and the next. The lede before the first
  heading is a passage too, and is often the tallest one on a short page.
- Every passage is measured before anything is inserted, and each widget's height is measured once
its width is fixed, so its height does not depend on where it lands.
- A passage hosts a widget only if it is at least the widget's height plus clear space, and **never
  two widgets share a vertical band**.
- Widgets are seated by priority: a broken pointer outranks everything, because it is the one thing
  on the page that is actually wrong.
- **Strict** widgets (Referenced from) belong beside their own section or nowhere: floated against
  unrelated prose, a pointer count would read as a claim about the wrong text. **Soft** widgets are
  true of the whole document, so they prefer their own section and otherwise take the next passage
  with room, searching downward before wrapping.
- A **strict** widget that cannot be seated **folds inline**, in reading order, still after the
  section it belongs to. A **soft** one is simply not shown: folded, it becomes the full-width band
  across the prose this design does not allow, and what it says is contextual enrichment rather
  than something the page would be wrong without.

Below the width at which a margin exists, every widget folds inline. Crossing that width re-seats
all of them, because whether a widget can float is a question about the layout and has to be
re-asked when the layout changes.

**An empty margin beside short prose is correct.** A crushed widget is not.

## Search

A real input, always on the page, with its suggestions directly under it. It is usable with the
mouse alone; `Cmd`/`Ctrl`-`K` only moves focus to it, is never advertised, and is never the way in.
It is not a command palette and must not become one.

It **heads the sidebar**, above the corpus it searches, and stays on screen for as long as the
sidebar does. That is the one lane where a permanent control fights nothing: the right margin
belongs to the floated widgets and a sticky element cannot share a lane with floats, but the left
column is neither the reading measure nor the figure lane. Its suggestions open over the document
rather than inside the sidebar's width, so only the corpus list scrolls and the dropdown is never
clipped. A bar pinned across the top of the page would have been the application frame this design
does not have.

Suggestions are grouped, pages, then sections, then matches in the prose, and every row names the
document it lands in, so a section hit is never a heading with no home. Grouping, order and
per-group limits are configuration rather than code, because how results should be ranked changes
independently of the mechanism that fetches them. `/api/search` labels every result with the kind
of thing the query matched.

## The whole surface

Reading one page at a time is not the only question a repository gets asked.

- **The manifest view** is the [manifest](manifest.md) made browsable: every document, its derived
  summary, its section count, how many pointers reach it, its length and when it changed, grouped
  by subsystem or ordered by how referenced, how long or how recent it is, and filterable down to
  the unreferenced or the overlong. Expanding a document lists its anchors with their own summaries
  and pointer counts. It answers "what does this repository document" without opening anything.
- **The health view** is what [`docsmirror check`](cli.md#what-check-verifies) computes, on screen
  instead of only in CI: pointers that resolve to nothing, documents no pointer and no index
  reaches, documents no code points at, and documents long enough that a pointer into them lands in
  a wall of prose.

## Taking a document elsewhere

Every document, and every section of it, offers two copies.

- **The markdown**, verbatim. A section is cut at the boundaries the server computed with the same
  parser the convention itself uses, so the copy is exactly the heading and its body.
- **An agent reference**, the short instruction a person pastes into a chat with a coding agent so
  that agent knows to go and read the document. It names the target in the `@docs path#anchor`
  convention, carries the human title so the paste means something on its own, and says where
  `@docs` paths resolve from.

The document-level reference is also **said on the page**, in the head, so the pointer is readable
without going through the clipboard. The pointer is written first because it is the part that
survives the head condensing; the sentence around it is what goes.

Both confirm on the control that was pressed, and report a refusal in the same place rather than
swallowing it. Copying works over a plain LAN address as well as over loopback: `navigator.clipboard`
only exists in a secure context, so the app falls back to a selection-based copy rather than failing
silently when you read your own documentation from another machine.

Headings may be presented however the design needs, but **an anchor is computed from the heading's
source text and never from what is on screen**. Rendering inline markdown is already a display
transformation, so a slug taken from the visible text would move the moment a heading contained a
link or an image, and every `@docs pointer#anchor` naming it would resolve in CI and land nowhere
in the browser. `packages/web/test/anchors.test.js` holds that line.

## History

Git already records who changed what and when, so the app reads git rather than inventing a
versioning format inside the documents. Details of the reading itself are in
[History](history.md#reading-git-not-a-new-format).

Two views, deliberately different shapes:

- A **repository-level graph** of commits touching the docs root, branches, merges, author, date,
  drawn from the lanes `@docsmirror/history` computes.
- A **linear timeline per note**, because one file's history is almost always a straight line, and
  drawing a graph for a straight line is decoration.

Select any two revisions of a note to see the diff between them, including the uncommitted working
tree state.

When git is unavailable, no repository, no git binary, or a repository with no commits, the
history view says so plainly instead of failing. Everything else keeps working. A
[static export](#static-export) is a third case with the same shape: git ran once, at export time,
so the timeline is real, but comparing two revisions needs a live server to run against, and the
view says that plainly too instead of offering a control that would always fail.

## HTTP API

The browser front end is a client of a small JSON API, which is equally usable by anything else
running locally.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/manifest` | The [manifest](manifest.md#the-format). |
| `GET /api/health` | What [`docsmirror check`](cli.md#what-check-verifies) finds: pointer counts and every issue. |
| `GET /api/doc?path=` | One document: markdown, rendered HTML, title, date, and its section boundaries. |
| `PUT /api/doc` | Write a document back to disk. |
| `GET /api/search?q=` | Ranked matches with excerpts. |
| `GET /api/emphasis?path=` | The term this document leans on hardest against the corpus, and where else it is dense. Answers `null` when no term stands out. |
| `GET /api/history/graph` | The repository graph, scoped to the docs root. |
| `GET /api/history/file?path=` | One note's revisions. |
| `GET /api/history/diff?path=&from=&to=` | The diff between two revisions. |
| `GET /asset?path=` | An image a document embeds, read from the docs root. |

History endpoints answer `{ "available": false }` rather than failing when git cannot be read.

The corpus term index behind `/api/emphasis` costs one pass over every document, so it is built
lazily on first use and discarded whenever a write invalidates the manifest. The search index
behaves the same way, built lazily on the first query, invalidated by a write, and both read the
corpus through one shared per-document cache, so the files are read once, not twice.

## Static export

```bash
docsmirror export
```

[Local, not hosted](#local-not-hosted) says why `serve` stays a dev server: it writes to your
working tree, and a hosted editor writing to a branch behind your back would break the review model
documentation is supposed to live under. None of that is true of *reading*. A repository's own
documentation, published read-only wherever the repository already is, GitHub Pages, is a different
product decision with none of that risk, so `export` is a second front door onto the same app rather
than a second app: the identical `public/` front end, reading from files written once at export time
instead of asking a server for them on every request.

**What is included.** Every document, the manifest, the health report, the emphasis widget, the
repository graph, and every note's timeline, walking every asset a document embeds, are all read
once and written into the export as JSON and copied files. Search runs the exact function
`/api/search` runs: `esbuild.js` bundles `search.ts` for the browser, because that algorithm has no
dependency on Node or on a live project, given a corpus and a query it is pure, so the same bundle
answers a query in `serve` and in a static export without two implementations to keep in sync.

**What is not.** Two things need a live server and stay out of the export on purpose rather than
being faked: **writing**, the Edit control does not appear, because there is nothing on the other
end of a save; and **comparing two arbitrary revisions**, because the picker lets a reader choose
any pair from up to two hundred, including the uncommitted working tree, and baking in every
possible pair is not a real option. The timeline itself is real, read once at export time, the
history view just says plainly that the diff needs `docsmirror serve` instead of offering a control
that would always fail.

**Hosting it.** The output is plain files: any static host serves it. For GitHub Pages specifically,
export in a workflow, then hand the result to `actions/upload-pages-artifact` and
`actions/deploy-pages`:

```yaml
- run: node packages/cli/bin/docsmirror.js export --out docs-site
- uses: actions/upload-pages-artifact@v3
  with:
    path: docs-site
- uses: actions/deploy-pages@v4
```

`.github/workflows/pages.yml` in this repository is exactly that, exporting this repository's own
documentation on every push to `main`.

## Writing safely

The server writes files, so it is strict about which:

- Every request path is resolved through the docs root and rejected if it lands outside it:
  absolute paths, `..` traversal and null bytes never reach the filesystem.
- Only markdown extensions may be read or written through `/api/doc`; images a document embeds go
  through `/asset` with its own allowlist.
- Request bodies are size-capped. An oversized body is answered with `413` and discarded, rather
  than having its connection cut before the client can read the refusal.
- Binding to loopback is not on its own enough, because a page in the same browser can still address
  the port. On the default loopback bind, requests are accepted only when the `Host` header names
  loopback, and a request carrying a non-loopback `Origin` is refused, so another site cannot drive
  the editor. Binding another interface with `--host` is an explicit opt-in to being addressed by
  that interface's name, so the `Host` pin steps aside there; a request that carries an `Origin`
  must still match the address the reader used, so a browser request can only come from the page
  this server served.
- Markdown is rendered with raw embedded HTML escaped rather than passed through, since the app
  renders whatever happens to be in the working tree. Link and image targets become live URLs only
  on an allowlisted scheme, `http:`, `https:`, `mailto:`, protocol- and site-relative, so a
  crafted `javascript:` or `data:` target renders inert instead of clickable.
- After a write, the docs root cache is invalidated and the manifest rebuilt, so what the interface
  shows is what is on disk.
