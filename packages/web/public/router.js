/**
 * The address bar is the app's state. Every navigation is a hash of the form
 * `#doc=<path>&anchor=<slug>&view=edit&history=page`, so links inside rendered
 * markdown are ordinary links and the back button works.
 *
 * Reading is the default state: `view` and `history` stay out of the address
 * until the reader asks for them.
 */

/**
 * `read` and `edit` are two states of a document; `index`, `manifest` and
 * `health` describe the whole documentation set and ignore `doc` entirely.
 */
const VIEWS = ['read', 'edit', 'index', 'manifest', 'health'];
const HISTORIES = ['page', 'repository'];

export function currentRoute() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const view = params.get('view');
  const history = params.get('history');
  return {
    doc: params.get('doc') ?? undefined,
    anchor: params.get('anchor') ?? undefined,
    view: VIEWS.includes(view) ? view : 'read',
    history: HISTORIES.includes(history) ? history : undefined,
  };
}

export function hrefFor(route) {
  const params = new URLSearchParams();
  if (route.doc) {
    params.set('doc', route.doc);
  }
  if (route.anchor) {
    params.set('anchor', route.anchor);
  }
  if (route.view && route.view !== 'read') {
    params.set('view', route.view);
  }
  if (route.history) {
    params.set('history', route.history);
  }
  return `#${params.toString()}`;
}

/** Moves to a route built from the current one plus the given changes. */
export function navigate(changes, { replace = false } = {}) {
  const next = hrefFor({ ...currentRoute(), ...changes });
  if (next === location.hash || (location.hash === '' && next === '#')) {
    return;
  }
  if (replace) {
    history.replaceState(null, '', next);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = next;
  }
}

export function onRouteChange(listener) {
  window.addEventListener('hashchange', listener);
}
