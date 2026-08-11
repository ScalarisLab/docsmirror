# `@scalarislab/docsmirror-history`

Reads a documentation folder's history straight from git, no bespoke versioning format invented
inside the documents themselves. Powers the history views in
[`@scalarislab/docsmirror-web`](https://github.com/ScalarisLab/docsmirror/tree/main/packages/web).

Zero runtime dependencies: it shells out to the `git` binary with an explicit argv array, never a
shell string, so a caller-supplied path or revision can never be interpreted as a flag or injected
into the command line.

## Install

```bash
npm install @scalarislab/docsmirror-history
```

## Usage

```ts
import { GitHistory, WORKTREE } from '@scalarislab/docsmirror-history';

const history = new GitHistory('/path/to/repository');

if (await history.isAvailable()) {
  const graph = await history.repositoryGraph({ pathPrefix: 'docs' });
  const revisions = await history.fileTimeline('docs/decisions/retry-policy.md');
  const diff = await history.diff('docs/decisions/retry-policy.md', revisions[1].hash, WORKTREE);
}
```

`repositoryGraph()` returns every commit's hash, parents, author, date, subject and rendering
lane; `fileTimeline()` follows one file across renames; `readAtRevision()` reads a file's content
at a given revision (or `WORKTREE`, the current on-disk state); `diff()` parses real unified diff
output into structured hunks and lines. When there is no repository, no `git` binary, or no
commits, `repositoryGraph()` and `fileTimeline()` reject, the package exposes `isAvailable()` so
a caller can check once and degrade gracefully, the way `@scalarislab/docsmirror-web`'s `HistoryService` does.

## Learn more

Full documentation:
[github.com/ScalarisLab/docsmirror](https://github.com/ScalarisLab/docsmirror), in particular
[docs/history.md](https://github.com/ScalarisLab/docsmirror/blob/main/docs/history.md).
