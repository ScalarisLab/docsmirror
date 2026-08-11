import { agentReferenceFor, copyButton, markdownOf } from './copy.js';
import { clear, el } from './dom.js';
import { hrefFor } from './router.js';
import { settingsControl } from './settings.js';
import { ancestorsOf, documentsIn, folderAt, folderOf, labelOf } from './tree.js';

/**
 * The running head, and the document's own action row.
 *
 * There is no application frame here, so this is not a navigation bar: it is
 * the line a printed page carries above its text, saying where you are and
 * offering what you can do with the page you are on. It has no fill, no rule
 * under it, and it scrolls away with the prose like everything else.
 *
 * The last crumb is a disclosure rather than a label. Naming the folder is
 * worth little; opening it into its document list is the orientation a
 * permanent tree used to provide, at the moment it is wanted.
 * @docs web.md#finding-your-way
 */

/** Documents listed before the disclosure sends the reader to the corpus index. */
const FOLDER_LIMIT = 14;

/**
 * The disclosure currently open, if any. One document-level listener serves
 * every folio this module ever draws, the folio is redrawn on each
 * navigation, and a listener added per render would pile up on the document
 * for the life of the page.
 */
let openDisclosure;

document.addEventListener('pointerdown', (event) => {
  if (openDisclosure === undefined || openDisclosure.wrap.contains(event.target)) {
    return;
  }
  openDisclosure.close();
  openDisclosure = undefined;
});

function pointerCount(node) {
  return node.referencedBy?.length ?? 0;
}

function folderDrop(folder, docPath) {
  const documents = documentsIn(folder);
  const shown = documents.slice(0, FOLDER_LIMIT);

  return el('div', { class: 'drop place-drop', hidden: true }, [
    el('p', { class: 'drop-label' }, [
      folder.path === '' ? 'the docs root' : folder.path,
      el('span', { class: 'figure', text: `${documents.length}` }),
    ]),
    ...shown.map((node) =>
      el(
        'a',
        {
          class: `drop-row${node.path === docPath ? ' is-current' : ''}`,
          href: hrefFor({ doc: node.path, view: 'read' }),
        },
        [
          el('span', { class: 'drop-row-name', text: node.title }),
          pointerCount(node) === 0
            ? null
            : el('span', { class: 'figure is-pointer', text: String(pointerCount(node)) }),
        ],
      ),
    ),
    el('a', {
      class: 'drop-more',
      href: hrefFor({ view: 'index' }),
      text:
        documents.length > shown.length
          ? `All ${documents.length} here, and every other folder`
          : 'Every folder in the corpus',
    }),
  ]);
}

/** The crumb that opens: the folder the reader is in, and what else is in it. */
function placeDisclosure(folder, docPath) {
  const drop = folderDrop(folder, docPath);
  const close = () => {
    drop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const button = el(
    'button',
    {
      type: 'button',
      class: 'place-part is-open-able',
      'aria-expanded': 'false',
      'aria-haspopup': 'true',
      onclick: () => {
        const open = drop.hidden;
        drop.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        openDisclosure = open ? { wrap, close } : undefined;
      },
    },
    [folder.path === '' ? 'docs root' : labelOf(folder), el('span', { class: 'caret', 'aria-hidden': 'true' })],
  );

  const wrap = el('div', { class: 'has-drop' }, [button, drop]);
  return wrap;
}

function separator() {
  return el('span', { class: 'place-gap', text: '/', 'aria-hidden': 'true' });
}

/**
 * Where the reader is. Every ancestor that has a landing page is a link; the
 * innermost one opens instead, because that is the folder whose neighbours are
 * worth seeing.
 */
function place(root, docPath) {
  const parts = el('nav', { class: 'place', 'aria-label': 'Where you are' });
  const ancestors = docPath === undefined ? [] : [...new Set(['', ...ancestorsOf(docPath)])];

  ancestors.forEach((path, index) => {
    const folder = folderAt(root, path);
    if (folder === undefined) {
      return;
    }
    if (index > 0) {
      parts.append(separator());
    }
    if (index === ancestors.length - 1) {
      parts.append(placeDisclosure(folder, docPath));
      return;
    }
    const name = path === '' ? 'docs root' : labelOf(folder);
    parts.append(
      folder.doc
        ? el('a', { class: 'place-part', href: hrefFor({ doc: folder.doc.path, view: 'read' }), text: name })
        : el('span', { class: 'place-part', text: name }),
    );
  });
  return parts;
}

/** Names of the views that describe the whole set rather than one document. */
const SURFACE_NAMES = { index: 'the corpus', manifest: 'the manifest', health: 'health' };

/** The same crumb, for a view that is about the corpus rather than a page. */
function surfacePlace(root, surface) {
  const parts = el('nav', { class: 'place', 'aria-label': 'Where you are' });
  const landing = root.doc ?? [...root.children.values()].find((entry) => entry.doc)?.doc;
  parts.append(
    landing === undefined
      ? el('span', { class: 'place-part', text: 'docs root' })
      : el('a', { class: 'place-part', href: hrefFor({ doc: landing.path, view: 'read' }), text: 'docs root' }),
  );
  if (surface !== undefined) {
    parts.append(separator(), el('span', { class: 'place-part is-here', text: SURFACE_NAMES[surface] ?? surface }));
  }
  return parts;
}

/**
 * Draws the running head. The copy controls sit here because taking a document
 * elsewhere, into an editor, into a prompt, is a thing readers do constantly,
 * and because they act on this page rather than on the application.
 */
export function renderFolio(container, { root, node, payload, surface, editing, historyOpen, actions }) {
  clear(container);
  const docPath = payload?.path;
  const status = el('span', { class: 'status', role: 'status', 'aria-live': 'polite' });

  container.append(
    docPath === undefined ? surfacePlace(root, surface) : place(root, docPath),
    el('div', { class: 'folio-tools' }, [
      payload === undefined
        ? null
        : copyButton({
            className: 'tool',
            label: 'Copy markdown',
            text: () => markdownOf(payload, undefined),
            announce: actions.announce,
          }),
      payload === undefined || node === undefined
        ? null
        : copyButton({
            className: 'tool',
            label: 'Copy @docs ref',
            text: () => agentReferenceFor({ path: node.path, anchor: undefined, title: payload.title }),
            announce: actions.announce,
          }),
      payload === undefined
        ? null
        : el('button', {
            type: 'button',
            class: `tool${editing ? ' is-on' : ''}`,
            text: editing ? 'Done editing' : 'Edit',
            onclick: actions.onEdit,
          }),
      payload === undefined
        ? null
        : el('button', {
            type: 'button',
            class: `tool${historyOpen ? ' is-on' : ''}`,
            text: 'History',
            'aria-expanded': String(historyOpen),
            onclick: actions.onHistory,
          }),
      status,
      settingsControl(),
    ]),
  );

  return { status };
}

/**
 * The foot of the page: which document this is within its folder, and the two
 * either side of it. A folio, not a pager, it says where you are in the
 * sequence before it offers to move you along it.
 */
export function renderColophon(container, { root, docPath }) {
  clear(container);
  const folder = folderOf(root, docPath);
  const documents = documentsIn(folder);
  const position = documents.findIndex((node) => node.path === docPath);
  const previous = position > 0 ? documents[position - 1] : undefined;
  const next = position >= 0 && position < documents.length - 1 ? documents[position + 1] : undefined;
  const where = folder.path === '' ? 'the docs root' : folder.path;

  container.append(
    el('p', { class: 'colophon-place' }, [
      position < 0
        ? null
        : el('span', { class: 'figure', text: `${position + 1} of ${documents.length}` }),
      position < 0 ? `${documents.length} documents in ` : ' in ',
      el('a', { class: 'colophon-folder', href: hrefFor({ view: 'index' }), text: where }),
    ]),
    el('div', { class: 'colophon-pair' }, [
      previous === undefined
        ? el('span', {})
        : el('a', { class: 'colophon-step', href: hrefFor({ doc: previous.path, view: 'read' }) }, [
            el('span', { class: 'colophon-step-label', text: 'Previous' }),
            el('span', { class: 'colophon-step-title', text: previous.title }),
          ]),
      next === undefined
        ? el('span', {})
        : el('a', { class: 'colophon-step is-next', href: hrefFor({ doc: next.path, view: 'read' }) }, [
            el('span', { class: 'colophon-step-label', text: 'Next' }),
            el('span', { class: 'colophon-step-title', text: next.title }),
          ]),
    ]),
    el('p', { class: 'colophon-out' }, [
      el('a', { class: 'tool', href: hrefFor({ view: 'index' }), text: 'Corpus index' }),
      el('a', { class: 'tool', href: hrefFor({ view: 'manifest' }), text: 'Manifest' }),
      el('a', { class: 'tool', href: hrefFor({ view: 'health' }), text: 'Health' }),
    ]),
  );
}
