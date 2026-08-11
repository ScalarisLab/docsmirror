/**
 * The live documentation map of one project.
 *
 * The manifest is built from the filesystem rather than read from a committed
 * `docsmirror.json`, so the server works in a project that never generated one
 * and never serves an agent a map its repository has already moved past.
 * Rebuilds are driven by a signature, not by a timer: unchanged files cost one
 * stat sweep and reuse the cached snapshot.
 * @docs manifest.md#keeping-it-current
 */

import {
  buildManifest,
  CONFIG_FILE_NAME,
  openProject,
  scanOptionsFrom,
  scanSources,
  type OpenedProject,
} from '@docsmirror/core';
import { ToolFailure } from '../errors';
import { fingerprintProject } from './fingerprint';
import { ProjectSnapshot } from './ProjectSnapshot';

export class DocsProject {
  private snapshot: ProjectSnapshot | undefined;
  /** Serialises refreshes so concurrent tool calls never build the same manifest twice. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly projectRoot: string) {}

  /** The current view of the project, rebuilt only when something it describes changed. */
  async current(): Promise<ProjectSnapshot> {
    const refresh = this.queue.then(() => this.refresh());
    this.queue = refresh.catch(() => undefined);
    return refresh;
  }

  private async refresh(): Promise<ProjectSnapshot> {
    let opened: OpenedProject;
    try {
      opened = await openProject(this.projectRoot);
    } catch (error) {
      // A malformed config file is not the transient filesystem race the
      // generic failure message describes, retrying cannot fix it. Name the
      // file so the agent knows what to repair.
      throw new ToolFailure(
        `This project's \`${CONFIG_FILE_NAME}\` could not be loaded: ${(error as Error).message}. ` +
          'Fix that file first; retrying the call will fail the same way until it parses.',
      );
    }
    const { config, root, resolver } = opened;
    const fingerprint = await fingerprintProject(this.projectRoot, opened.docsRootPath, config);

    const cached = this.snapshot;
    if (cached !== undefined && cached.fingerprint === fingerprint) {
      return cached;
    }

    const sources = await scanSources(this.projectRoot, scanOptionsFrom(config));
    const manifest = await buildManifest({
      sources,
      resolver,
      root,
      docsRoot: config.docsRoot,
      indexes: config.indexes,
      staleness: config.staleness,
    });

    const snapshot = new ProjectSnapshot(this.projectRoot, config, root, manifest, fingerprint);
    this.snapshot = snapshot;
    return snapshot;
  }
}
