# The `docsmirror` CLI

Three commands: `check`, the anti-rot gate; `manifest`, which generates the documentation map; and
`serve`, the local reading and editing app.

```bash
npx @docsmirror/cli check
npx @docsmirror/cli manifest
npx @docsmirror/cli serve
```

## `docsmirror check`

It reads every source file of a project, finds the `@docs` pointers, and fails when one no longer
resolves. Wire it into a test suite or a build and documentation stops drifting silently.

### Options

| Flag | What it does |
| --- | --- |
| `--docs <dir>` | Docs root, relative to the project root. Overrides the configuration file. |
| `--include <glob>` | Source glob to scan; repeatable. The first use replaces the configured include list, further uses extend that new list. |
| `--exclude <glob>` | Source glob to skip; repeatable. Always appended to the configured exclude list, see [Include and exclude](#include-and-exclude) for why exclusions only ever grow. |
| `--orphans` | Also report documents that nothing reaches. See [orphan detection](#orphan-detection). |
| `--manifest` | Require a manifest, failing when the project has none. Without it, drift is only checked when a `docsmirror.json` exists. |
| `--json` | Print a machine-readable JSON report on stdout: every issue with its file, position, rule and message, plus the summary counts. For CI annotations and tooling. |
| `--quiet` | Print only the summary line and failures. |

`docsmirror check [projectRoot]` accepts an explicit project root; it defaults to the current
working directory.

### What `check` verifies

| Reported | Severity | Meaning |
| --- | --- | --- |
| `malformed-pointer` | error | `@docs` with no path, a markdown link, an absolute path, or a path escaping the docs root. |
| `file-not-found` | error | The pointer names a document the docs root does not have. |
| `anchor-not-found` | error | The document exists but has no heading with that slug. A near-miss anchor is suggested. |
| `orphan-doc` | warning | Opt-in, see [orphan detection](#orphan-detection). |
| `manifest-stale` | error | The committed manifest no longer matches the documentation on disk. Only reported when the project has one, unless `--manifest` requires it. |

Exit codes: `0` when nothing is reported, `1` when anything is, `2` on a usage error, an unknown
flag, an unreadable configuration file, a docs root that does not exist.

Staleness is never a failure. See [Staleness](staleness.md#how-staleness-is-computed).

## Configuration

`docsmirror.config.json` at the project root. Every field is optional; the defaults are a working
configuration and a project with a `docs/` folder needs no file at all.

```json
{
  "docsRoot": "docs",
  "include": ["**/*"],
  "exclude": ["**/node_modules/**", "**/dist/**"],
  "indexes": ["index.md", "README.md"],
  "staleness": { "agingAfterDays": 90, "staleAfterDays": 180 }
}
```

The same file configures the language server, so the editor and CI resolve pointers identically.
Editor settings, where a client provides them, override the file.

## Include and exclude

Both are glob lists matched against project-relative, `/`-separated paths, supporting `*`, `**`,
`?` and character classes. `exclude` wins over `include`, and excluded directories are never walked
at all, which is what keeps a scan of a large repository cheap.

`include` in your configuration **replaces** the default list; `exclude` **adds to** it. Excluding
one folder of your own must never silently start a scan of `node_modules`, so the default
exclusions always apply.

Default exclusions cover `node_modules`, `.git`, `dist`, `out`, `build`, `coverage`, lockfiles,
minified bundles, and **markdown files**, because in markdown every `#` heading reads as a comment
and documented examples would be collected as real pointers.

Two more files are skipped regardless of the globs: anything above 1 MB, and anything binary
(detected by a NUL byte in the first kilobyte).

## Generating the manifest

```bash
docsmirror manifest              # write docsmirror.json
docsmirror manifest --check      # verify it is current, exit 1 when it is not
docsmirror manifest --stdout     # print it, write nothing
docsmirror manifest --out map.json
```

The manifest describes the whole documentation surface for machines to read; what it contains and
why it is generated rather than written is in [The manifest](manifest.md#the-format).

`check` and `manifest` read a project identically, same config, same include/exclude, same docs
root, so the two commands can never disagree about what the project contains.

## Orphan detection

Off by default, enabled with `--orphans`. It reports documents that nothing reaches, no `@docs`
pointer, and no path of markdown links starting from an index file.

Reachability is transitive. Starting from every document a pointer resolves to, plus every file
named in `indexes` (at the docs root or in any subdirectory), DocsMirror follows relative markdown
links between documents. External URLs, absolute paths and in-page anchors are ignored, since they
do not keep the reader inside the docs root.

This is the check that catches the other direction of rot: not a pointer aimed at nothing, but a
document nobody can find. It is opt-in because a project adopting DocsMirror gradually will have
many such documents on day one, and a gate that fails immediately is a gate that gets disabled.

## `docsmirror serve`

```bash
docsmirror serve                 # binds to 127.0.0.1:4321
docsmirror serve --port 0        # pick a free port instead
docsmirror serve --host 0.0.0.0  # expose beyond loopback, only for a network you already trust
```

Binding beyond loopback is an explicit opt-in with real consequences: the app **writes to the
files in your working tree**, so anyone who can reach the port can edit your documentation. On the
default loopback bind the server also pins the `Host` header against DNS rebinding; with an
explicit `--host` that pin necessarily steps aside (the server cannot know every name it is
reachable by), and only the cross-origin protection remains. Use it on a trusted, private network
or not at all.

Starts the local documentation app described in [The web app](web.md). `check` and `manifest` are
the two commands a CI pipeline runs; `serve` is the one a person runs, and it is the only command
that pulls in `@docsmirror/web`, a small webapp and the markdown renderer it draws pages with,
neither of which `check` or `manifest` ever touch.

That dependency is declared as **optional** in `@docsmirror/cli`'s `package.json` for exactly that
reason, and loaded dynamically rather than imported at the top of the file. A plain `npm install`
still gets it, so `serve` works out of the box; a CI image built only to run `check`/`manifest` can
run `npm ci --omit=optional` and skip it entirely. Running `serve` without it installed fails with
one line telling you to `npm install @docsmirror/web`, not a stack trace.
