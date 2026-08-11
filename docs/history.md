# History

`@docsmirror/history` shows the history of a documentation folder by reading the repository's
git history directly, it does not invent a second versioning format inside the documents
themselves.

## Reading git, not a new format

Git already records a dated, authored history of every markdown file: who changed it, when, and
what the previous content was. `@docsmirror/history` has zero runtime dependencies; it shells out
to the `git` binary via `node:child_process.execFile` with an explicit argv array, never a shell
string, so a caller-supplied path or revision can never be interpreted as a flag or injected into
the command line. Every path and revision argument is validated to reject anything starting with
`-` before it reaches git.

`git log` output is parsed with an explicit `--format` using field/record separators that cannot
occur in a commit message (`\x1f` between fields, `\x1e` between commits). `--graph` ASCII art is
never parsed, lanes are computed independently (see below).

## The repository graph

`GitHistory#repositoryGraph()` runs a single `git log --all --topo-order --name-status` and
returns every commit's hash, parents, author, ISO 8601 date, subject, decorating refs (branch/tag
names), the documentation paths it touched, and its rendering lane. `limit` defaults to 200
commits; when more history exists, `truncated` is `true` and the result contains the newest
`limit` commits.

`pathPrefix` scopes the graph to a folder, the docs root, in practice, and it carries a trap
worth naming. Git simplifies history by default whenever it filters by path: it prunes the merge
commits whose result matches one of their parents. Applied to a graph, that quietly deletes exactly
the structure the graph exists to show, turning a branch-and-merge history into a straight line. So
a scoped graph is fetched with `--full-history`, which keeps the topology intact and costs nothing
that matters at these sizes.

## A note's timeline

`GitHistory#fileTimeline()` runs `git log --follow --name-status` scoped to one file, so a rename
earlier in the file's history is still visible: each `FileRevision` reports a `changeKind`
(`added` / `modified` / `renamed` / `deleted`) and, for a rename, the `previousPath`.

`GitHistory#readAtRevision()` runs `git show <revision>:<path>` and resolves to `undefined` rather
than throwing when the file did not exist at that revision. Passing the literal revision
`"WORKTREE"` reads the file straight off disk instead, reflecting uncommitted edits.

## Diffs

`GitHistory#diff()` runs `git diff` between two revisions (or a revision and `"WORKTREE"`, the
current on-disk state) and parses the real unified diff output, `@@ -a,b +c,d @@` hunk headers
and the following `+`/`-`/` ` lines, into structured `DiffHunk`s. Each `DiffLine` carries the old
and new line number it belongs to (a context line has both, an added line only `newLine`, a
removed line only `oldLine`), so a caller can render a side-by-side or unified diff view without
re-deriving line numbers itself. Binary content is reported via `binary: true` with no hunks.

Git can only diff a commit against the worktree in the (commit → worktree) direction. When a
caller asks for the opposite direction, `diff(path, "WORKTREE", <commit>)`, this package runs
the (commit → worktree) diff and swaps every line's kind and old/new line numbers before
returning it, so the result still reads as (worktree → commit) to the caller.

## Lane assignment

Lanes are assigned by walking the commits newest-first (the order `--topo-order` guarantees:
every commit appears before its parents) and tracking, per lane, which commit hash is expected
there next:

1. A commit takes the lane that currently expects its hash, the lane its child (the
   newer commit that listed it as a parent) already reserved for it. If no lane expects it yet
   (it is a branch tip with no descendant in the returned window), it claims the first free lane,
   or opens a new one.
2. Once placed, the commit's own lane slot is cleared, then reassigned to its parents: the first
   parent inherits the same lane (the common case, a straight line of commits stays in one
   column). Each additional parent (a merge commit) claims a free lane or opens a new one, so a
   merge visibly fans out into extra columns.
3. If a parent is already expected in some other lane (two branches converging on a shared
   ancestor), that duplicate claim is dropped instead of opening a redundant lane.
4. A lane that ends up expecting nothing (a root commit with no parents) simply stays free for the
   next commit that needs a lane, nothing has to "release" it explicitly.

`RepositoryGraph#laneCount` is the highest lane index used, plus one, so a caller knows how many
columns to reserve for rendering.
