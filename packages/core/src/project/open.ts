/**
 * The one way a project is opened.
 *
 * The CLI, the MCP server and the web app all promise the same thing: that
 * they describe the same project the same way. That promise is only as strong
 * as the code behind it, and three hand-rolled `loadConfig` → `LocalDocsRoot`
 * → `DocsResolver` sequences are three chances for it to drift. Opening lives
 * here, once; what each consumer layers on top, caching, fingerprinting,
 * error vocabulary, stays its own.
 */

import * as nodePath from 'node:path';
import { loadConfig, type DocsMirrorConfig } from '../config';
import { DocsResolver } from '../resolve/resolver';
import { LocalDocsRoot } from '../root/LocalDocsRoot';

/** What a caller may layer over the configuration file. */
export interface OpenProjectOverrides {
  readonly docsRoot?: string;
  /** Replaces the configured include list. */
  readonly include?: readonly string[];
  /** Appended to the configured exclude list, exclusions only ever grow. */
  readonly excludeAdditions?: readonly string[];
}

export interface OpenedProject {
  readonly projectRoot: string;
  /** Absolute path of the docs root. Not checked for existence here: what a missing root means differs per consumer. */
  readonly docsRootPath: string;
  readonly config: DocsMirrorConfig;
  readonly root: LocalDocsRoot;
  readonly resolver: DocsResolver;
}

export async function openProject(
  projectRoot: string,
  overrides: OpenProjectOverrides = {},
): Promise<OpenedProject> {
  const resolved = nodePath.resolve(projectRoot);
  const { config: loaded } = await loadConfig(resolved, {
    ...(overrides.docsRoot === undefined ? {} : { docsRoot: overrides.docsRoot }),
    ...(overrides.include === undefined ? {} : { include: overrides.include }),
  });
  const additions = overrides.excludeAdditions ?? [];
  const config = additions.length === 0 ? loaded : { ...loaded, exclude: [...loaded.exclude, ...additions] };
  const docsRootPath = nodePath.resolve(resolved, config.docsRoot);
  const root = new LocalDocsRoot(docsRootPath);
  return {
    projectRoot: resolved,
    docsRootPath,
    config,
    root,
    resolver: new DocsResolver(root, { staleness: config.staleness }),
  };
}
