# The manifest

An agent that wants to know what a codebase documents has, today, exactly one option: read the docs
folder. All of it. That is the same disease the `@docs` convention cures one level up: the reader
pays for everything to find the one thing that mattered.

The manifest is the cure. It is a generated, machine-readable description of the entire
documentation surface: what documents exist, what each one covers, what sections they contain, and
which code points at them. An agent fetches it first, and comes back with one path to open instead
of forty.

Publishing a description of a surface is what lets a caller stop guessing at it.
`docsmirror.json` is that description, for documentation.

## The format

A single JSON file at the project root, beside `docsmirror.config.json`.

```json
{
  "docsmirror": "1.0",
  "generatedAt": "2026-08-04T09:12:44.183Z",
  "docsRoot": "docs",
  "nodes": [
    {
      "path": "decisions/retry-policy.md",
      "title": "Retry policy",
      "summary": "When an operation may be retried, and what makes that safe.",
      "anchors": [
        {
          "slug": "idempotency",
          "title": "Idempotency",
          "level": 2,
          "summary": "Retries are safe when the endpoint is idempotent by design.",
          "referencedBy": [
            { "file": "src/http/retry.ts", "line": 42, "symbol": "retry", "anchor": "idempotency" }
          ]
        }
      ],
      "referencedBy": [
        { "file": "src/http/retry.ts", "line": 42, "symbol": "retry", "anchor": "idempotency" }
      ],
      "links": ["architecture.md"],
      "lastModified": "2026-07-14",
      "staleness": "fresh",
      "words": 512
    }
  ],
  "stats": {
    "documents": 8,
    "anchors": 31,
    "references": 30,
    "orphans": 0,
    "referencedDocuments": 7
  }
}
```

`docsmirror` is the version of the **format**, not of the tooling, so a consumer can tell whether it
understands the file it just fetched.

The map is **bidirectional**, and that is the part that does not exist anywhere else. A pointer in
the source says "this code is explained there". The manifest inverts it: every document knows which
code depends on it, down to the file, the line and, when it can be recognised, the symbol. That is
what lets an agent ask "what breaks if I rewrite this decision" and get an answer.

## Summaries

A summary field that humans maintain by hand is a field that goes stale, so summaries are derived.

For a document, the summary is its opening prose, the first real sentence, skipping headings,
lists, tables and code. For an anchor, it is the first sentence of that section's body. A document
may override its own summary with `summary:` or `description:` in YAML front matter, because that
lives with the prose and is reviewed alongside it; nothing else is ever hand-written into the map.

The consequence is worth stating plainly: **the manifest is only as good as your first sentences.**
A document that opens with "This document describes some things about the system" will say exactly
that to every agent that reads the index. Opening with the point is now a machine-readable act.

## Code references

Every entry in `referencedBy` comes from a real `@docs` pointer that resolved. The `file` and `line`
are exact. The `symbol` is a **heuristic**, and is documented as one: DocsMirror scans comments, not
an abstract syntax tree, so it reads the first line of code after the comment block and recognises
the shape of a declaration, `class`, `function`, `def`, `const`, a method signature. When it cannot
place a name confidently it emits nothing rather than a guess, because a wrong symbol is worse than
an absent one, and the file and line always locate the site anyway.

A pointer to a document that does not exist contributes nothing to the manifest; it is a broken
pointer, and [`docsmirror check`](cli.md#what-check-verifies) is what reports it.

## Keeping it current

The manifest is generated and never hand-edited. Regenerate it with:

```bash
docsmirror manifest
```

`docsmirror check` regenerates it in memory and compares it to the file on disk, failing when the
two have diverged, the same guarantee a formatter's `--check` mode gives. That is what stops the
map from drifting: a document renamed, a heading changed or a pointer moved fails CI until the
manifest is regenerated and committed alongside the change.

Everything the clock and the filesystem contribute is excluded from that comparison: `generatedAt`,
and each node's `lastModified` and `staleness`. None of it is authored content, and all of it moves
on its own, git does not preserve file modification times, so a fresh clone would instantly
disagree with the committed manifest, and staleness shifts with the calendar even when no document
changed. A comparison that failed on every clone and every quiet week would teach everyone to
ignore it.

Committing `docsmirror.json` is recommended but not required: every consumer, the
[MCP server](mcp.md), the [web app](web.md), the CLI, can build it from the filesystem on demand.
Committing it means an agent or a reviewer can read the map without running anything at all.
