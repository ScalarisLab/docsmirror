# Security

## Reporting a vulnerability

Report vulnerabilities privately through
[GitHub security advisories](https://github.com/ScalarisLab/docsmirror/security/advisories/new)
rather than in a public issue, so a fix can ship before the details do.

## What is in scope

The surfaces worth probing, in order of blast radius:

- **`docsmirror serve`**, a local HTTP server that **writes to the files in your working tree**.
  It binds to loopback by default, pins the `Host` header against DNS rebinding, and refuses
  cross-origin browser requests; anything that bypasses those protections, escapes the docs root
  on read or write, or executes script from rendered markdown is a vulnerability.
- **The VS Code extension**, which renders repository markdown in webviews. Content that escapes
  the rendering sandbox or executes in the extension host is a vulnerability.
- **`check` / `manifest` / the language server / the MCP server**, read-only over your project,
  but they parse untrusted file content; crashes are bugs, code execution is a vulnerability.

DocsMirror renders whatever markdown happens to be in the working tree, including a branch you
just checked out from a stranger, so "the input was attacker-controlled" is always assumed, never
a mitigation.
