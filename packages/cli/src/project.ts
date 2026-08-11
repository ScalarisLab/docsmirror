import { promises as fs } from 'node:fs';
import {
  openProject,
  scanOptionsFrom,
  scanSources,
  type DocsMirrorConfig,
  type DocsResolver,
  type LocalDocsRoot,
  type SourceDocument,
} from '@docsmirror/core';

/** Command-line overrides that change how a project is read. */
export interface ProjectOverrides {
  readonly docsOverride?: string | undefined;
  readonly includeOverride?: readonly string[] | undefined;
  readonly excludeAdditions?: readonly string[];
}

export interface LoadedProject {
  readonly projectRoot: string;
  readonly docsRootPath: string;
  readonly config: DocsMirrorConfig;
  readonly root: LocalDocsRoot;
  readonly resolver: DocsResolver;
  readonly sources: readonly SourceDocument[];
}

/** A usage error: a bad flag, an unreadable config, a docs root that is not there. */
export class ProjectError extends Error {}

/**
 * Everything both `check` and `manifest` need. Opening goes through core's
 * `openProject`, the same call the MCP server and the web app make, so the
 * commands can never disagree with the other surfaces about what the project
 * contains. What is CLI-specific stays here: a missing docs root is a usage
 * error, and the sources are scanned up front because both commands consume
 * them immediately.
 */
export async function loadProject(
  projectRootInput: string,
  overrides: ProjectOverrides = {},
): Promise<LoadedProject> {
  let opened;
  try {
    opened = await openProject(projectRootInput, {
      ...(overrides.docsOverride === undefined ? {} : { docsRoot: overrides.docsOverride }),
      ...(overrides.includeOverride === undefined ? {} : { include: overrides.includeOverride }),
      ...(overrides.excludeAdditions === undefined ? {} : { excludeAdditions: overrides.excludeAdditions }),
    });
  } catch (error) {
    throw new ProjectError((error as Error).message);
  }

  let docsRootStat;
  try {
    docsRootStat = await fs.stat(opened.docsRootPath);
  } catch {
    throw new ProjectError(`docs root not found: ${opened.docsRootPath}`);
  }
  if (!docsRootStat.isDirectory()) {
    throw new ProjectError(`docs root is not a directory: ${opened.docsRootPath}`);
  }

  return {
    projectRoot: opened.projectRoot,
    docsRootPath: opened.docsRootPath,
    config: opened.config,
    root: opened.root,
    resolver: opened.resolver,
    sources: await scanSources(opened.projectRoot, scanOptionsFrom(opened.config)),
  };
}
