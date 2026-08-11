# Working with AI agents

The convention exists partly because of them. A long explanatory comment is read by every agent
that opens the file, whether or not the explanation matters to the task: it fills the context
window with prose nobody asked for. A pointer costs one line, and the agent fetches the document
only when the reasoning is actually relevant.

That only works if the agent understands the pointer. [`skill/docsmirror.md`](../skill/docsmirror.md)
in this repository is a portable instruction file written for exactly that: agents will resolve
pointers against the docs root, fetch the right section, and, the part that compounds, put their
own long explanations in the documentation and leave a pointer behind instead.

Where the file goes depends on whether the tool has its own skill system:

- **Claude Code**: `.claude/skills/docsmirror/SKILL.md`, unchanged, frontmatter and all; it is
  already a valid skill and Claude Code discovers it on its own.
- **Everything else** (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or a raw system prompt): append the
  body below the frontmatter. These tools have no skill loader, so the instructions have to sit
  where the agent already reads them.

Three behaviours it establishes, worth stating here because they are what make the convention
survive contact with automation:

- **Resolve, do not guess.** The path is docs-root-relative, so an agent must read
  `docsmirror.config.json` once rather than treating the path as relative to the source file.
- **Fetch on relevance.** Read the pointed-to section when the task touches that decision; do not
  preload the documentation tree, which would rebuild the problem the convention removes.
- **Write documentation, not comments.** When an explanation needs more than a few lines, it goes
  in the docs root under a heading, and the source gets a one-line claim plus a pointer.

The language server helps here too: an agent working in an editor session sees the same diagnostics
a human does, so a pointer it breaks is reported immediately rather than at review time.
