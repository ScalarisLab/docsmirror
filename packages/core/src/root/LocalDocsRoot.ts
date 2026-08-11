import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeDocsPath } from '../pointer/parse';
import type { DocFile, DocsRoot } from './DocsRoot';

export interface LocalDocsRootOptions {
  /** Extensions tried when a pointer omits one. Defaults to `.md` then `.markdown`. */
  readonly extensions?: readonly string[];
  /** Directory names never walked by `list()`. */
  readonly ignoredDirectories?: readonly string[];
}

const DEFAULT_EXTENSIONS = ['.md', '.markdown'] as const;
const DEFAULT_IGNORED = ['node_modules', '.git', 'dist', 'out'] as const;

interface CacheEntry {
  readonly mtimeMs: number;
  readonly file: DocFile;
}

/** A docs root backed by a folder on disk. */
export class LocalDocsRoot implements DocsRoot {
  readonly id: string;

  private readonly directory: string;
  private readonly extensions: readonly string[];
  private readonly ignoredDirectories: ReadonlySet<string>;
  private readonly cache = new Map<string, CacheEntry>();
  private listing: readonly string[] | undefined;

  constructor(directory: string, options: LocalDocsRootOptions = {}) {
    this.directory = nodePath.resolve(directory);
    this.id = this.directory;
    this.extensions = options.extensions ?? DEFAULT_EXTENSIONS;
    this.ignoredDirectories = new Set(options.ignoredDirectories ?? DEFAULT_IGNORED);
  }

  /** Absolute path of the folder backing this root. */
  get rootDirectory(): string {
    return this.directory;
  }

  /**
   * Absolute path a docs-root-relative path maps to, or `undefined` when the
   * path would escape the root.
   */
  absolutePathOf(path: string): string | undefined {
    const normalized = normalizeDocsPath(path);
    const absolute = nodePath.resolve(this.directory, normalized);
    const relative = nodePath.relative(this.directory, absolute);
    if (relative.startsWith('..') || nodePath.isAbsolute(relative)) {
      return undefined;
    }
    return absolute;
  }

  async read(path: string): Promise<DocFile | undefined> {
    const normalized = normalizeDocsPath(path);
    for (const candidate of this.candidatePaths(normalized)) {
      const file = await this.readExact(candidate);
      if (file !== undefined) {
        return file;
      }
    }
    return undefined;
  }

  async list(): Promise<readonly string[]> {
    if (this.listing === undefined) {
      const found: string[] = [];
      await this.walk(this.directory, '', found);
      this.listing = found.sort();
    }
    return this.listing;
  }

  /** Writes a document, creating its parent directories when they do not exist yet. */
  async write(path: string, content: string): Promise<void> {
    const absolute = this.absolutePathOf(path);
    if (absolute === undefined) {
      throw new Error(`Refusing to write outside the docs root: ${path}`);
    }
    await fs.mkdir(nodePath.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, 'utf8');
    this.invalidate();
  }

  invalidate(path?: string): void {
    this.listing = undefined;
    if (path === undefined) {
      this.cache.clear();
      return;
    }
    for (const candidate of this.candidatePaths(normalizeDocsPath(path))) {
      this.cache.delete(candidate);
    }
  }

  /** The paths tried for a pointer, so `guide` also finds `guide.md`. */
  private candidatePaths(normalized: string): string[] {
    if (nodePath.extname(normalized) !== '') {
      return [normalized];
    }
    return this.extensions.map((extension) => `${normalized}${extension}`);
  }

  private async readExact(path: string): Promise<DocFile | undefined> {
    const absolute = this.absolutePathOf(path);
    if (absolute === undefined) {
      return undefined;
    }
    let stats;
    try {
      stats = await fs.stat(absolute);
    } catch {
      return undefined;
    }
    if (!stats.isFile()) {
      return undefined;
    }

    const cached = this.cache.get(path);
    if (cached !== undefined && cached.mtimeMs === stats.mtimeMs) {
      return cached.file;
    }

    const file: DocFile = {
      path,
      content: await fs.readFile(absolute, 'utf8'),
      lastModified: stats.mtime,
      uri: pathToFileURL(absolute).toString(),
    };
    this.cache.set(path, { mtimeMs: stats.mtimeMs, file });
    return file;
  }

  private async walk(absolute: string, prefix: string, found: string[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!this.ignoredDirectories.has(entry.name) && !entry.name.startsWith('.')) {
          await this.walk(nodePath.join(absolute, entry.name), `${prefix}${entry.name}/`, found);
        }
      } else if (entry.isFile() && this.extensions.includes(nodePath.extname(entry.name))) {
        found.push(`${prefix}${entry.name}`);
      }
    }
  }
}
