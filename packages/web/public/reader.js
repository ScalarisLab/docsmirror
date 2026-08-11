import { agentReferenceFor, copyButton, markdownOf } from './copy.js';
import { el } from './dom.js';

/**
 * The prose, and the apparatus that belongs to each heading.
 *
 * A heading is not just a heading here: it is an address a `@docs` pointer can
 * name. So every heading shows the anchor it answers to and the two ways of
 * taking it elsewhere, its markdown, and a reference an agent can act on.
 *
 * The anchor shown is the element's own `id`, which the server computed from
 * the heading's **source** text through the same slug rule the convention uses.
 * It is never derived from what is on screen: the rendered heading has already
 * been through inline markdown, so its visible text and its source text differ
 * whenever a heading contains a code span, emphasis or a link, and slugging the
 * visible text would silently move every one of those anchors.
 * @docs convention.md#anchors
 */

/** Adds the anchor, the pointer count and the copy controls to one heading. */
function equipHeading(heading, { anchor, payload, announce }) {
  const references = anchor?.referencedBy?.length ?? 0;
  const title = anchor?.title ?? heading.textContent.trim();

  heading.append(
    el('span', { class: 'heading-rig' }, [
      references === 0
        ? null
        : el('span', {
            class: 'figure is-pointer',
            text: String(references),
            title: `${references} code ${references === 1 ? 'pointer names' : 'pointers name'} this section`,
          }),
      el('span', { class: 'heading-tools' }, [
        el('a', {
          class: 'heading-anchor',
          href: `#${new URLSearchParams({ doc: payload.path, anchor: heading.id }).toString()}`,
          text: heading.id,
          title: `#${heading.id}`,
        }),
        copyButton({
          className: 'tool',
          label: 'markdown',
          text: () => markdownOf(payload, heading.id),
          announce,
        }),
        copyButton({
          className: 'tool',
          label: '@docs ref',
          text: () => agentReferenceFor({ path: payload.path, anchor: heading.id, title }),
          announce,
        }),
      ]),
    ]),
  );
}

/**
 * Renders a document's prose into a fresh article and equips its headings.
 * The document's own H1 is dropped: the title is already set above the prose,
 * at a size the markdown never asked for.
 */
export function renderProse({ payload, node, announce }) {
  const body = el('article', { class: 'prose' });
  body.innerHTML = payload.html;

  const first = body.firstElementChild;
  if (first?.tagName === 'H1' && first.textContent.trim() === payload.title) {
    first.remove();
  }

  const anchorsBySlug = new Map((node?.anchors ?? []).map((entry) => [entry.slug, entry]));
  for (const heading of body.querySelectorAll('h2[id], h3[id]')) {
    equipHeading(heading, { anchor: anchorsBySlug.get(heading.id), payload, announce });
  }
  return body;
}

/** Brings a requested anchor into view once the prose is in the page. */
export function revealAnchor(prose, anchor) {
  if (!anchor) {
    return;
  }
  const target = prose.querySelector(`[id="${CSS.escape(anchor)}"]`);
  if (target !== null) {
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    target.classList.add('is-targeted');
  }
}
