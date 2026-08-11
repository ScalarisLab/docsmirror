/**
 * The only place the app talks to the server, or, on a static export, the
 * only place it reads the files that stand in for one. `docsmirror export`
 * marks the page with `window.__DOCSMIRROR_STATIC__` before `app.js` runs, so
 * every function here decides once, at load, rather than on every call.
 * @docs web.md#static-export
 */

export const STATIC = Boolean(window.__DOCSMIRROR_STATIC__);

const UNAVAILABLE_HISTORY = { available: false, reason: 'This project has no readable git history.' };

/** Mirrors `encodeDocPath` in `export.ts`: the address a path was exported to. */
function encodeDocPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function getJson(path, params) {
  const url = new URL(path, location.origin);
  for (const [name, value] of Object.entries(params ?? {})) {
    url.searchParams.set(name, value);
  }
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(body?.error ?? `The server answered ${response.status}.`);
  }
  return body;
}

async function getStatic(path) {
  const response = await fetch(new URL(path, location.href));
  if (!response.ok) {
    throw new Error(`${path} could not be read (${response.status}).`);
  }
  return response.json();
}

export function fetchManifest() {
  return STATIC ? getStatic('data/manifest.json') : getJson('/api/manifest');
}

export function fetchHealth() {
  return STATIC ? getStatic('data/health.json') : getJson('/api/health');
}

export function fetchDocument(path) {
  return STATIC ? getStatic(`data/doc/${encodeDocPath(path)}.json`) : getJson('/api/doc', { path });
}

/** The term this document leans on harder than the corpus does, or `null`. */
export function fetchEmphasis(path) {
  return STATIC ? getStatic(`data/emphasis/${encodeDocPath(path)}.json`) : getJson('/api/emphasis', { path });
}

/**
 * The corpus baked in for static search, read once and kept for the life of
 * the page: every keystroke searches it again, and it does not change.
 */
let staticCorpus;

/**
 * The same query logic `/api/search` runs, bundled for the browser by
 * `esbuild.js` from the exact `search.ts` the server uses.
 * @docs web.md#static-export
 */
async function staticSearch(query) {
  staticCorpus ??= getStatic('data/corpus.json');
  const [{ searchIndexed }, corpus] = await Promise.all([import('./data/search.js'), staticCorpus]);
  return searchIndexed(corpus, query);
}

export function search(query) {
  return STATIC ? staticSearch(query) : getJson('/api/search', { q: query });
}

export function fetchGraph() {
  return STATIC ? getStatic('data/history/graph.json') : getJson('/api/history/graph');
}

export function fetchTimeline(path) {
  return STATIC
    ? getStatic(`data/history/timeline/${encodeDocPath(path)}.json`)
    : getJson('/api/history/file', { path });
}

/**
 * A static export has no live git to run an arbitrary diff against, and no
 * working tree to compare against either, so this answers exactly what a
 * project with no readable history answers: the reader is told plainly
 * rather than met with a control that always fails.
 */
export function fetchDiff(path, from, to) {
  return STATIC ? Promise.resolve(UNAVAILABLE_HISTORY) : getJson('/api/history/diff', { path, from, to });
}

export async function saveDocument(path, markdown) {
  const response = await fetch('/api/doc', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, markdown }),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(body?.error ?? `The document was not saved (${response.status}).`);
  }
  return body;
}

/** History endpoints answer this shape instead of failing when git is absent. */
export function isUnavailable(answer) {
  return Boolean(answer) && answer.available === false;
}
