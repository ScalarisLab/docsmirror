/**
 * Which project owns a file.
 *
 * An editor window is not a project. People open a folder holding several
 * checkouts, or a monorepo whose packages each document themselves, and a file
 * in `containers/api/src/` has nothing to do with a docs root at the top of the
 * window. Resolving from the window would report every pointer in every project
 * as broken, the loudest possible way for this tool to be wrong.
 *
 * So ownership is decided from the file, walking up: the nearest project that
 * declares itself, then the nearest that looks like one and has documentation,
 * then the nearest that merely has documentation. The workspace folder is the
 * floor and the last resort, never walk above what the user opened.
 * @docs server.md#finding-the-project-root
 */

import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { CONFIG_FILE_NAME } from '@scalarislab/docsmirror-core';
import { contains } from './paths';

/**
 * Files that mark the root of a project. One per ecosystem we can name; the
 * list is a heuristic and is only ever consulted alongside a docs folder, so a
 * missing entry costs a fallback, never a wrong answer.
 */
const PROJECT_MARKERS = [
  'package.json',
  '.git',
  'pyproject.toml',
  'setup.py',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'Gemfile',
  'mix.exs',
  'pubspec.yaml',
  'CMakeLists.txt',
];

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function hasProjectMarker(directory: string): Promise<boolean> {
  for (const marker of PROJECT_MARKERS) {
    if (await exists(nodePath.join(directory, marker))) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the project root owning a file, caching the answer per directory.
 *
 * The cache matters: this runs on every hover, every keystroke's diagnostics
 * and every marker redraw, and each miss is a handful of `stat` calls up the
 * tree. It is dropped whenever a configuration file or the docs root name
 * changes, which are the only things that can change an answer.
 */
export class ProjectRootFinder {
  private readonly cache = new Map<string, string>();

  constructor(private docsRootName: string) {}

  /** The root owning `filePath`, never above `boundary`. */
  async find(filePath: string, boundary: string): Promise<string> {
    const floor = nodePath.resolve(boundary);
    const start = nodePath.dirname(nodePath.resolve(filePath));
    if (!contains(floor, start)) {
      return floor;
    }
    const key = `${floor}\0${start}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const root = await this.walk(start, floor);
    this.cache.set(key, root);
    return root;
  }

  /** Forgets every answer. Cheap, and always safe. */
  clear(docsRootName?: string): void {
    if (docsRootName !== undefined) {
      this.docsRootName = docsRootName;
    }
    this.cache.clear();
  }

  /** Every directory from the file's own up to the boundary, nearest first. */
  private chainTo(start: string, floor: string): string[] {
    const chain: string[] = [];
    let directory = start;
    for (;;) {
      chain.push(directory);
      if (directory === floor) {
        return chain;
      }
      const parent = nodePath.dirname(directory);
      if (parent === directory) {
        return chain;
      }
      directory = parent;
    }
  }

  private async walk(start: string, floor: string): Promise<string> {
    const chain = this.chainTo(start, floor);

    for (const directory of chain) {
      if (await exists(nodePath.join(directory, CONFIG_FILE_NAME))) {
        return directory;
      }
    }

    let withDocsOnly: string | undefined;
    for (const directory of chain) {
      if (!(await isDirectory(nodePath.join(directory, this.docsRootName)))) {
        continue;
      }
      if (await hasProjectMarker(directory)) {
        return directory;
      }
      withDocsOnly ??= directory;
    }

    return withDocsOnly ?? floor;
  }
}
