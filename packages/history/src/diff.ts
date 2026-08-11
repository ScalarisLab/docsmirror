/**
 * Reads a file at a revision and parses real unified diff output into
 * structured hunks with per-line old/new line numbers.
 * @docs history.md#diffs
 */
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { assertSafeArg, runGit, toPosixPath } from './git';
import type { DiffHunk, DiffLine, DiffLineKind, FileDiff } from './types';
import { WORKTREE } from './types';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$/;

function parseUnifiedDiff(text: string): { hunks: DiffHunk[]; binary: boolean } {
  if (/^Binary files /m.test(text)) {
    return { hunks: [], binary: true };
  }

  const lines = text.split('\n');
  const hunks: DiffHunk[] = [];
  let currentLines: DiffLine[] = [];
  let currentHeader = '';
  let oldCursor = 0;
  let newCursor = 0;

  const flush = (): void => {
    if (currentHeader.length > 0) {
      hunks.push({ header: currentHeader, lines: currentLines });
    }
  };

  for (const rawLine of lines) {
    const headerMatch = HUNK_HEADER.exec(rawLine);
    if (headerMatch) {
      flush();
      currentHeader = rawLine;
      currentLines = [];
      oldCursor = Number(headerMatch[1]);
      newCursor = Number(headerMatch[3]);
      continue;
    }
    if (currentHeader.length === 0) {
      // Preamble (diff --git, index, ---, +++, rename headers): not part of a hunk.
      continue;
    }
    if (rawLine.startsWith('\\')) {
      // "\ No newline at end of file": not a content line.
      continue;
    }
    const marker = rawLine.charAt(0);
    let kind: DiffLineKind;
    let oldLine: number | undefined;
    let newLine: number | undefined;
    if (marker === '+') {
      kind = 'added';
      newLine = newCursor;
      newCursor += 1;
    } else if (marker === '-') {
      kind = 'removed';
      oldLine = oldCursor;
      oldCursor += 1;
    } else if (marker === ' ') {
      kind = 'context';
      oldLine = oldCursor;
      newLine = newCursor;
      oldCursor += 1;
      newCursor += 1;
    } else if (rawLine.length === 0) {
      // Trailing empty split artifact at end of diff output.
      continue;
    } else {
      continue;
    }
    currentLines.push({ kind, text: rawLine.slice(1), oldLine, newLine });
  }
  flush();

  return { hunks, binary: false };
}

function statsOf(hunks: readonly DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'added') {
        added += 1;
      } else if (line.kind === 'removed') {
        removed += 1;
      }
    }
  }
  return { added, removed };
}

function reverseHeader(header: string): string {
  const match = HUNK_HEADER.exec(header);
  if (!match) {
    return header;
  }
  const [, oldStart, oldCount, newStart, newCount] = match;
  const oldPart = oldCount !== undefined ? `${oldStart},${oldCount}` : oldStart;
  const newPart = newCount !== undefined ? `${newStart},${newCount}` : newStart;
  return `@@ -${newPart} +${oldPart} @@`;
}

/** Swaps old/new so a diff computed as (to -> WORKTREE) reads as (WORKTREE -> to). */
function reverseDiff(diff: FileDiff): FileDiff {
  const hunks = diff.hunks.map((hunk) => ({
    header: reverseHeader(hunk.header),
    lines: hunk.lines.map((line) => ({
      kind: line.kind === 'added' ? ('removed' as const) : line.kind === 'removed' ? ('added' as const) : line.kind,
      text: line.text,
      oldLine: line.newLine,
      newLine: line.oldLine,
    })),
  }));
  return {
    path: diff.path,
    from: diff.to,
    to: diff.from,
    hunks,
    binary: diff.binary,
    stats: { added: diff.stats.removed, removed: diff.stats.added },
  };
}

export async function readAtRevision(
  repositoryRoot: string,
  relativePath: string,
  revision: string,
): Promise<string | undefined> {
  assertSafeArg(relativePath, 'relativePath');

  if (revision === WORKTREE) {
    // Git refuses `revision:path` lookups that leave the repository; the
    // worktree branch reads straight from disk, so it must refuse them too.
    // A path that escapes gets the same answer as a path that never existed.
    const root = resolve(repositoryRoot);
    const target = resolve(root, relativePath);
    if (target !== root && !target.startsWith(root + sep)) {
      return undefined;
    }
    try {
      return await readFile(target, 'utf8');
    } catch {
      return undefined;
    }
  }

  assertSafeArg(revision, 'revision');
  const posixPath = toPosixPath(relativePath);
  const result = await runGit(repositoryRoot, ['show', `${revision}:${posixPath}`]);
  return result.exitCode === 0 ? result.stdout : undefined;
}

export async function diff(
  repositoryRoot: string,
  relativePath: string,
  fromRevision: string,
  toRevision: string,
): Promise<FileDiff> {
  assertSafeArg(relativePath, 'relativePath');
  const posixPath = toPosixPath(relativePath);
  const fromIsWorktree = fromRevision === WORKTREE;
  const toIsWorktree = toRevision === WORKTREE;

  if (fromIsWorktree && toIsWorktree) {
    return {
      path: posixPath,
      from: fromRevision,
      to: toRevision,
      hunks: [],
      binary: false,
      stats: { added: 0, removed: 0 },
    };
  }

  if (!fromIsWorktree) {
    assertSafeArg(fromRevision, 'fromRevision');
  }
  if (!toIsWorktree) {
    assertSafeArg(toRevision, 'toRevision');
  }

  if (fromIsWorktree) {
    // We need (worktree -> toRevision); git only diffs a commit against the
    // worktree in the (commit -> worktree) direction, so compute that and flip it.
    const result = await runGit(repositoryRoot, ['diff', '--no-color', '-U3', toRevision, '--', posixPath]);
    const { hunks, binary } = parseUnifiedDiff(result.stdout);
    const forward: FileDiff = {
      path: posixPath,
      from: toRevision,
      to: fromRevision,
      hunks,
      binary,
      stats: statsOf(hunks),
    };
    return reverseDiff(forward);
  }

  const args = toIsWorktree
    ? ['diff', '--no-color', '-U3', fromRevision, '--', posixPath]
    : ['diff', '--no-color', '-U3', fromRevision, toRevision, '--', posixPath];
  const result = await runGit(repositoryRoot, args);
  const { hunks, binary } = parseUnifiedDiff(result.stdout);
  return {
    path: posixPath,
    from: fromRevision,
    to: toRevision,
    hunks,
    binary,
    stats: statsOf(hunks),
  };
}
