/**
 * Builds the commit-by-commit history of a single file, following renames.
 * @docs history.md#a-notes-timeline
 */
import { assertSafeArg, runGitOrThrow, toPosixPath } from './git';
import type { Author, ChangeKind, FileRevision, FileTimelineOptions } from './types';
import { DEFAULT_TIMELINE_LIMIT } from './types';

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';
const LOG_FORMAT = ['%H', '%h', '%an', '%ae', '%aI', '%s'].join(FIELD_SEPARATOR);

function changeKindOf(statusCode: string): ChangeKind {
  const letter = statusCode.charAt(0);
  switch (letter) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    default:
      return 'modified';
  }
}

function parseChunk(chunk: string): FileRevision | undefined {
  const newlineIndex = chunk.indexOf('\n');
  const metadataLine = newlineIndex === -1 ? chunk : chunk.slice(0, newlineIndex);
  const rest = newlineIndex === -1 ? '' : chunk.slice(newlineIndex + 1);
  const fields = metadataLine.split(FIELD_SEPARATOR);
  const [hash, shortHash, authorName, authorEmail, date, subject] = fields;
  if (!hash || !shortHash) {
    return undefined;
  }
  const author: Author = { name: authorName ?? '', email: authorEmail ?? '' };

  const statusLine = rest.split('\n').find((line) => line.trim().length > 0) ?? '';
  const parts = statusLine.split('\t');
  const statusCode = parts[0] ?? 'M';
  const changeKind = changeKindOf(statusCode);
  const previousPath = changeKind === 'renamed' ? parts[1] : undefined;

  return {
    hash,
    shortHash,
    author,
    date: date ?? '',
    subject: subject ?? '',
    changeKind,
    previousPath,
  };
}

export async function fileTimeline(
  repositoryRoot: string,
  relativePath: string,
  options: FileTimelineOptions | undefined,
): Promise<FileRevision[]> {
  assertSafeArg(relativePath, 'relativePath');
  const limit = options?.limit ?? DEFAULT_TIMELINE_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`limit must be a positive integer: ${limit}`);
  }

  const args = [
    'log',
    '--follow',
    '--name-status',
    `--format=${RECORD_SEPARATOR}${LOG_FORMAT}`,
    '-n',
    String(limit),
    '--',
    toPosixPath(relativePath),
  ];

  const stdout = await runGitOrThrow(repositoryRoot, args);
  const chunks = stdout.split(RECORD_SEPARATOR);
  const revisions: FileRevision[] = [];
  for (const chunk of chunks) {
    if (chunk.length === 0) {
      continue;
    }
    const revision = parseChunk(chunk);
    if (revision) {
      revisions.push(revision);
    }
  }
  return revisions;
}
