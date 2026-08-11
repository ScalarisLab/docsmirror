import { clear, el, svg } from './dom.js';
import { hrefFor } from './router.js';

/**
 * The folder structure the manifest's flat paths describe, and the sidebar that
 * draws it.
 *
 * The sidebar answers the one question the page itself cannot: what else
 * exists. Everything else about orientation is still injected where it is
 * relevant, the breadcrumb opens into the current folder, the foot places the
 * page in its sequence, but a reader also has to be able to see the whole
 * corpus without leaving what they are reading.
 *
 * It is a column of the page and not a frame: no fill, no rule down its edge,
 * nothing that reads as chrome. Folders are collapsed by default because a
 * whole corpus listed flat is not navigation, and the count on each folder is
 * how many `@docs` pointers reach into it.
 * @docs web.md#finding-your-way
 */

/** File names that make a document its folder's landing page rather than a child of it. */
export const INDEX_NAMES = ['index.md', 'index.markdown'];

function makeFolder(name, path) {
  return { kind: 'folder', name, path, children: new Map(), doc: undefined, references: 0, documents: 0 };
}

/**
 * How many `@docs` pointers reach into each part of the tree, folders included.
 * It is the structure's second dimension: which corners of the documentation
 * the codebase actually leans on, visible before opening anything.
 */
function countReferences(entry) {
  let total = entry.doc?.referencedBy.length ?? 0;
  for (const child of entry.children.values()) {
    total += countReferences(child);
  }
  entry.references = total;
  return total;
}

/**
 * Documents at or under a folder. It aggregates for the same reason the
 * pointer count does: a folder holding only sub-folders would otherwise read as
 * empty next to a five-figure pointer count, and the two numbers have to be
 * counting the same territory to be comparable at all.
 */
function countDocuments(entry) {
  let total = entry.doc === undefined ? 0 : 1;
  for (const child of entry.children.values()) {
    total += child.kind === 'folder' ? countDocuments(child) : 1;
  }
  entry.documents = total;
  return total;
}

/**
 * Turns the manifest's flat paths into the folder structure they describe.
 * A folder's `index.md` is not a child of the folder, it *is* the folder's
 * landing page, which is how documentation sets are actually written.
 */
export function buildTree(nodes) {
  const root = makeFolder('', '');
  for (const node of nodes) {
    const segments = node.path.split('/');
    const file = segments.pop();
    let cursor = root;
    for (const segment of segments) {
      if (!cursor.children.has(segment)) {
        cursor.children.set(segment, makeFolder(segment, [cursor.path, segment].filter(Boolean).join('/')));
      }
      cursor = cursor.children.get(segment);
    }
    if (INDEX_NAMES.includes(file)) {
      cursor.doc = node;
    } else {
      cursor.children.set(file, {
        kind: 'file',
        name: file,
        path: node.path,
        children: new Map(),
        doc: node,
        references: 0,
      });
    }
  }
  countReferences(root);
  countDocuments(root);
  return root;
}

/**
 * A folder is named by its directory, not by its index page's title: an index
 * headed "docs/decisions/api/, index" would otherwise put a path where a name
 * belongs. A document is named by its title.
 */
export function labelOf(entry) {
  return entry.kind === 'folder' ? entry.name : (entry.doc?.title ?? entry.name);
}

/** Folders first, then documents, each in alphabetical order of what is shown. */
export function sortedChildren(entry) {
  return [...entry.children.values()].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'folder' ? -1 : 1;
    }
    return labelOf(left).localeCompare(labelOf(right));
  });
}

/** Every folder path on the way to a document, outermost first. */
export function ancestorsOf(docPath) {
  const segments = docPath.split('/');
  segments.pop();
  const paths = [];
  for (const segment of segments) {
    paths.push([paths[paths.length - 1], segment].filter(Boolean).join('/'));
  }
  return paths;
}

/** Walks a folder path down the structure. */
export function folderAt(root, path) {
  let cursor = root;
  for (const segment of path.split('/').filter(Boolean)) {
    cursor = cursor?.children.get(segment);
  }
  return cursor;
}

/** The folder a document sits in, and the root itself for a top-level document. */
export function folderOf(root, docPath) {
  const ancestors = ancestorsOf(docPath);
  return folderAt(root, ancestors[ancestors.length - 1] ?? '') ?? root;
}

/**
 * The documents of a folder in reading order, its own landing page first, the
 * sequence the foot of a page walks with previous and next.
 */
export function documentsIn(folder) {
  const own = folder.doc === undefined ? [] : [folder.doc];
  const children = sortedChildren(folder)
    .filter((entry) => entry.kind === 'file')
    .map((entry) => entry.doc);
  return [...own, ...children];
}

/* ------------------------------------------------------------- the sidebar -- */

/** The chevron every disclosure in the sidebar uses, folders and the panel alike. */
export function twistIcon() {
  return svg('svg', { class: 'twist', viewBox: '0 0 12 12', 'aria-hidden': 'true' }, [
    svg('path', {
      d: 'M4.5 2.5 8 6l-3.5 3.5',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.6',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  ]);
}

function rowFor(entry, { depth, current, expanded, onToggle }) {
  const isFolder = entry.kind === 'folder';
  const open = expanded.has(entry.path);
  const isCurrent = entry.doc !== undefined && entry.doc.path === current;
  const name = labelOf(entry);

  // A folder with an index.md is both a place and a page: the twist opens it,
  // the label reads it. A folder without one can only be opened.
  const label = entry.doc
    ? el('a', {
        class: `corpus-name${isFolder ? ' is-folder' : ''}${isCurrent ? ' is-current' : ''}`,
        href: hrefFor({ doc: entry.doc.path, anchor: undefined, view: 'read', history: undefined }),
        title: entry.doc.path,
        'aria-current': isCurrent ? 'page' : undefined,
        text: name,
      })
    : el('button', {
        type: 'button',
        class: 'corpus-name is-folder',
        text: name,
        onclick: () => onToggle(entry.path),
      });

  const twist = isFolder
    ? el(
        'button',
        {
          type: 'button',
          class: `corpus-twist${open ? ' is-open' : ''}`,
          'aria-label': `${open ? 'Collapse' : 'Expand'} ${name}`,
          'aria-expanded': String(open),
          onclick: () => onToggle(entry.path),
        },
        [twistIcon()],
      )
    : el('span', { class: 'corpus-twist is-empty', 'aria-hidden': 'true' });

  return el(
    'div',
    {
      class: `corpus-row${isCurrent ? ' is-current' : ''}`,
      style: `padding-left:${depth * 0.85}rem`,
      role: 'treeitem',
      'aria-expanded': isFolder ? String(open) : undefined,
      'aria-selected': String(isCurrent),
    },
    [
      twist,
      label,
      el('span', {
        class: `figure is-small${entry.references > 0 ? ' is-pointer' : ' is-quiet'}`,
        text: entry.references === 0 ? '·' : String(entry.references),
        title:
          entry.references === 0
            ? 'No code points here'
            : `${entry.references} @docs ${entry.references === 1 ? 'pointer' : 'pointers'}`,
      }),
    ],
  );
}

function renderInto(container, entry, options, depth) {
  for (const child of sortedChildren(entry)) {
    container.append(rowFor(child, { ...options, depth }));
    if (child.kind === 'folder' && options.expanded.has(child.path)) {
      renderInto(container, child, options, depth + 1);
    }
  }
}

/**
 * Draws the whole corpus. Cheap enough to redraw on every navigation.
 *
 * The root's own children already include every top-level document;
 * only the docs root's landing page sits outside them, because it *is* the
 * root rather than a child of it.
 */
export function renderTree(container, root, { current, expanded, onToggle }) {
  clear(container);
  if (root.doc !== undefined) {
    container.append(
      rowFor(
        { kind: 'file', name: root.doc.path, path: root.doc.path, children: new Map(), doc: root.doc, references: root.doc.referencedBy.length },
        { depth: 0, current, expanded, onToggle },
      ),
    );
  }
  renderInto(container, root, { current, expanded, onToggle }, 0);
  if (container.childElementCount === 0) {
    container.append(el('p', { class: 'quiet', text: 'No markdown documents in the docs root.' }));
  }
}
