import { clear, el, formatDate } from './dom.js';

/**
 * What this page is, set at the head of the reading column: the title at a size
 * that commits to it, and under it everything the manifest knows that the prose
 * does not say, how much of it there is, how much code leans on it, and when it
 * last changed.
 *
 * None of these figures is set in a monospace face. A count is not code; it is
 * a number in a sentence, and it earns its precision from tabular figures and a
 * change of weight rather than from looking like a terminal.
 * @docs manifest.md#the-format
 */

function fact(children, caution = false) {
  return el('span', { class: `fact${caution ? ' is-caution' : ''}` }, children);
}

function count(value) {
  return el('span', { class: 'figure', text: value.toLocaleString('en') });
}

function plural(value, singular, many = `${singular}s`) {
  return value === 1 ? singular : many;
}

/** Every distinct source file among a set of pointers. */
function filesIn(references) {
  return new Set(references.map((reference) => reference.file)).size;
}

/**
 * A page long enough that a reader will not finish it, and a pointer into it
 * lands in an unread wall. Stated as a fact, not raised as an alarm.
 */
export const LONG_DOCUMENT_WORDS = 3000;

export function factsFor(node) {
  const references = node.referencedBy ?? [];
  const files = filesIn(references);
  const long = node.words >= LONG_DOCUMENT_WORDS;
  return [
    fact([count(node.anchors.length), ` ${plural(node.anchors.length, 'section')}`]),
    references.length === 0
      ? fact([el('span', { class: 'figure', text: 'No code' }), ' points at this page'], true)
      : fact([
          count(references.length),
          ` ${plural(references.length, 'pointer')} from `,
          count(files),
          ` ${plural(files, 'file')}`,
        ]),
    fact([count(node.words), long ? ' words, long enough to split' : ' words'], long),
    node.lastModified
      ? fact(['updated ', el('span', { class: 'figure', text: formatDate(node.lastModified) })])
      : null,
    node.staleness === 'fresh' ? null : fact([el('span', { class: 'figure', text: node.staleness })], true),
  ].filter(Boolean);
}

/** Letters and digits only, so two renderings of the same sentence compare equal. */
function flatten(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{Nd}]+/gu, ' ').trim();
}

/**
 * A summary is *derived* from the opening prose unless the author overrode it
 * in front matter, so setting it above the prose usually prints the same
 * sentence twice, three lines apart. Comparing the two is how the head can tell
 * a real standfirst from an echo, the manifest does not record which it is.
 */
function echoesOpening(summary, markdown) {
  const probe = flatten(summary).slice(0, 60);
  return probe.length > 0 && flatten(markdown.slice(0, 1500)).includes(probe);
}

/**
 * The instruction a reader pastes into a chat with a coding agent, said on the
 * page rather than only into the clipboard.
 *
 * The pointer comes first because it is the part that survives: once the head
 * has condensed there is no room for the sentence around it, and a pointer is
 * the one thing on that line an agent, or a reader, cannot reconstruct.
 * @docs web.md#taking-a-document-elsewhere
 */
function referenceLine(path) {
  return [
    el('span', { class: 'ref-pointer', text: `@docs ${path}` }),
    el('span', {
      class: 'ref-tail',
      text: ": consult before working on this. @docs paths resolve against this repository's docs root.",
    }),
  ];
}

/**
 * The document's title and its agent reference into the pinned head, and its
 * manifest facts and standfirst into the column that scrolls.
 */
export function renderDocumentHead({ titleHost, refHost, column }, { node, payload }) {
  const lede = node.summary !== undefined && !echoesOpening(node.summary, payload.markdown) ? node.summary : undefined;
  clear(titleHost).append(el('h1', { class: 'title', id: 'top', text: payload.title }));
  clear(refHost).append(...referenceLine(node.path));
  column.append(el('p', { class: 'facts' }, factsFor(node)));
  if (lede !== undefined) {
    column.append(el('p', { class: 'lede', text: lede }));
  }
}

/** Empties the pinned head, for a view that is not one document. */
export function clearDocumentHead({ titleHost, refHost }) {
  clear(titleHost);
  clear(refHost);
}

/** The head of a whole-surface view, set to the same scale as a document's. */
export function renderSurfaceHead(container, { title, summary, facts }) {
  container.append(
    el('h1', { class: 'title', text: title }),
    el('p', { class: 'facts' }, facts),
    el('p', { class: 'lede', text: summary }),
  );
}
