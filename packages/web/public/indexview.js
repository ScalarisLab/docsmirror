import { renderSurfaceHead } from './docmeta.js';
import { el } from './dom.js';
import { hrefFor } from './router.js';
import { documentsIn, labelOf, sortedChildren } from './tree.js';

/**
 * The corpus, one click from anywhere.
 *
 * This is what replaced the permanent navigation tree. A tree open beside the
 * prose spends a column of the page on a question the reader asks perhaps twice
 * per session; a composed index answers the same question better, at the moment
 * it is actually asked, and costs the reading column nothing the rest of the
 * time.
 *
 * Folders carry how many pointers reach into them, which is the corpus's second
 * dimension: where the codebase is leaning, before opening anything.
 * @docs web.md#finding-your-way
 */

function documentRow(node, current) {
  const pointers = node.referencedBy?.length ?? 0;
  return el(
    'a',
    {
      class: `index-doc${node.path === current ? ' is-current' : ''}`,
      href: hrefFor({ doc: node.path, view: 'read' }),
    },
    [
      el('span', { class: 'index-doc-name', text: node.title }),
      el('span', { class: 'apparatus-leader', 'aria-hidden': 'true' }),
      el('span', {
        class: `figure${pointers > 0 ? ' is-pointer' : ''}`,
        text: pointers === 0 ? '0' : String(pointers),
      }),
    ],
  );
}

function folderBlock(folder, current) {
  const documents = documentsIn(folder);
  const open = current !== undefined && current.startsWith(`${folder.path}/`);
  const body = el('div', { class: 'index-docs', hidden: !open }, documents.map((node) => documentRow(node, current)));

  const head = el(
    'button',
    {
      type: 'button',
      class: 'index-folder',
      'aria-expanded': String(open),
      onclick: () => {
        body.hidden = !body.hidden;
        head.setAttribute('aria-expanded', String(!body.hidden));
      },
    },
    [
      el('span', { class: 'index-folder-name', text: labelOf(folder) }),
      el('span', { class: 'apparatus-leader', 'aria-hidden': 'true' }),
      el('span', { class: 'figure', text: String(folder.documents) }),
      el('span', { class: 'figure is-pointer', text: String(folder.references) }),
    ],
  );

  const nested = sortedChildren(folder).filter((entry) => entry.kind === 'folder');
  return el('section', { class: 'index-block' }, [
    head,
    body,
    ...nested.map((child) => el('div', { class: 'index-nested' }, [folderBlock(child, current)])),
  ]);
}

export function renderIndexView(container, { root, manifest, current }) {
  const folders = sortedChildren(root).filter((entry) => entry.kind === 'folder');
  const loose = documentsIn(root);

  renderSurfaceHead(container, {
    title: 'The corpus',
    summary:
      'Every folder of the documentation and how much of the codebase leans on it. The figure on the right of a folder is how many @docs pointers reach into it.',
    facts: [
      el('span', { class: 'fact' }, [
        el('span', { class: 'figure', text: manifest.stats.documents.toLocaleString('en') }),
        ' documents',
      ]),
      el('span', { class: 'fact' }, [
        el('span', { class: 'figure', text: manifest.stats.anchors.toLocaleString('en') }),
        ' sections',
      ]),
      el('span', { class: 'fact' }, [
        el('span', { class: 'figure', text: manifest.stats.references.toLocaleString('en') }),
        ' pointers',
      ]),
    ],
  });

  container.append(
    el('div', { class: 'index-legend' }, [
      el('span', { text: 'folder' }),
      el('span', { text: 'documents' }),
      el('span', { class: 'is-pointer', text: 'pointers in' }),
    ]),
    ...folders.map((folder) => folderBlock(folder, current)),
  );

  if (loose.length > 0) {
    container.append(
      el('section', { class: 'index-block' }, [
        el('p', { class: 'apparatus-label' }, [
          'At the root',
          el('span', { class: 'figure', text: String(loose.length) }),
        ]),
        el('div', { class: 'index-docs' }, loose.map((node) => documentRow(node, current))),
      ]),
    );
  }
}
