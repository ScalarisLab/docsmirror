# `@docsmirror/mcp`

A Model Context Protocol server that gives a coding agent the same documentation map
`docsmirror check` validates against: what exists, what it covers, and which code depends on it,
without the agent reading the whole `docs/` folder and hoping.

## Install

Most clients spawn it directly and never need it installed as a project dependency:

```bash
npx --package @docsmirror/mcp docsmirror-mcp
```

It speaks stdio and takes an optional project root argument, defaulting to the current working
directory, which is how MCP clients normally launch it.

## Usage

Point your MCP client at the command, for example in a client's server configuration:

```json
{
  "mcpServers": {
    "docsmirror": {
      "command": "npx",
      "args": ["--package", "@docsmirror/mcp", "docsmirror-mcp"]
    }
  }
}
```

Five tools are exposed, `list_documentation`, `search_documentation`, `read_documentation`,
`find_references`, and `get_manifest`, plus every document as an MCP resource at
`docs://<path>`. The map is built from the live filesystem on the first tool call and rebuilt when
documentation changes, so an agent is never handed a stale index. The server does not write:
editing documentation stays a human decision, made through
[`@docsmirror/web`](https://github.com/ScalarisLab/docsmirror/tree/main/packages/web).

## Learn more

Full tool reference and design rationale:
[github.com/ScalarisLab/docsmirror](https://github.com/ScalarisLab/docsmirror), in particular
[docs/mcp.md](https://github.com/ScalarisLab/docsmirror/blob/main/docs/mcp.md).
