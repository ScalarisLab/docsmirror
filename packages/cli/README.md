# `@scalarislab/docsmirror-cli`

The `docsmirror` command: the anti-rot gate for `@docs` pointers, the generator for the
documentation manifest, and the local documentation app, from one binary.

```
docsmirror check [projectRoot]      Validate @docs pointers in a project
docsmirror manifest [projectRoot]   Generate the documentation manifest (docsmirror.json)
docsmirror serve [projectRoot]      Browse, search and edit the documentation locally
```

## Install

```bash
npm install --save-dev @scalarislab/docsmirror-cli
```

Or run it without installing:

```bash
npx @scalarislab/docsmirror-cli check
```

## Usage

Wire `check` into CI so a broken pointer fails the build instead of rotting silently:

```json
{ "scripts": { "test": "docsmirror check && <your tests>" } }
```

Generate the machine-readable map of the whole documentation surface, every document, its
summary, its anchors, and which code depends on it:

```bash
docsmirror manifest
```

`docsmirror check` reports a pointer whose document or anchor does not exist, a malformed pointer,
and, with `--orphans`, a document that no pointer and no index can reach. Exit code `0` means
nothing was reported, `1` means something was, `2` is a usage error.

## Learn more

Full CLI reference, configuration (`docsmirror.config.json`), and the rest of DocsMirror:
[github.com/ScalarisLab/docsmirror](https://github.com/ScalarisLab/docsmirror), in particular
[docs/cli.md](https://github.com/ScalarisLab/docsmirror/blob/main/docs/cli.md).
