# `@scalarislab/docsmirror-core`

The single source of truth for the `@docs` convention: parsing pointers out of source comments,
resolving them against a docs root, validating a whole project, and building the manifest. Every
other DocsMirror package, the CLI, the language server, the MCP server, the web app, reads
pointers through this package and nowhere else, which is why they can never disagree about what a
pointer means.

Zero runtime dependencies.

Most projects never install this directly, `@scalarislab/docsmirror-cli` pulls it in for `docsmirror check`
and `docsmirror manifest`. Install it yourself when you are building a new surface on top of the
convention (an editor client, a bot, a custom report).

## Install

```bash
npm install @scalarislab/docsmirror-core
```

## Usage

```ts
import { DocsResolver, LocalDocsRoot, parseSource, validateProject } from '@scalarislab/docsmirror-core';

const root = new LocalDocsRoot('docs');
const resolver = new DocsResolver(root);

const source = {
  path: 'src/http/retry.ts',
  text: 'export async function retry() {\n  // @docs decisions/retry-policy.md#idempotency\n}\n',
};

const report = await validateProject([source], resolver);
for (const issue of report.issues) {
  console.log(`${issue.file}: ${issue.message}`);
}
```

`parseSource` finds the pointers in a file, `DocsResolver` resolves one against a `DocsRoot`, and
`validateProject` does both across a whole project, the same function `docsmirror check` runs.
`LocalDocsRoot` is the on-disk implementation of `DocsRoot`; the interface is what makes it
possible to point DocsMirror at something other than a folder later.

## Learn more

Full documentation, the `@docs` convention, and the other packages built on this one:
[github.com/ScalarisLab/docsmirror](https://github.com/ScalarisLab/docsmirror).
