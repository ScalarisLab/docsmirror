import { GitHistory, type FileDiff, type FileRevision, type RepositoryGraph } from '@scalarislab/docsmirror-history';
import type { DocsProject } from './project';

/** What every history endpoint answers when the project is not a git repository. */
export interface HistoryUnavailable {
  readonly available: false;
  readonly reason: string;
}

export type HistoryAnswer<T> = T | HistoryUnavailable;

const GRAPH_LIMIT = 400;
const TIMELINE_LIMIT = 200;

const UNAVAILABLE: HistoryUnavailable = {
  available: false,
  reason: 'This project has no readable git history.',
};

/**
 * Git history for the project's docs root.
 *
 * Every call funnels through `attempt`, because git being absent, broken or
 * simply uninitialised is an ordinary state for a documentation folder, the
 * app says so and keeps working, and never turns it into a server error.
 */
export class HistoryService {
  private readonly git: GitHistory;
  private available: Promise<boolean> | undefined;

  constructor(private readonly project: DocsProject) {
    this.git = new GitHistory(project.projectRoot);
  }

  async graph(): Promise<HistoryAnswer<RepositoryGraph>> {
    return this.attempt(() =>
      this.git.repositoryGraph({ limit: GRAPH_LIMIT, pathPrefix: this.project.docsRootPrefix }),
    );
  }

  async timeline(path: string): Promise<HistoryAnswer<readonly FileRevision[]>> {
    return this.attempt(() =>
      this.git.fileTimeline(this.project.repositoryPathOf(path), { limit: TIMELINE_LIMIT }),
    );
  }

  async diff(path: string, from: string, to: string): Promise<HistoryAnswer<FileDiff>> {
    return this.attempt(() => this.git.diff(this.project.repositoryPathOf(path), from, to));
  }

  private isAvailable(): Promise<boolean> {
    if (this.available === undefined) {
      this.available = this.git.isAvailable().catch(() => false);
    }
    return this.available;
  }

  private async attempt<T>(run: () => Promise<T>): Promise<HistoryAnswer<T>> {
    if (!(await this.isAvailable())) {
      return UNAVAILABLE;
    }
    try {
      return await run();
    } catch {
      return UNAVAILABLE;
    }
  }
}
