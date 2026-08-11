import { fetchDocument, fetchEmphasis, fetchGraph, fetchHealth, fetchManifest, fetchTimeline } from './api.js';
import { ContentsDock, createShelf, fitShelf, ScrollSpy } from './contents.js';
import { clearDocumentHead, renderDocumentHead } from './docmeta.js';
import { clear, el, notice } from './dom.js';
import { createEditor } from './editor.js';
import { renderColophon, renderFolio } from './folio.js';
import { installHead } from './head.js';
import { renderHealthView } from './healthview.js';
import { renderNoteHistory, renderRepositoryGraph } from './historyview.js';
import { renderIndexView } from './indexview.js';
import { renderManifestView } from './manifestview.js';
import { renderProse, revealAnchor } from './reader.js';
import { incomingLinks, renderDependents } from './refs.js';
import { currentRoute, hrefFor, navigate, onRouteChange } from './router.js';
import { SearchFigure } from './search.js';
import { applyStoredTheme } from './settings.js';
import { ancestorsOf, buildTree, renderTree, twistIcon } from './tree.js';
import { buildWidgets, placeWidgets } from './widgets.js';

const dom = {
  searchSlot: document.getElementById('search-slot'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  tree: document.getElementById('tree'),
  sidebarFoot: document.getElementById('sidebar-foot'),
  masthead: document.getElementById('masthead'),
  folio: document.getElementById('folio'),
  mastheadRef: document.getElementById('masthead-ref'),
  mastheadTitle: document.getElementById('masthead-title'),
  column: document.getElementById('column'),
  colophon: document.getElementById('colophon'),
  announcer: document.getElementById('announcer'),
};

const head = installHead(dom.masthead);

const STATUS_TEXT = { idle: '', saved: 'Saved', saving: 'Saving…', edited: 'Edited' };

/** Complement of styles.css's `(max-width: 61.999rem)`: the margin exists from 62rem up. */
const HAS_MARGIN = window.matchMedia('(min-width: 62rem)');

/** Must match the width at which the contents becomes a lane in styles.css. */
const HAS_SHELF = window.matchMedia('(min-width: 82rem)');

/** Views that describe the whole documentation set rather than one document. */
const SURFACE_VIEWS = ['index', 'manifest', 'health'];

const state = {
  manifest: undefined,
  health: undefined,
  tree: undefined,
  incoming: new Map(),
  titles: new Map(),
  payload: undefined,
  expanded: new Set(),
  route: { doc: undefined, anchor: undefined, view: 'read', history: undefined },
};

const documentCache = new Map();
let activeEditor;
let statusNode;
/**
 * The last status asked for. The folio is drawn after the page, it names the
 * document, so it needs the payload, which means the editor's first "saved"
 * arrives before the status node exists. The status is kept and replayed onto
 * each fresh node instead of being lost to that ordering.
 */
let status = { kind: 'idle', detail: undefined };
/**
 * The history panel of the page currently drawn. Opening and closing history
 * does not redraw the page, so `applyRoute` needs a handle on the panel that is
 * already in the document.
 */
let historyPanel;
let spy;
let dock;
let placed;
let renderToken = 0;

function announce(text) {
  dom.announcer.textContent = text;
}

const searchFigure = new SearchFigure({
  onOpen: (href) => {
    location.hash = href;
  },
});

function nodeFor(path) {
  return state.manifest?.nodes.find((entry) => entry.path === path);
}

function setStatus(kind, detail) {
  status = { kind, detail };
  paintStatus();
}

function paintStatus() {
  if (statusNode === undefined) {
    return;
  }
  statusNode.className = `status status-${status.kind}`;
  statusNode.textContent = status.kind === 'error' ? (status.detail ?? 'Not saved') : (STATUS_TEXT[status.kind] ?? '');
}

/* ---------------------------------------------------------- the sidebar -- */

function toggleFolder(path) {
  if (state.expanded.has(path)) {
    state.expanded.delete(path);
  } else {
    state.expanded.add(path);
  }
  drawTree();
}

function drawTree() {
  renderTree(dom.tree, state.tree, {
    current: SURFACE_VIEWS.includes(state.route.view) ? undefined : state.route.doc,
    expanded: state.expanded,
    onToggle: toggleFolder,
  });
}

/**
 * Below the width the sidebar has no room to stay always open, `styles.css`
 * collapses it to this one line. It is still one tap away rather than gone
 * behind an icon nobody would guess at, it just stops pushing the document
 * below the fold on a screen too short to spare the room. Picking a document
 * closes it again, since a reader who just chose one is no longer choosing.
 * @docs web.md#finding-your-way
 */
function setSidebarOpen(open) {
  dom.sidebarToggle.setAttribute('aria-expanded', String(open));
  dom.tree.classList.toggle('is-open', open);
  dom.sidebarFoot.classList.toggle('is-open', open);
}

function initSidebarToggle() {
  clear(dom.sidebarToggle).append(el('span', { text: 'Browse the corpus' }), twistIcon());
  dom.sidebarToggle.addEventListener('click', () => {
    setSidebarOpen(dom.sidebarToggle.getAttribute('aria-expanded') !== 'true');
  });
}

function drawSidebarFoot() {
  const unresolved = state.health?.issues.filter((issue) => issue.kind !== 'orphan-doc').length;
  clear(dom.sidebarFoot).append(
    el('a', { class: 'tool', href: hrefFor({ view: 'index' }), text: 'Corpus index' }),
    el('a', { class: 'tool', href: hrefFor({ view: 'manifest' }), text: 'Manifest' }),
    el('a', { class: 'tool', href: hrefFor({ view: 'health' }) }, [
      'Health',
      unresolved === undefined || unresolved === 0
        ? null
        : el('span', { class: 'figure is-small is-caution', text: String(unresolved) }),
    ]),
  );
}

/* ---------------------------------------------------------- the history -- */

async function drawHistory(panel) {
  const { history, doc } = state.route;
  if (history === undefined) {
    panel.hidden = true;
    clear(panel);
    return;
  }

  panel.hidden = false;
  clear(panel).append(
    el('p', { class: 'apparatus-label' }, [
      'History',
      el('span', { class: 'history-switch' }, [
        el('button', {
          type: 'button',
          class: `tool${history === 'page' ? ' is-on' : ''}`,
          text: 'This page',
          onclick: () => navigate({ history: 'page' }),
        }),
        el('button', {
          type: 'button',
          class: `tool${history === 'repository' ? ' is-on' : ''}`,
          text: 'Whole repository',
          onclick: () => navigate({ history: 'repository' }),
        }),
        el('button', {
          type: 'button',
          class: 'tool',
          text: 'Close',
          onclick: () => navigate({ history: undefined }),
        }),
      ]),
    ]),
  );

  const body = el('div', { class: 'history-body' }, [el('p', { class: 'quiet', text: 'Reading git…' })]);
  panel.append(body);

  if (history === 'repository') {
    renderRepositoryGraph(body, await fetchGraph());
    return;
  }
  renderNoteHistory(body, { path: doc, timeline: await fetchTimeline(doc) });
}

/* ----------------------------------------------------- the whole surface -- */

async function drawSurface(view) {
  clear(dom.colophon);
  clearDocumentHead({ titleHost: dom.mastheadTitle, refHost: dom.mastheadRef });
  head.measure();
  statusNode = undefined;
  status = { kind: 'idle', detail: undefined };
  const surface = el('div', { class: 'surface' });
  clear(dom.column).append(surface);

  if (view === 'index') {
    renderIndexView(surface, { root: state.tree, manifest: state.manifest, current: undefined });
    return;
  }
  if (view === 'manifest') {
    renderManifestView(surface, state.manifest);
    return;
  }

  surface.append(el('p', { class: 'quiet', text: 'Resolving every pointer…' }));
  const token = renderToken;
  try {
    state.health = await fetchHealth();
  } catch (error) {
    clear(surface).append(notice('The pointers could not be checked.', error.message));
    return;
  }
  if (token !== renderToken) {
    return;
  }
  renderHealthView(clear(surface), { health: state.health, manifest: state.manifest });
  drawSidebarFoot();
}

/* ------------------------------------------------------------- the page -- */

async function loadDocument(path) {
  if (!documentCache.has(path)) {
    documentCache.set(path, fetchDocument(path));
  }
  return documentCache.get(path);
}

/**
 * The health report is what tells a widget that a pointer aimed at this page
 * does not resolve, so it is fetched once in the background rather than only
 * when someone opens the health view.
 */
async function ensureHealth() {
  if (state.health === undefined) {
    state.health = await fetchHealth().catch(() => ({ issues: [] }));
  }
  return state.health;
}

/**
 * Re-asks every question the layout answers: how far the head has to condense,
 * where each widget can float, and how far down the prose the contents stays
 * pinned. All three depend on the width, so all three are re-asked whenever it
 * changes, a seated widget and a released shelf are measurements, not choices.
 */
function relayout() {
  head.measure();
  if (placed === undefined) {
    return;
  }
  placeWidgets(placed.prose, placed.widgets, { floating: HAS_MARGIN.matches });
  fitShelf(placed.prose, placed.shelf, { floating: HAS_SHELF.matches });
}

function replaceWidgets(prose, widgets, shelf) {
  placed = { prose, widgets, shelf };
  placeWidgets(prose, widgets, { floating: HAS_MARGIN.matches });
  fitShelf(prose, shelf, { floating: HAS_SHELF.matches });
}

async function drawPage() {
  const token = (renderToken += 1);
  const { doc, view, anchor } = state.route;

  spy?.stop();
  spy = undefined;
  dock?.stop();
  dock = undefined;
  placed = undefined;
  setSidebarOpen(false);

  if (SURFACE_VIEWS.includes(view)) {
    state.payload = undefined;
    historyPanel = undefined;
    await drawSurface(view);
    return;
  }

  const node = nodeFor(doc);
  const body = clear(dom.column);

  if (!doc || node === undefined) {
    clear(dom.colophon);
    clearDocumentHead({ titleHost: dom.mastheadTitle, refHost: dom.mastheadRef });
    head.measure();
    state.payload = undefined;
    historyPanel = undefined;
    statusNode = undefined;
    status = { kind: 'idle', detail: undefined };
    body.append(
      notice('Pick a page to read.', 'Search above, or open the corpus index from the crumb at the top.'),
    );
    return;
  }

  let payload;
  try {
    payload = await loadDocument(doc);
  } catch (error) {
    if (token === renderToken) {
      body.append(notice(`${doc} could not be read.`, error.message));
    }
    return;
  }
  if (token !== renderToken) {
    return;
  }
  state.payload = payload;

  renderDocumentHead({ titleHost: dom.mastheadTitle, refHost: dom.mastheadRef, column: body }, { node, payload });
  head.measure();

  historyPanel = el('section', { class: 'history', hidden: true, 'aria-label': 'History' });
  body.append(historyPanel);

  if (view === 'edit') {
    // The previous document's colophon must not linger under the editor.
    clear(dom.colophon);
    activeEditor = createEditor({
      path: doc,
      markdown: payload.markdown,
      onStatus: setStatus,
      onSaved: (saved) => {
        documentCache.delete(doc);
        if (state.manifest && saved) {
          state.manifest = {
            ...state.manifest,
            nodes: state.manifest.nodes.map((entry) => (entry.path === saved.path ? saved : entry)),
          };
          rebuildDerived();
        }
      },
    });
    body.append(activeEditor.node);
    activeEditor.focus();
    return;
  }

  const prose = renderProse({ payload, node, announce });
  // The contents is a float at the head of the prose, so the prose wraps around
  // it from its first line: it is a column of the reading area, not a block
  // stacked above it.
  const shelf = createShelf({ node, docPath: doc });
  if (shelf !== undefined) {
    prose.prepend(shelf);
  }
  body.append(prose);

  const dependents = el('div', { class: 'dependents' });
  renderDependents(dependents, {
    node,
    linkedFrom: state.incoming.get(doc),
    titleOf: state.titles,
  });
  body.append(dependents);

  renderColophon(dom.colophon, { root: state.tree, docPath: doc });

  setStatus('idle');
  if (anchor === undefined) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  spy = shelf === undefined ? undefined : new ScrollSpy({ prose, container: shelf });
  dock = shelf === undefined ? undefined : new ContentsDock(shelf);

  const emphasis = await fetchEmphasis(doc).catch(() => null);
  const health = await ensureHealth();
  if (token !== renderToken) {
    return;
  }
  drawSidebarFoot();
  replaceWidgets(prose, buildWidgets({ node, manifest: state.manifest, health, emphasis }), shelf);
  revealAnchor(prose, anchor);
}

/* --------------------------------------------------------------- wiring -- */

function rebuildDerived() {
  state.tree = buildTree(state.manifest.nodes);
  state.incoming = incomingLinks(state.manifest.nodes);
  state.titles = new Map(state.manifest.nodes.map((node) => [node.path, node.title]));
  searchFigure.setDocuments(state.manifest.nodes);
}

function drawFolio() {
  const { doc, view } = state.route;
  const node = SURFACE_VIEWS.includes(view) ? undefined : nodeFor(doc);
  const payload = state.payload?.path === doc ? state.payload : undefined;

  const head = renderFolio(dom.folio, {
    root: state.tree,
    node,
    payload,
    surface: SURFACE_VIEWS.includes(view) ? view : undefined,
    editing: view === 'edit',
    historyOpen: state.route.history !== undefined,
    actions: {
      announce,
      onEdit: () => navigate({ view: view === 'edit' ? 'read' : 'edit', history: undefined }),
      onHistory: () => navigate({ history: state.route.history === undefined ? 'page' : undefined }),
    },
  });
  statusNode = head.status;
  paintStatus();
}

async function applyRoute() {
  if (activeEditor) {
    const leaving = activeEditor;
    activeEditor = undefined;
    await leaving.flush();
  }
  const previous = state.route;
  state.route = currentRoute();

  const samePage =
    previous.doc === state.route.doc &&
    previous.view === state.route.view &&
    previous.anchor === state.route.anchor;

  for (const folder of state.route.doc === undefined ? [] : ancestorsOf(state.route.doc)) {
    state.expanded.add(folder);
  }
  drawTree();

  if (!samePage) {
    await drawPage();
  }
  if (historyPanel !== undefined) {
    await drawHistory(historyPanel);
  }
  // The folio names the document, so it is drawn after the payload is cached.
  drawFolio();
}

function wireChrome() {
  // Crossing the width where a margin exists re-seats every widget: whether one
  // can float is a question about the layout, so it is re-asked when the layout
  // changes.
  HAS_MARGIN.addEventListener('change', relayout);
  HAS_SHELF.addEventListener('change', relayout);

  // The title's size is set in `vw` and the measure comes from the width, so a
  // resize changes both how far the head condenses and what fits beside what.
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame === 0) {
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        relayout();
      });
    }
  });

  // The head is measured from type that may not have arrived yet.
  void document.fonts?.ready.then(relayout);

  document.addEventListener('keydown', (event) => {
    // A convenience on top of a field that is already on the page, never the
    // way in, and never advertised.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchFigure.focus();
      return;
    }
    if (event.key === 'Escape' && state.route.history !== undefined) {
      navigate({ history: undefined });
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (activeEditor?.isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  onRouteChange(() => void applyRoute());
}

async function start() {
  applyStoredTheme();
  wireChrome();
  try {
    state.manifest = await fetchManifest();
  } catch (error) {
    clear(dom.column).append(notice('The docs root could not be read.', error.message));
    return;
  }
  rebuildDerived();
  initSidebarToggle();
  drawSidebarFoot();
  dom.searchSlot.append(searchFigure.node);

  const landing = state.tree.doc ?? state.manifest.nodes[0];
  if (!currentRoute().doc && !SURFACE_VIEWS.includes(currentRoute().view) && landing) {
    history.replaceState(null, '', hrefFor({ doc: landing.path, view: 'read' }));
  }
  await applyRoute();
}

void start();
