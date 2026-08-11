import {
  MANIFEST_FILE_NAME,
  findOrphanDocuments,
  manifestsEqual,
  readManifest,
  reportFor,
  resolveSources,
  type ResolvedSource,
  type ValidationIssue,
} from '@docsmirror/core';
import { loadProject, ProjectError, type LoadedProject } from '../project';
import { generateManifest } from './manifest';
import { formatHuman } from '../report/human';
import { formatJson } from '../report/json';
import type { ReportSummary } from '../report/json';

export interface CheckOptions {
  readonly projectRoot: string;
  readonly docsOverride: string | undefined;
  readonly orphans: boolean;
  readonly includeOverride: readonly string[] | undefined;
  readonly excludeAdditions: readonly string[];
  readonly json: boolean;
  readonly quiet: boolean;
  /** Fail when the project has no manifest at all, not only when it drifted. */
  readonly requireManifest: boolean;
}

export interface CheckResult {
  readonly exitCode: number;
  readonly output: string;
}

function manifestIssue(file: string, message: string, suggestion: string | undefined): ValidationIssue {
  return { kind: 'manifest-stale', severity: 'error', file, target: undefined, range: undefined, message, suggestion };
}

/**
 * Compares the committed manifest with what the documentation describes now.
 * A project that has no manifest is not failed unless it asked to be.
 * @docs manifest.md#keeping-it-current
 */
async function checkManifest(
  project: LoadedProject,
  required: boolean,
  resolved: readonly ResolvedSource[],
  orphansOf: () => Promise<readonly ValidationIssue[]>,
): Promise<ValidationIssue[]> {
  let existing;
  try {
    existing = await readManifest(project.projectRoot, MANIFEST_FILE_NAME);
  } catch (error) {
    return [manifestIssue(MANIFEST_FILE_NAME, (error as Error).message, undefined)];
  }

  if (existing === undefined) {
    return required
      ? [manifestIssue(MANIFEST_FILE_NAME, 'No manifest found.', 'Run `docsmirror manifest` to create it.')]
      : [];
  }
  if (manifestsEqual(existing, await generateManifest(project, resolved, await orphansOf()))) {
    return [];
  }
  return [
    manifestIssue(
      MANIFEST_FILE_NAME,
      'The manifest no longer describes the documentation on disk.',
      'Run `docsmirror manifest` to regenerate it.',
    ),
  ];
}

/**
 * Runs `docsmirror check`: scans a project's sources, resolves every pointer
 * against the docs root, and optionally reports orphaned documents and a
 * manifest that has drifted.
 */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
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

  const resolved = await resolveSources(project.sources, project.resolver);
  const report = reportFor(resolved, project.resolver.root.id);
  const issues: ValidationIssue[] = [...report.issues];

  // Orphan detection walks every document and the whole link graph, and only
  // two consumers exist: `--orphans` and the comparison against a committed
  // manifest. Memoized laziness makes the common no-manifest, no-flag run skip
  // the walk entirely, while a run that needs both still pays only once.
  let orphans: readonly ValidationIssue[] | undefined;
  const orphansOf = async (): Promise<readonly ValidationIssue[]> => {
    orphans ??= await findOrphanDocuments(project.root, report.referencedDocuments, project.config.indexes);
    return orphans;
  };
  if (options.orphans) {
    issues.push(...(await orphansOf()));
  }
  issues.push(...(await checkManifest(project, options.requireManifest, resolved, orphansOf)));

  const summary: ReportSummary = {
    scannedFiles: report.scannedFiles,
    pointerCount: report.pointerCount,
    resolvedCount: report.resolvedCount,
    issueCount: issues.length,
  };
  const ok = issues.length === 0;

  const output = options.json
    ? formatJson({ ok, summary, issues })
    : formatHuman({
        issues,
        summary,
        quiet: options.quiet,
        context: `Checked ${project.projectRoot} (docs root: ${project.docsRootPath})`,
      });

  return { exitCode: ok ? 0 : 1, output };
}
