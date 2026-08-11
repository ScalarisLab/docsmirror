/**
 * Builds the repository-wide commit graph, including lane assignment.
 * @docs history.md#the-repository-graph
 */
import { assertSafeArg, runGitOrThrow, toPosixPath } from './git';
import type { Author, GraphCommit, RepositoryGraph, RepositoryGraphOptions } from './types';
import { DEFAULT_GRAPH_LIMIT } from './types';

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';
const LOG_FORMAT = [
  '%H',
  '%h',
  '%P',
  '%an',
  '%ae',
  '%aI',
  '%s',
  '%D',
].join(FIELD_SEPARATOR);

interface RawCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly parents: readonly string[];
  readonly author: Author;
  readonly date: string;
  readonly subject: string;
  readonly refs: readonly string[];
  readonly touchedDocuments: readonly string[];
}

function parseRefs(rawDecoration: string): string[] {
  if (rawDecoration.length === 0) {
    return [];
  }
  const refs: string[] = [];
  for (const entry of rawDecoration.split(', ')) {
    let name = entry.trim();
    if (name.length === 0) {
      continue;
    }
    if (name.startsWith('HEAD -> ')) {
      name = name.slice('HEAD -> '.length);
    } else if (name === 'HEAD') {
      continue;
    }
    if (name.startsWith('tag: ')) {
      name = name.slice('tag: '.length);
    }
    refs.push(name);
  }
  return refs;
}

function touchedPathsFromNameStatus(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }
    const parts = line.split('\t');
    const status = parts[0] ?? '';
    const path = status.startsWith('R') || status.startsWith('C') ? parts[2] : parts[1];
    if (path && !seen.has(path)) {
      seen.add(path);
      paths.push(path);
    }
  }
  return paths;
}

function parseChunk(chunk: string): RawCommit | undefined {
  const newlineIndex = chunk.indexOf('\n');
  const metadataLine = newlineIndex === -1 ? chunk : chunk.slice(0, newlineIndex);
  const rest = newlineIndex === -1 ? '' : chunk.slice(newlineIndex + 1);
  const fields = metadataLine.split(FIELD_SEPARATOR);
  const [hash, shortHash, parentsRaw, authorName, authorEmail, date, subject, refsRaw] = fields;
  if (!hash || !shortHash) {
    return undefined;
  }
  const parents = (parentsRaw ?? '').length > 0 ? (parentsRaw ?? '').split(' ') : [];
  const nameStatusLines = rest.split('\n').filter((line) => line.trim().length > 0);
  return {
    hash,
    shortHash,
    parents,
    author: { name: authorName ?? '', email: authorEmail ?? '' },
    date: date ?? '',
    subject: subject ?? '',
    refs: parseRefs(refsRaw ?? ''),
    touchedDocuments: touchedPathsFromNameStatus(nameStatusLines),
  };
}

function parseLog(stdout: string): RawCommit[] {
  const chunks = stdout.split(RECORD_SEPARATOR);
  const commits: RawCommit[] = [];
  for (const chunk of chunks) {
    if (chunk.length === 0) {
      continue;
    }
    const commit = parseChunk(chunk);
    if (commit) {
      commits.push(commit);
    }
  }
  return commits;
}

/**
 * Assigns a 0-based rendering lane to each commit, walking newest-first: a
 * commit takes the lane its child expects it in, a merge's extra parents
 * open new lanes, and a lane frees up once nothing expects it anymore.
 * @docs history.md#lane-assignment
 */
function assignLanes(commits: readonly RawCommit[]): { laneOf: Map<string, number>; laneCount: number } {
  const activeLanes: Array<string | null> = [];
  const laneOf = new Map<string, number>();
  let laneCount = 0;

  const claimLane = (): number => {
    const free = activeLanes.indexOf(null);
    if (free !== -1) {
      return free;
    }
    activeLanes.push(null);
    return activeLanes.length - 1;
  };

  for (const commit of commits) {
    let lane = activeLanes.indexOf(commit.hash);
    if (lane === -1) {
      lane = claimLane();
    }
    laneOf.set(commit.hash, lane);
    laneCount = Math.max(laneCount, lane + 1);
    activeLanes[lane] = null;

    commit.parents.forEach((parentHash, parentIndex) => {
      if (activeLanes.includes(parentHash)) {
        // Another lane already expects this parent (branches converging); do not duplicate.
        return;
      }
      const parentLane = parentIndex === 0 ? lane : claimLane();
      activeLanes[parentLane] = parentHash;
    });
  }

  return { laneOf, laneCount };
}

async function currentBranch(repositoryRoot: string): Promise<string | undefined> {
  const args = ['symbolic-ref', '--short', '-q', 'HEAD'];
  try {
    const stdout = await runGitOrThrow(repositoryRoot, args);
    const name = stdout.trim();
    return name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

export async function repositoryGraph(
  repositoryRoot: string,
  options: RepositoryGraphOptions | undefined,
): Promise<RepositoryGraph> {
  const limit = options?.limit ?? DEFAULT_GRAPH_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`limit must be a positive integer: ${limit}`);
  }

  const args = [
    'log',
    '--all',
    '--topo-order',
    `--format=${RECORD_SEPARATOR}${LOG_FORMAT}`,
    '--name-status',
    '-n',
    String(limit + 1),
  ];
  if (options?.pathPrefix !== undefined) {
    assertSafeArg(options.pathPrefix, 'pathPrefix');
    // History simplification is the default when git filters by path, and it
    // prunes the merge commits whose result matches a parent, which turns a
    // branch-and-merge history into a straight line and defeats the point of
    // drawing a graph. `--full-history` keeps the topology intact.
    args.push('--full-history', '--', toPosixPath(options.pathPrefix));
  }

  const stdout = await runGitOrThrow(repositoryRoot, args);
  const rawCommits = parseLog(stdout);
  const truncated = rawCommits.length > limit;
  const windowed = truncated ? rawCommits.slice(0, limit) : rawCommits;

  const { laneOf, laneCount } = assignLanes(windowed);
  const commits: GraphCommit[] = windowed.map((commit) => ({
    hash: commit.hash,
    shortHash: commit.shortHash,
    parents: commit.parents,
    author: commit.author,
    date: commit.date,
    subject: commit.subject,
    refs: commit.refs,
    touchedDocuments: commit.touchedDocuments,
    lane: laneOf.get(commit.hash) ?? 0,
  }));

  return {
    commits,
    laneCount,
    head: await currentBranch(repositoryRoot),
    truncated,
  };
}
