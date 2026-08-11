/**
 * Reads a documentation folder's history straight from git, no bespoke
 * versioning format, no runtime dependencies, just the `git` binary.
 * @docs history.md#reading-git-not-a-new-format
 */
import { runGit } from './git';
import { diff as diffImpl, readAtRevision as readAtRevisionImpl } from './diff';
import { repositoryGraph as repositoryGraphImpl } from './graph';
import { fileTimeline as fileTimelineImpl } from './timeline';
import type {
  FileDiff,
  FileRevision,
  FileTimelineOptions,
  RepositoryGraph,
  RepositoryGraphOptions,
} from './types';

export class GitHistory {
  private readonly repositoryRoot: string;

  constructor(repositoryRoot: string) {
    this.repositoryRoot = repositoryRoot;
  }

  /** True when git is installed AND repositoryRoot is inside a work tree with at least one commit. */
  async isAvailable(): Promise<boolean> {
    try {
      const workTree = await runGit(this.repositoryRoot, ['rev-parse', '--is-inside-work-tree']);
      if (workTree.exitCode !== 0 || workTree.stdout.trim() !== 'true') {
        return false;
      }
      const head = await runGit(this.repositoryRoot, ['rev-parse', '--verify', '-q', 'HEAD']);
      return head.exitCode === 0;
    } catch {
      return false;
    }
  }

  repositoryGraph(options?: RepositoryGraphOptions): Promise<RepositoryGraph> {
    return repositoryGraphImpl(this.repositoryRoot, options);
  }

  fileTimeline(relativePath: string, options?: FileTimelineOptions): Promise<FileRevision[]> {
    return fileTimelineImpl(this.repositoryRoot, relativePath, options);
  }

  readAtRevision(relativePath: string, revision: string): Promise<string | undefined> {
    return readAtRevisionImpl(this.repositoryRoot, relativePath, revision);
  }

  diff(relativePath: string, fromRevision: string, toRevision: string): Promise<FileDiff> {
    return diffImpl(this.repositoryRoot, relativePath, fromRevision, toRevision);
  }
}

export type {
  Author,
  ChangeKind,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  FileDiff,
  FileRevision,
  FileTimelineOptions,
  GraphCommit,
  RepositoryGraph,
  RepositoryGraphOptions,
} from './types';
export { WORKTREE } from './types';
