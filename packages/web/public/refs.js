import { el } from './dom.js';
import { hrefFor } from './router.js';

/**
 * The reverse map at page granularity.
 *
 * Which code points at a section is contextual and belongs in the margin
 * beside that section, which is where the widgets put it. What belongs at the
 * foot of the page instead is the blast radius of the page as a whole: every
 * source file that depends on it, and every document that links to it. Those
 * two answer "what breaks if I rewrite this", which is a question a reader asks
 * after finishing, not while reading.
 * @docs manifest.md#code-references
 */

/** Inverts the manifest's outgoing links into "who links to this document". */
export function incomingLinks(nodes) {
  const incoming = new Map();
  for (const node of nodes) {
    for (const target of node.links ?? []) {
      incoming.set(target, [...(incoming.get(target) ?? []), node.path]);
    }
  }
  return incoming;
}

function apparatus(label, count, rows) {
  return el('section', { class: 'apparatus' }, [
    el('p', { class: 'apparatus-label' }, [label, el('span', { class: 'figure', text: String(count) })]),
    ...rows,
  ]);
}

/** One source file's pointers into this page, on one line. */
function fileRow(file, references) {
  return el('div', { class: 'apparatus-row', title: references.map((entry) => entry.line).join(', ') }, [
    el('span', { class: 'apparatus-name', text: file }),
    el('span', { class: 'apparatus-leader', 'aria-hidden': 'true' }),
    el('span', { class: 'figure is-pointer', text: String(references.length) }),
  ]);
}

function groupByFile(references) {
  const byFile = new Map();
  for (const reference of references) {
    byFile.set(reference.file, [...(byFile.get(reference.file) ?? []), reference]);
  }
  return [...byFile.entries()].sort((left, right) => right[1].length - left[1].length);
}

/**
 * Everything that depends on this page, composed rather than listed: the code
 * first, because that is the dependency the convention exists to make visible,
 * then the documents that link here.
 */
export function renderDependents(container, { node, linkedFrom, titleOf }) {
  const references = node.referencedBy ?? [];
  if (references.length > 0) {
    const files = groupByFile(references);
    container.append(
      apparatus(
        'Code that depends on this page',
        references.length,
        files.map(([file, rows]) => fileRow(file, rows)),
      ),
    );
  }

  if (linkedFrom !== undefined && linkedFrom.length > 0) {
    container.append(
      apparatus(
        'Documents that link here',
        linkedFrom.length,
        linkedFrom.map((path) =>
          el('a', { class: 'apparatus-row is-link', href: hrefFor({ doc: path, view: 'read' }) }, [
            el('span', { class: 'apparatus-name', text: titleOf.get(path) ?? path }),
            el('span', { class: 'apparatus-leader', 'aria-hidden': 'true' }),
            el('span', { class: 'apparatus-path', text: path }),
          ]),
        ),
      ),
    );
  }
}
