# `@scalarislab/docsmirror-server`

The DocsMirror language server: hover, inlay hints, diagnostics, go-to-definition and document
links for `@docs` pointers, in one process spoken to over LSP. Every editor that speaks the
protocol gets the same five features from the same server, VS Code, JetBrains IDEs, Neovim, Zed,
Helix, Emacs, instead of one reimplementation per client.

Everything it knows about the convention comes from [`@scalarislab/docsmirror-core`](https://github.com/ScalarisLab/docsmirror/tree/main/packages/core),
which is why a pointer that fails `docsmirror check` in CI fails in the editor with the identical
message.

## Install

Most editor clients spawn it directly and never need it installed as a project dependency:

```bash
npx --package @scalarislab/docsmirror-server docsmirror-lsp --stdio
```

## Usage

Attach your LSP client to **all** file types, the convention is language-agnostic, so selecting
by language would be wrong, and forward your settings under the `docsmirror` section. In Neovim
with `nvim-lspconfig`, for instance, that is a `cmd` of `{ 'docsmirror-lsp', '--stdio' }` with
`filetypes` left unset so it attaches everywhere.

VS Code users install [`docsmirror-vscode`](https://github.com/ScalarisLab/docsmirror/tree/main/packages/vscode)
instead of talking to the server directly.

`--stdio` is accepted and ignored, since many clients pass it unconditionally; `--node-ipc`
selects IPC when the client spawns the server as a Node child process.

Beyond the standard requests, the server answers two of its own, `docsmirror/pointers` and
`docsmirror/section`, for clients that draw the pointer line themselves. Their method names and
result types are exported from the package, both from the main entry and from the dependency-free
`dist/protocol` module for clients that bundle.

## Learn more

Full protocol and settings reference:
[github.com/ScalarisLab/docsmirror](https://github.com/ScalarisLab/docsmirror), in particular
[docs/server.md](https://github.com/ScalarisLab/docsmirror/blob/main/docs/server.md).
