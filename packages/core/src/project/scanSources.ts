import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import type { DocsMirrorConfig } from '../config';
import type { SourceDocument } from '../validate/validate';
import { matchesAny } from '../util/glob';

export interface ScanOptions {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  /** Files above this size are skipped; generated bundles carry no pointers worth reading. */
  readonly maxFileBytes?: number;
}

const DEFAULT_MAX_FILE_BYTES = 1_000_000;

/** Detects binary content cheaply: a NUL byte in the first kilobyte. */
function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).includes(0);
}

/** Turns a configuration into scan options. */
export function scanOptionsFrom(config: DocsMirrorConfig): ScanOptions {
  return { include: config.include, exclude: config.exclude };
}

/**
 * Reads every source file of a project that a pointer could live in. Paths are
 * returned project-relative with forward slashes, the form issues report.
 * @docs cli.md#include-and-exclude
 */
export async function scanSources(projectRoot: string, options: ScanOptions): Promise<SourceDocument[]> {
  const root = nodePath.resolve(projectRoot);
  const maxBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const sources: SourceDocument[] = [];

  const walk = async (absolute: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        if (!matchesAny(`${relative}/`, options.exclude) && !matchesAny(relative, options.exclude)) {
          await walk(nodePath.join(absolute, entry.name), `${relative}/`);
        }
        continue;
      }
      if (!entry.isFile() || matchesAny(relative, options.exclude) || !matchesAny(relative, options.include)) {
        continue;
      }
      const filePath = nodePath.join(absolute, entry.name);
      const stats = await fs.stat(filePath);
      if (stats.size > maxBytes) {
        continue;
      }
      const buffer = await fs.readFile(filePath);
      if (isBinary(buffer)) {
        continue;
      }
      sources.push({ path: relative, text: buffer.toString('utf8') });
    }
  };

  await walk(root, '');
  return sources;
}
