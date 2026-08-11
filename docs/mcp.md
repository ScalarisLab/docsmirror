# The MCP server

The [manifest](manifest.md) is what an agent needs; MCP is how it actually gets it. The language
server serves a human's editor, the MCP server serves a coding agent, and both read the same
`@scalarislab/docsmirror-core`, so the map an agent sees is the map CI validates.

```bash
npx --package @scalarislab/docsmirror-mcp docsmirror-mcp
```

It speaks stdio and takes an optional project root, defaulting to the working directory.

## Why an agent needs this

Without a map, an agent looking for a decision has two bad options: read the whole docs folder, or
guess a filename. The first burns the context window the `@docs` convention exists to protect; the
second silently misses things.

With the manifest, the sequence becomes: list what exists, pick the one document that matches, read
that section. Same answer, a fraction of the tokens, and no guessing.

## Tools

| Tool | What it answers |
| --- | --- |
| `list_documentation` | "What is documented here?" Every document with its title, summary and anchors, compact on purpose, this is the call an agent makes first. |
| `search_documentation` | "Where is X explained?" Ranked matches across titles, summaries, anchor headings and body text, each with an excerpt. |
| `read_documentation` | "Show me that." The markdown of one document, or of one section when an anchor is given. |
| `find_references` | "What depends on this?" The code sites pointing at a document or a section, file, line, and the symbol when it can be named. |
| `get_manifest` | The whole manifest, for an agent that would rather hold the map itself. |

`search_documentation` is honest lexical search: a hit in a title or an anchor outranks a hit in
the body, and a whole word outranks a substring. It does not embed anything and does not pretend to
be semantic, an agent that knows it is reading a keyword index uses it correctly.

## Resources

Every document is also exposed as an MCP resource at `docs://<path>`, with the document's title as
its name and its derived summary as its description. Clients that browse resources rather than call
tools get the same surface without a special case.

## Freshness

The server builds the manifest from the live filesystem on the first tool call, it does not
require a committed `docsmirror.json`, and rebuilds it when a documentation file changes on disk. An agent
is never handed a map that describes documentation that has since moved.

## What it deliberately does not do

It does not write. Editing documentation from an agent session is the [web app](web.md)'s job and a
human's decision; an MCP server that could rewrite the documentation it also describes is a loop
nobody asked for.
