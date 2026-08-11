# The convention

A long explanatory comment is expensive: every reader, human or machine, pays for prose they may
not need, and the prose drifts away from the truth because nothing checks it. DocsMirror moves the
explanation into markdown and leaves a pointer behind. The information does not disappear, it
moves somewhere it can be reviewed, linked, and validated.

## The pointer

```
@docs <path>#<anchor>
```

- `<path>` is relative to the project's **docs root** (`docs/` by default). It is never relative to
  the file carrying the pointer, and never a markdown link. Source files move between directories;
  a root-relative path survives that. It is also what allows the root to become something other
  than a folder, see [Architecture](architecture.md#pluggable-docs-root).
- `<anchor>` is optional. A bare `@docs architecture.md` targets the whole document.
- The extension may be omitted: `@docs decisions/retry-policy` resolves to
  `decisions/retry-policy.md`.

A pointer **occupies its own comment line**. It may be preceded only by the comment marker and the
decoration a block comment adds to its continuation lines, so `* @docs guide.md` and
`<!-- @docs guide.md -->` are pointers while `See the @docs guide.md for details` is prose. That
rule is what lets a comment talk *about* the convention, as the comments in this project do,
without every mention becoming a broken pointer.

`@docs` is not a JSDoc, TSDoc or Doxygen tag, and is not read as one by anything that understands
those, it is a marker this project owns, matched only when followed by whitespace or the end of
the line, so `@scalarislab/docsmirror-core` a few words later never trips it. It sits comfortably beside real
`@param`/`@returns` tags in the same block comment for exactly that reason.

A pointer is written inside a comment, in any language:

```ts
/**
 * Retries are safe here: the endpoint is idempotent by design.
 * @docs decisions/retry-policy.md#idempotency
 */
```

```python
# @docs decisions/retry-policy.md#idempotency
```

```sql
-- @docs schema/accounts.md
```

These forms are rejected, and reported as errors:

| Written | Why it is rejected |
| --- | --- |
| `@docs` | No path. |
| `@docs [retry](decisions/retry-policy.md)` | A markdown link, not a path. |
| `@docs ../secrets.md` | Escapes the docs root. |
| `@docs /etc/passwd` | Absolute path. |

## Anchors

An anchor is a GitHub-style heading slug. The rule, in order:

1. lowercase;
2. remove every character that is not a letter, a decimal digit, `_`, `-`, or whitespace;
3. trim;
4. replace **each** whitespace character with `-`.

`## Same-day settlement` becomes `#same-day-settlement`, and `` ## The `retry` budget `` becomes
`#the-retry-budget`. Repeated headings in one document get GitHub's numeric suffixes: the second
`## Idempotency` is `#idempotency-1`.

Every step of that rule has been got wrong in the wild, so each one is worth stating plainly:

| Heading | Anchor | The trap |
| --- | --- | --- |
| `PROCESS_DEATH_WINDOW_MS` | `#process_death_window_ms` | **Underscores survive.** Treating `_` as an emphasis marker mangles exactly what documentation names most: constants, enum values, columns. |
| `mentions légales` | `#mentions-légales` | **Letters means any script.** A `\w`-based character class silently deletes `é`. |
| `Rule 2, the write path` | `#rule-2--the-write-path` | **Runs of whitespace are never collapsed.** The em dash disappears at step 2 and leaves two spaces, so the anchor has two hyphens. |
| `Sitemap <lastmod> as evidence` | `#sitemap-lastmod-as-evidence` | **Angle brackets are punctuation, not markup.** Stripping `<lastmod>` as an HTML tag deletes the word the heading is about. |
| `How a surface in m² is recognised` | `#how-a-surface-in-m-is-recognised` | **A digit means a decimal digit.** `²` is a number to Unicode but not a digit, and GitHub drops it. |

`slugify` in `@scalarislab/docsmirror-core` is the single implementation of this rule; every surface, the CLI,
the language server, the MCP server, the manifest, calls it rather than rolling its own. The rule
is pinned by a table-driven test whose rows are the failures above, because a checker that reports
a correct pointer as broken is worse than no checker at all.

Anchor matching is case-insensitive, so `#Idempotency` and `#idempotency` are the same pointer.

A section is the heading **and everything under it**, subsections included, up to the next heading
of the same or higher level. Pointing at `## Idempotency` gives you its `### Exception` too.

## Comment scanning

DocsMirror does not parse an abstract syntax tree. A pointer must work in any file of any language,
including ones no parser here has ever seen, so the scanner is line-oriented: it tracks
block-comment state and recognises a set of comment markers.

- Line markers: `//`, `--`, `#`, `;`, `%`
- Block delimiters: `/* */`, `<!-- -->`, `""" """`, `''' '''`, `(* *)`, `{- -}`, `=begin =end`

Consecutive comment lines form one comment block, which is what an editor folds or decorates.

The deliberate limitation: string literals are not modelled, so a comment marker inside a string
opens a comment as far as the scanner is concerned. In exchange, the convention works in languages
DocsMirror knows nothing about. In practice the own-line rule absorbs almost all of the cost, a
pointer has to be the first thing on its comment line, which prose and embedded strings virtually
never are. Text outside a comment is never treated as a pointer, so `const s = "@docs guide.md"` is
ignored. The one case that escapes the rule: an unclosed block-comment opener inside a string:
`const s = "a /* b";`, leaves the scanner believing the rest of the file is one long comment, so
pointer-shaped text below it would be reported. Exclude such a file, or close the sequence inside
the string.

Markdown files are excluded from source scanning by default, every `#` heading would read as a
comment, and documented examples would be mistaken for real pointers.

## Dated content

A section can say more than one thing was true at different times, without turning into git
archaeology. A marker of the same shape as a pointer's own rule, alone on its own line, starts a
dated block that runs to the next marker or the end of the section:

```
<!-- @as-of 2026-01-15 -->
```

It lives inside the documentation itself, not in the pointer that targets it, and it is opt-in: most
sections never need it, and the ones that do usually only need it once, the day something changes
enough to be worth dating rather than silently rewritten over.

Every surface that renders a section's prose, the editor hover, the inline view, the local web
app's reader, turns each marker into a visible label, `**As of 2026-01-15**`, set off from what
came before it by a rule, through the same function in `@scalarislab/docsmirror-core`. A document with no marker
is unaffected. Viewed anywhere else, GitHub, a teammate's editor without DocsMirror, any plain
markdown renderer, the marker is what it already is, an HTML comment, which is to say nothing at
all: the convention degrades to invisible rather than to broken.

A date that does not parse as a real calendar day (`<!-- @as-of 2026-02-30 -->`, February has no
30th) is left as ordinary text instead of silently swallowing whatever follows it, the same
instinct that makes an unresolved `@docs` pointer say so instead of pointing nowhere quietly.
