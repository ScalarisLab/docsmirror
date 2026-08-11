/**
 * The public shapes returned by GitHistory. A fixed contract, another
 * package is coded against these exact fields.
 * @docs history.md#reading-git-not-a-new-format
 */

export interface Author {
  readonly name: string;
  readonly email: string;
}

export interface GraphCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly parents: readonly string[];
  readonly author: Author;
  readonly date: string;
  readonly subject: string;
  readonly refs: readonly string[];
  readonly touchedDocuments: readonly string[];
  readonly lane: number;
}

export interface RepositoryGraph {
  readonly commits: readonly GraphCommit[];
  readonly laneCount: number;
  readonly head: string | undefined;
  readonly truncated: boolean;
}

export type ChangeKind = 'added' | 'modified' | 'renamed' | 'deleted';

export interface FileRevision {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: Author;
  readonly date: string;
  readonly subject: string;
  readonly changeKind: ChangeKind;
  readonly previousPath: string | undefined;
}

export type DiffLineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
  readonly oldLine: number | undefined;
  readonly newLine: number | undefined;
}

export interface DiffHunk {
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

export interface FileDiff {
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly hunks: readonly DiffHunk[];
  readonly binary: boolean;
  readonly stats: {
    readonly added: number;
    readonly removed: number;
  };
}

/** Literal revision meaning "the current on-disk state", accepted by diff(). */
export const WORKTREE = 'WORKTREE';

export interface RepositoryGraphOptions {
  readonly limit?: number;
  readonly pathPrefix?: string;
}

export interface FileTimelineOptions {
  readonly limit?: number;
}

export const DEFAULT_GRAPH_LIMIT = 200;
export const DEFAULT_TIMELINE_LIMIT = 200;
