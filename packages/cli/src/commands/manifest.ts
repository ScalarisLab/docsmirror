import {
  MANIFEST_FILE_NAME,
  buildManifest,
  manifestsEqual,
  readManifest,
  serializeManifest,
  writeManifest,
  type DocsManifest,
  type ResolvedSource,
  type ValidationIssue,
} from '@docsmirror/core';
import { loadProject, ProjectError, type LoadedProject } from '../project';
import { pluralize } from '../report/human';

export interface ManifestOptions {
  readonly projectRoot: string;
  readonly docsOverride: string | undefined;
  readonly includeOverride: readonly string[] | undefined;
  readonly excludeAdditions: readonly string[];
  /** Verify the file on disk instead of writing it. */
  readonly checkOnly: boolean;
  /** Print to stdout instead of writing the file. */
  readonly toStdout: boolean;
  readonly fileName: string;
}

export interface ManifestResult {
  readonly exitCode: number;
  readonly output: string;
}

/**
 * Builds the manifest a project's documentation currently describes.
 *
 * `resolved` and `orphans` let a caller that already validated the project:
 * `docsmirror check` always has by the time it gets here, hand over that
 * work instead of paying for a second pass over every source and every
 * document just to compare against what is committed.
 */
export async function generateManifest(
  project: LoadedProject,
  resolved?: readonly ResolvedSource[],
  orphans?: readonly ValidationIssue[],
): Promise<DocsManifest> {
  return buildManifest({
    sources: project.sources,
    resolver: project.resolver,
    root: project.root,
    docsRoot: project.config.docsRoot,
    indexes: project.config.indexes,
    staleness: project.config.staleness,
    ...(resolved === undefined ? {} : { resolvedSources: resolved }),
    ...(orphans === undefined ? {} : { orphans }),
  });
}

/**
 * Runs `docsmirror manifest`: regenerates the documentation map, or verifies
 * that the committed one still matches.
 * @docs manifest.md#keeping-it-current
 */
export async function runManifest(options: ManifestOptions): Promise<ManifestResult> {
  let project: LoadedProject;
  try {
    project = await loadProject(options.projectRoot, {
      docsOverride: options.docsOverride,
      includeOverride: options.includeOverride,
      excludeAdditions: options.excludeAdditions,
    });
  } catch (error) {
    if (error instanceof ProjectError) {
      return { exitCode: 2, output: `docsmirror: ${error.message}\n` };
    }
    throw error;
  }

  const manifest = await generateManifest(project);

  if (options.toStdout) {
    return { exitCode: 0, output: serializeManifest(manifest) };
  }

  if (options.checkOnly) {
    let existing: DocsManifest | undefined;
    try {
      existing = await readManifest(project.projectRoot, options.fileName);
    } catch (error) {
      return { exitCode: 2, output: `docsmirror: ${(error as Error).message}\n` };
    }
    if (existing === undefined) {
      return {
        exitCode: 1,
        output: `${options.fileName} does not exist. Run \`docsmirror manifest\` to create it.\n`,
      };
    }
    if (!manifestsEqual(existing, manifest)) {
      return {
        exitCode: 1,
        output: `${options.fileName} is out of date. Run \`docsmirror manifest\` to regenerate it.\n`,
      };
    }
    return { exitCode: 0, output: `${options.fileName} is up to date.\n` };
  }

  const path = await writeManifest(project.projectRoot, manifest, options.fileName);
  const { documents, anchors, references } = manifest.stats;
  const counted = [
    pluralize(documents, 'document'),
    pluralize(anchors, 'anchor'),
    pluralize(references, 'code reference'),
  ].join(', ');
  return { exitCode: 0, output: `Wrote ${path}\n${counted}.\n` };
}

export { MANIFEST_FILE_NAME };
