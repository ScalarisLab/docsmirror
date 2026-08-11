/**
 * Reading, writing and comparing the manifest file.
 *
 * The manifest is generated, so the only question ever asked of the file on
 * disk is whether it still matches what generation produces. Everything the
 * clock and the filesystem contribute, `generatedAt`, each node's
 * `lastModified` and `staleness`, is excluded from that comparison: git does
 * not preserve modification times, so a fresh clone would otherwise report
 * every committed manifest as stale, and staleness drifts with the calendar
 * even when nobody touched a document. Only authored content decides equality.
 * @docs manifest.md#keeping-it-current
 */
import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { MANIFEST_FILE_NAME, type DocsManifest } from './types';

/** Absolute path of a project's manifest. */
export function manifestPath(projectRoot: string, fileName: string = MANIFEST_FILE_NAME): string {
  return nodePath.resolve(projectRoot, fileName);
}

/** Stable JSON, newline-terminated, so a regeneration produces no spurious diff. */
export function serializeManifest(manifest: DocsManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** True when two manifests describe the same surface, whenever they were built. */
export function manifestsEqual(a: DocsManifest, b: DocsManifest): boolean {
  const authoredContent = ({ generatedAt: _generatedAt, nodes, ...rest }: DocsManifest): unknown => ({
    ...rest,
    nodes: nodes.map(({ lastModified: _lastModified, staleness: _staleness, ...node }) => node),
  });
  return JSON.stringify(authoredContent(a)) === JSON.stringify(authoredContent(b));
}

/** Reads a manifest, or `undefined` when the project has none yet. */
export async function readManifest(
  projectRoot: string,
  fileName: string = MANIFEST_FILE_NAME,
): Promise<DocsManifest | undefined> {
  const path = manifestPath(projectRoot, fileName);
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw new Error(`Cannot read ${path}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(raw) as DocsManifest;
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }
}

export async function writeManifest(
  projectRoot: string,
  manifest: DocsManifest,
  fileName: string = MANIFEST_FILE_NAME,
): Promise<string> {
  const path = manifestPath(projectRoot, fileName);
  await fs.writeFile(path, serializeManifest(manifest), 'utf8');
  return path;
}
