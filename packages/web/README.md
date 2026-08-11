# `@docsmirror/web`

A local application for reading and writing a repository's documentation: browse it, search it,
edit it, and see how it changed over time. It reads and writes the real markdown files in your
working tree.

This is a **dev server**, deliberately: it binds to `127.0.0.1`, has no accounts and no database,
and is not something to expose. Documentation lives in the repository and is reviewed like code.

## Install

```bash
npm install --save-dev @docsmirror/web
```

Or run it without installing, through [`@docsmirror/cli`](https://github.com/ScalarisLab/docsmirror/tree/main/packages/cli):

```bash
npx @docsmirror/cli serve
```

## Usage

```bash
npx --package @docsmirror/web docsmirror-serve [project-root] [--port <number>] [--open]
```

The project root defaults to the current working directory. The page is a corpus sidebar on the
left carrying the search field, then the sheet: the document's head with its breadcrumb and
actions, the contents pinned down the left of the prose, and the apparatus floated into the right
margin, including the code whose `@docs` pointers name the section you are reading. The documents
that link here and the code that depends on the page sit at the foot; history opens from the
**History** button in the running head. The full composition is described in
[docs/web.md](https://github.com/ScalarisLab/docsmirror/blob/main/docs/web.md#the-composition).

## Learn more

Full documentation, including the HTTP API it exposes:
[github.com/ScalarisLab/docsmirror](https://github.com/ScalarisLab/docsmirror), in particular
[docs/web.md](https://github.com/ScalarisLab/docsmirror/blob/main/docs/web.md).
