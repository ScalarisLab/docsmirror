/**
 * A cheap signature of everything a manifest is built from.
 *
 * The manifest describes documents *and* the code pointing at them, so a
 * signature that only watched the docs root would keep serving an agent
 * references that no longer exist. The walk stats files instead of reading
 * them, which is what makes it affordable on every call.
 * @docs manifest.md#keeping-it-current
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { matchesAny, type DocsMirrorConfig } from '@docsmirror/core';

/** Extensions `LocalDocsRoot` serves, and therefore the ones worth watching. */
const DOC_EXTENSIONS = ['.md', '.markdown'];

/** Directory names never walked when collecting documents. */
const IGNORED_DOC_DIRECTORIES = ['node_modules', '.git'];

/** One file's contribution: its path, size and modification time. */
async function stamp(absolute: string, key: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(absolute);
    return `${key}:${stats.size}:${stats.mtimeMs}`;
  } catch {
    return undefined;
  }
}

/** Every markdown file under the docs root, whatever the scan configuration excludes. */
async function documentStamps(docsDirectory: string): Promise<string[]> {
  const stamps: string[] = [];

  const walk = async (absolute: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = nodePath.join(absolute, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DOC_DIRECTORIES.includes(entry.name)) {
          await walk(child, `${prefix}${entry.name}/`);
        }
        continue;
      }
      if (!entry.isFile() || !DOC_EXTENSIONS.includes(nodePath.extname(entry.name).toLowerCase())) {
        continue;
      }
      const entryStamp = await stamp(child, `doc/${prefix}${entry.name}`);
      if (entryStamp !== undefined) {
        stamps.push(entryStamp);
      }
    }
  };

  await walk(docsDirectory, '');
  return stamps;
}

/**
 * Every file the pointer scan would read. The include/exclude rules are the
 * configured ones, so the signature covers exactly the files a rebuild reads.
 */
async function sourceStamps(projectRoot: string, config: DocsMirrorConfig): Promise<string[]> {
  const stamps: string[] = [];

  const walk = async (absolute: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      const child = nodePath.join(absolute, entry.name);
      if (entry.isDirectory()) {
        if (!matchesAny(`${relative}/`, config.exclude) && !matchesAny(relative, config.exclude)) {
          await walk(child, `${relative}/`);
        }
        continue;
      }
      if (!entry.isFile() || matchesAny(relative, config.exclude) || !matchesAny(relative, config.include)) {
        continue;
      }
      const entryStamp = await stamp(child, `src/${relative}`);
      if (entryStamp !== undefined) {
        stamps.push(entryStamp);
      }
    }
  };

  await walk(projectRoot, '');
  return stamps;
}

/**
 * Signature of a project's documentation surface. Two calls returning the same
 * string mean nothing a manifest depends on has changed, including the
 * configuration, which is folded in so a changed docs root rebuilds too.
 */
export async function fingerprintProject(
  projectRoot: string,
  docsDirectory: string,
  config: DocsMirrorConfig,
): Promise<string> {
  const [documents, sources] = await Promise.all([
    documentStamps(docsDirectory),
    sourceStamps(projectRoot, config),
  ]);
  const hash = createHash('sha1');
  hash.update(JSON.stringify(config));
  for (const entry of [...documents, ...sources].sort()) {
    hash.update('\n');
    hash.update(entry);
  }
  return hash.digest('hex');
}
