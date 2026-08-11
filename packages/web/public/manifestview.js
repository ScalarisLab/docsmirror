import { STATIC } from './api.js';
import { LONG_DOCUMENT_WORDS, renderSurfaceHead } from './docmeta.js';
import { clear, el, formatDate, formatDateTime } from './dom.js';
import { hrefFor } from './router.js';

/**
 * The documentation surface, browsable.
 *
 * The manifest already describes every document, every anchor and every code
 * site that depends on them; before this screen existed the app spent that on
 * one page at a time. Here it is the whole set at once, what exists, what each
 * page covers, and how much of the codebase is leaning on it, which is the
 * question someone new to a repository actually arrives with.
 * @docs manifest.md#the-format
 */

const SORTS = [
  { id: 'subsystem', label: 'Subsystem' },
  { id: 'references', label: 'Most referenced' },
  { id: 'words', label: 'Longest' },
  { id: 'updated', label: 'Recently changed' },
];

function compact(value) {
  return value >= 10000 ? `${(value / 1000).toFixed(0)}k` : value.toLocaleString('en');
}

function folderOf(path) {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

function matches(node, query) {
  if (query === '') {
    return true;
  }
  const haystack = `${node.title} ${node.path} ${node.summary ?? ''}`.toLowerCase();
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

function fact(value, label, caution = false) {
  return el('span', { class: `fact${caution && value > 0 ? ' is-caution' : ''}` }, [
    el('span', { class: 'figure', text: value.toLocaleString('en') }),
    ` ${label}`,
  ]);
}

function anchorRows(node) {
  return el(
    'ul',
    { class: 'anchor-rows' },
    node.anchors.map((anchor) =>
      el('li', { class: 'anchor-row' }, [
        el('span', { class: 'anchor-slug', text: anchor.slug, title: `#${anchor.slug}` }),
        el('a', {
          class: 'anchor-title',
          href: hrefFor({ doc: node.path, anchor: anchor.slug, view: 'read' }),
          text: anchor.summary ?? anchor.title,
          title: anchor.title,
        }),
        anchor.referencedBy.length > 0
          ? el('span', { class: 'figure is-pointer', text: String(anchor.referencedBy.length) })
          : null,
      ]),
    ),
  );
}

function documentRow(node) {
  const row = el('li', { class: 'doc-row' });
  let anchors;

  const toggle = el('button', {
    type: 'button',
    class: 'doc-anchors-toggle',
    text: String(node.anchors.length),
    'aria-expanded': 'false',
    'aria-label': `Show the ${node.anchors.length} sections of ${node.title}`,
    onclick: () => {
      if (anchors === undefined) {
        anchors = anchorRows(node);
        row.append(anchors);
        toggle.setAttribute('aria-expanded', 'true');
      } else {
        anchors.remove();
        anchors = undefined;
        toggle.setAttribute('aria-expanded', 'false');
      }
    },
  });

  row.append(
    el('div', { class: 'doc-line' }, [
      el('a', {
        class: 'doc-name',
        href: hrefFor({ doc: node.path, view: 'read' }),
        text: node.title,
        title: node.title,
      }),
      el('div', { class: 'doc-numbers' }, [
        toggle,
        el('span', {
          class: node.referencedBy.length === 0 ? 'figure is-quiet' : 'figure is-pointer',
          text: node.referencedBy.length === 0 ? 'none' : String(node.referencedBy.length),
        }),
        el('span', {
          class: node.words >= LONG_DOCUMENT_WORDS ? 'figure is-caution' : 'figure',
          text: compact(node.words),
        }),
        el('span', { class: 'figure is-quiet', text: formatDate(node.lastModified) }),
      ]),
    ]),
    el('div', { class: 'doc-under' }, [
      el('span', { class: 'doc-path', text: node.path }),
      node.summary ? el('p', { class: 'doc-summary', text: node.summary, title: node.summary }) : null,
    ]),
  );
  return row;
}

function columnHead() {
  return el('div', { class: 'doc-line is-head' }, [
    el('span', { class: 'doc-name', text: 'Document' }),
    el('div', { class: 'doc-numbers' }, [
      el('span', { text: 'Sections' }),
      el('span', { text: 'Pointers' }),
      el('span', { text: 'Words' }),
      el('span', { text: 'Updated' }),
    ]),
  ]);
}

/**
 * Builds the view. It owns its own filter and sort state because none of it is
 * worth a history entry, the address bar names the screen, not the sorting.
 */
export function renderManifestView(container, manifest) {
  clear(container);
  const state = { query: '', sort: 'subsystem', unreferenced: false, long: false };
  const results = el('div');

  const draw = () => {
    clear(results);
    let nodes = manifest.nodes.filter((node) => matches(node, state.query));
    if (state.unreferenced) {
      nodes = nodes.filter((node) => node.referencedBy.length === 0);
    }
    if (state.long) {
      nodes = nodes.filter((node) => node.words >= LONG_DOCUMENT_WORDS);
    }

    if (nodes.length === 0) {
      results.append(el('p', { class: 'quiet', text: 'No document matches those filters.' }));
      return;
    }

    if (state.sort === 'subsystem') {
      const folders = new Map();
      for (const node of [...nodes].sort((left, right) => left.path.localeCompare(right.path))) {
        folders.set(folderOf(node.path), [...(folders.get(folderOf(node.path)) ?? []), node]);
      }
      results.append(columnHead());
      for (const [folder, group] of folders) {
        results.append(
          el('p', { class: 'apparatus-label' }, [
            folder === '' ? `${manifest.docsRoot}, root` : folder,
            el('span', { class: 'figure', text: String(group.length) }),
            el('span', {
              class: 'figure is-pointer',
              text: String(group.reduce((total, node) => total + node.referencedBy.length, 0)),
            }),
          ]),
          el('ul', { class: 'doc-rows' }, group.map(documentRow)),
        );
      }
      return;
    }

    const ordered = [...nodes].sort((left, right) => {
      if (state.sort === 'references') {
        return right.referencedBy.length - left.referencedBy.length;
      }
      if (state.sort === 'words') {
        return right.words - left.words;
      }
      return (right.lastModified ?? '').localeCompare(left.lastModified ?? '');
    });
    results.append(columnHead(), el('ul', { class: 'doc-rows' }, ordered.map(documentRow)));
  };

  const sortChips = SORTS.map((sort) =>
    el('button', {
      type: 'button',
      class: `chip${state.sort === sort.id ? ' is-on' : ''}`,
      text: sort.label,
      'aria-pressed': String(state.sort === sort.id),
      onclick: (event) => {
        state.sort = sort.id;
        for (const chip of sortChips) {
          const on = chip === event.currentTarget;
          chip.classList.toggle('is-on', on);
          chip.setAttribute('aria-pressed', String(on));
        }
        draw();
      },
    }),
  );

  const toggleChip = (label, key) =>
    el('button', {
      type: 'button',
      class: 'chip',
      text: label,
      'aria-pressed': 'false',
      onclick: (event) => {
        state[key] = !state[key];
        event.currentTarget.classList.toggle('is-on', state[key]);
        event.currentTarget.setAttribute('aria-pressed', String(state[key]));
        draw();
      },
    });

  renderSurfaceHead(container, {
    title: 'Documentation surface',
    summary:
      'Every document, what it covers, and which code depends on it, the whole set, without opening one of them.',
    facts: [
      fact(manifest.stats.documents, 'documents'),
      fact(manifest.stats.anchors, 'sections'),
      fact(manifest.stats.references, 'pointers'),
      fact(manifest.stats.documents - manifest.stats.referencedDocuments, 'unreferenced', true),
      fact(manifest.stats.orphans, 'unreachable', true),
    ],
  });

  container.append(
    el('p', { class: 'surface-note' }, [
      el('span', { class: 'figure is-quiet', text: manifest.docsRoot }),
      el('span', { class: 'figure is-quiet', text: `format ${manifest.docsmirror}` }),
      el('span', { class: 'figure is-quiet', text: `built ${formatDateTime(manifest.generatedAt)}` }),
      el('a', {
        class: 'tool',
        href: STATIC ? 'data/manifest.json' : '/api/manifest',
        target: '_blank',
        rel: 'noreferrer',
        text: 'raw JSON',
      }),
    ]),
    el('div', { class: 'controls' }, [
      el('input', {
        class: 'field',
        type: 'search',
        placeholder: 'Filter by title, path or summary',
        'aria-label': 'Filter documents',
        oninput: (event) => {
          state.query = event.currentTarget.value.trim().toLowerCase();
          draw();
        },
      }),
      el('span', { class: 'control-label', text: 'Order' }),
      ...sortChips,
      el('span', { class: 'control-label', text: 'Only' }),
      toggleChip('Unreferenced', 'unreferenced'),
      toggleChip('Over 3,000 words', 'long'),
    ]),
    results,
  );

  draw();
}
