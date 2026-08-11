import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { HistoryService } from './history';
import { DocsProject } from './project';
import { ASSET_TYPES } from './static';

export interface ExportOptions {
  /** The project whose documentation is being exported. */
  readonly projectRoot: string;
  /** Where the static site is written. Created if it does not exist. */
  readonly outDir: string;
}

export interface ExportSummary {
  readonly outDir: string;
  readonly documents: number;
  readonly assets: number;
  /** Whether git history was readable and baked in. */
  readonly history: boolean;
}

/** The folder holding the front end, a sibling of the compiled `dist`. */
const PUBLIC_DIRECTORY = nodePath.resolve(__dirname, '..', 'public');

/**
 * The bundle `esbuild.js` compiles `search.ts` into for the browser. A
 * sibling of this file once both are compiled, `dist/export.js` next to
 * `dist/browser/search.js`.
 */
const BROWSER_SEARCH_BUNDLE = nodePath.resolve(__dirname, 'browser', 'search.js');

/**
 * The address a document path is exported to, and the address the browser
 * fetches it from: `api.js`'s static-mode reads mirror this exactly.
 * @docs web.md#static-export
 */
function encodeDocPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(nodePath.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value));
}

async function copyFile(from: string, to: string): Promise<void> {
  await fs.mkdir(nodePath.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

/** Copies everything in `public/`, the same tree the live server reads requests from. */
async function copyPublicAssets(outDir: string): Promise<void> {
  await fs.cp(PUBLIC_DIRECTORY, outDir, { recursive: true });
}

/**
 * Marks the copied `index.html` as a static export, so `api.js` reads from
 * the baked-in files instead of calling `/api/*`. One line, injected once,
 * rather than a second `index.html` to keep in sync with the live one.
 */
async function markIndexStatic(outDir: string): Promise<void> {
  const path = nodePath.join(outDir, 'index.html');
  const html = await fs.readFile(path, 'utf8');
  const marker = '<script>window.__DOCSMIRROR_STATIC__ = true;</script>\n    ';
  if (!html.includes('<script type="module" src="app.js">')) {
    throw new Error('index.html no longer has the expected app.js script tag; static export needs updating.');
  }
  await fs.writeFile(path, html.replace('<script type="module" src="app.js">', `${marker}<script type="module" src="app.js">`));
}

/** Walks the docs root and copies every file `/asset` would have served. */
async function copyAssets(docsRootAbsolute: string, outDir: string): Promise<number> {
  let count = 0;
  const walk = async (absoluteDir: string, relativeDir: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = relativeDir.length > 0 ? `${relativeDir}/${entry.name}` : entry.name;
      const absolute = nodePath.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) {
          continue;
        }
        await walk(absolute, relative);
        continue;
      }
      if (!ASSET_TYPES.has(nodePath.extname(entry.name).toLowerCase())) {
        continue;
      }
      await copyFile(absolute, nodePath.join(outDir, 'assets', ...relative.split('/')));
      count += 1;
    }
  };
  await walk(docsRootAbsolute, '');
  return count;
}

/** An image's exported address, mirroring `encodeDocPath` under `assets/`. */
function staticAssetUrl(path: string): string {
  return `assets/${encodeDocPath(path)}`;
}

/**
 * Writes a read-only, static copy of the documentation app: the same `public/`
 * front end, reading from JSON baked in at export time instead of a live
 * server. Every document, the manifest, health, emphasis, git history and the
 * search index are all included; editing and comparing two arbitrary
 * revisions are not, because both need a live server to act on the working
 * tree, and a static host has none.
 * @docs web.md#static-export
 */
export async function exportStaticSite(options: ExportOptions): Promise<ExportSummary> {
  const projectRoot = nodePath.resolve(options.projectRoot);
  const outDir = nodePath.resolve(options.outDir);
  const project = await DocsProject.open(projectRoot);
  const history = new HistoryService(project);

  await fs.rm(outDir, { recursive: true, force: true });
  await copyPublicAssets(outDir);
  await markIndexStatic(outDir);
  await fs.writeFile(nodePath.join(outDir, '.nojekyll'), '');
  await copyFile(BROWSER_SEARCH_BUNDLE, nodePath.join(outDir, 'data', 'search.js'));

  const manifest = await project.manifestNow();
  await writeJson(nodePath.join(outDir, 'data', 'manifest.json'), manifest);
  await writeJson(nodePath.join(outDir, 'data', 'health.json'), await project.healthNow());
  await writeJson(nodePath.join(outDir, 'data', 'corpus.json'), await project.documentsNow());

  const graph = await history.graph();
  await writeJson(nodePath.join(outDir, 'data', 'history', 'graph.json'), graph);
  const historyAvailable = 'available' in graph ? graph.available : true;

  for (const node of manifest.nodes) {
    const payload = await project.readDocument(node.path, { assetUrl: staticAssetUrl });
    await writeJson(nodePath.join(outDir, 'data', 'doc', `${encodeDocPath(node.path)}.json`), payload ?? null);
    await writeJson(
      nodePath.join(outDir, 'data', 'emphasis', `${encodeDocPath(node.path)}.json`),
      (await project.emphasisOf(node.path)) ?? null,
    );
    await writeJson(
      nodePath.join(outDir, 'data', 'history', 'timeline', `${encodeDocPath(node.path)}.json`),
      await history.timeline(node.path),
    );
  }

  const assets = await copyAssets(project.root.rootDirectory, outDir);

  return { outDir, documents: manifest.nodes.length, assets, history: historyAvailable };
}
