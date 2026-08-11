/**
 * One project root: its configuration, its docs root and the resolver every
 * feature reads pointers through.
 * @docs server.md#workspaces
 */

import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { DocsResolver, LocalDocsRoot, loadConfig, matchesAny, type DocsMirrorConfig } from '@scalarislab/docsmirror-core';
import type { DocsMirrorSettings } from '../settings';
import { relativePosix } from './paths';

export class Workspace {
  private constructor(
    /** Absolute path of the project root, the folder holding the config file. */
    readonly rootPath: string,
    readonly config: DocsMirrorConfig,
    readonly root: LocalDocsRoot,
    readonly resolver: DocsResolver,
    /**
     * Whether the docs root is a folder that exists. When it is not, no pointer
     * in this project can resolve, and saying so once beats saying "document
     * missing" about every pointer in the file.
     */
    readonly docsRootExists: boolean,
  ) {}

  static async create(rootPath: string, settings: DocsMirrorSettings): Promise<Workspace> {
    const absoluteRoot = nodePath.resolve(rootPath);
    const overrides = {
      ...(settings.docsRoot === undefined ? {} : { docsRoot: settings.docsRoot }),
      ...(Object.keys(settings.staleness).length === 0 ? {} : { staleness: settings.staleness }),
    };
    const { config } = await loadConfig(absoluteRoot, overrides);
    const root = new LocalDocsRoot(nodePath.resolve(absoluteRoot, config.docsRoot));
    const resolver = new DocsResolver(root, { staleness: config.staleness });
    const exists = await fs
      .stat(root.rootDirectory)
      .then((entry) => entry.isDirectory())
      .catch(() => false);
    return new Workspace(absoluteRoot, config, root, resolver, exists);
  }

  /** Absolute path of the folder documents are read from. */
  get docsDirectory(): string {
    return this.root.rootDirectory;
  }

  /**
   * Whether a source file is one the project scans for pointers. Sharing the
   * include/exclude lists with the CLI keeps the editor from flagging files
   * `docsmirror check` never looks at, markdown above all.
   */
  scansSource(filePath: string): boolean {
    const relative = relativePosix(this.rootPath, filePath);
    if (relative === undefined) {
      return true;
    }
    return !matchesAny(relative, this.config.exclude) && matchesAny(relative, this.config.include);
  }

  /** The docs-root-relative path of a document, or `undefined` when it is elsewhere. */
  docsPathOf(filePath: string): string | undefined {
    return relativePosix(this.docsDirectory, filePath);
  }

  /** Drops cached state for a changed document, or for the whole root. */
  invalidate(filePath?: string): void {
    if (filePath === undefined) {
      this.root.invalidate();
      return;
    }
    const docsPath = this.docsPathOf(filePath);
    if (docsPath !== undefined) {
      this.root.invalidate(docsPath);
    }
  }
}
