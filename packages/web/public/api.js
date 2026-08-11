/** The only place the app talks to the server. */

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

export function fetchManifest() {
  return getJson('/api/manifest');
}

export function fetchHealth() {
  return getJson('/api/health');
}

export function fetchDocument(path) {
  return getJson('/api/doc', { path });
}

/** The term this document leans on harder than the corpus does, or `null`. */
export function fetchEmphasis(path) {
  return getJson('/api/emphasis', { path });
}

export function search(query) {
  return getJson('/api/search', { q: query });
}

export function fetchGraph() {
  return getJson('/api/history/graph');
}

export function fetchTimeline(path) {
  return getJson('/api/history/file', { path });
}

export function fetchDiff(path, from, to) {
  return getJson('/api/history/diff', { path, from, to });
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
