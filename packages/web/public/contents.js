import { clear, el } from './dom.js';
import { hrefFor } from './router.js';

/**
 * The document's contents, composed into the left of the reading area, the
 * mirror of the figures floated into its right.
 *
 * Each row carries how much code names that section, so the list is a map of
 * where the codebase is looking rather than a navigation aid.
 *
 * The shelf and the pin are two elements because they have to be: `position:
 * sticky` does not compose with `float` in any engine, and the contents needs
 * both, the float is what makes the prose wrap beside it, the sticky child is
 * what keeps it in view. The shelf's height is measured rather than left to the
 * content, so the pin releases before the document ends and the last passages
 * close over it instead of leaving it beside the foot.
 * @docs manifest.md#code-references
 */

/** Heading levels the contents shows. Deeper ones are detail, not structure. */
const SHOWN_LEVELS = [2, 3];

/** Below this, a contents list is longer than the document it describes. */
const MIN_ENTRIES = 3;

/** How much of the document's end the prose closes over the contents. */
const SHELF_TAIL_PX = 176;

/**
 * The contents, in the shelf the prose wraps around. Answers `undefined` when
 * the document has too few sections to be worth describing, the prose then
 * simply has no left lane.
 */
export function createShelf({ node, docPath }) {
  const contents = el('nav', { class: 'contents', 'aria-label': 'Contents' });
  if (renderContents(contents, node, docPath).length === 0) {
    return undefined;
  }
  return el('aside', { class: 'shelf' }, [el('div', { class: 'shelf-pin' }, [contents])]);
}

/** Settling passes the shelf height is allowed before it is taken as final. */
const SHELF_PASSES = 3;

/**
 * Gives the shelf the height that decides where the pin lets go.
 *
 * Reserving the lane can only make the prose taller, the same text in a
 * narrower measure, so the height is approached from below, one pass at a
 * time, until it stops growing. The obvious shortcut, reserving the lane with
 * an enormous height and reading the result once, is wrong: a right-floated
 * figure that cannot fit beside a lane that tall is dropped past the whole of
 * it, and the number that comes back is the size of the hole.
 */
export function fitShelf(prose, shelf, { floating }) {
  if (shelf === undefined) {
    return;
  }
  if (!floating) {
    shelf.style.removeProperty('--shelf-h');
    return;
  }

  let height = 0;
  for (let pass = 0; pass < SHELF_PASSES; pass += 1) {
    const full = prose.offsetHeight;
    if (full - height < 8) {
      break;
    }
    height = full;
    shelf.style.setProperty('--shelf-h', `${Math.round(height)}px`);
  }
  const pinned = shelf.firstElementChild.offsetHeight;
  shelf.style.setProperty('--shelf-h', `${Math.round(Math.max(pinned, height - SHELF_TAIL_PX))}px`);
}

function renderContents(container, node, docPath) {
  clear(container);
  const anchors = (node?.anchors ?? []).filter((anchor) => SHOWN_LEVELS.includes(anchor.level));
  if (anchors.length < MIN_ENTRIES) {
    return [];
  }

  const list = el('ol', { class: 'contents-list' });
  anchors.forEach((anchor, index) => {
    const references = anchor.referencedBy?.length ?? 0;
    list.append(
      el('li', { class: `contents-row is-level-${anchor.level}` }, [
        el('span', { class: 'figure contents-n', text: String(index + 1) }),
        el('a', {
          class: 'contents-title',
          'data-slug': anchor.slug,
          href: hrefFor({ doc: docPath, anchor: anchor.slug, view: 'read', history: undefined }),
          text: anchor.title,
        }),
        el('span', {
          class: `figure contents-count${references > 0 ? ' is-pointer' : ''}`,
          text: String(references),
          title:
            references === 0
              ? 'No code points at this section'
              : `${references} code ${references === 1 ? 'pointer names' : 'pointers name'} this section`,
        }),
      ]),
    );
  });

  container.append(
    el('p', { class: 'apparatus-label' }, [
      'In this document',
      el('span', { class: 'figure', text: String(anchors.length) }),
    ]),
    list,
  );
  return anchors.map((anchor) => anchor.slug);
}

/** Where a heading counts as passed: just under the condensed head. */
function readingLine() {
  const condensed = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--head-condensed'),
  );
  return (Number.isFinite(condensed) ? condensed : 72) + 24;
}

/**
 * Marks the heading the reader is currently under.
 *
 * The active heading is the last one that has passed under the head, which is
 * what a reader perceives as "where I am", an intersection test would flicker
 * between neighbours on a fast scroll.
 */
export class ScrollSpy {
  constructor({ prose, container }) {
    this.container = container;
    this.line = readingLine();
    this.active = undefined;
    this.frame = 0;
    this.headings = [...prose.querySelectorAll('h2[id], h3[id]')];
    this.handler = () => this.schedule();
    if (this.headings.length > 0) {
      window.addEventListener('scroll', this.handler, { passive: true });
      this.measure();
    }
  }

  schedule() {
    if (this.frame === 0) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.measure();
      });
    }
  }

  measure() {
    let current = this.headings[0]?.id;
    for (const heading of this.headings) {
      if (heading.getBoundingClientRect().top <= this.line) {
        current = heading.id;
      }
    }
    // At the very bottom the last heading is the one being read, even when its
    // own top never crosses the line.
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable > 8 && scrollable - window.scrollY < 8) {
      current = this.headings[this.headings.length - 1]?.id ?? current;
    }
    if (current === this.active) {
      return;
    }
    this.active = current;
    for (const link of this.container.querySelectorAll('.contents-title')) {
      link.classList.toggle('is-active', link.dataset.slug === current);
    }
  }

  stop() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('scroll', this.handler);
  }
}

/** How long the dock's slide takes, matching the transition set on `.shelf.is-fixed` in CSS. */
const DOCK_TRANSITION_MS = 240;

/**
 * Docks the shelf against the bottom of the viewport once its own slot in the
 * prose has scrolled out of view, and lets go the moment scrolling back up
 * returns that slot to view.
 *
 * The shelf never leaves the prose: `position: fixed` only changes where it
 * paints, not where it lives in the document, so undocking is simply taking
 * that away and letting it resume the slot it never stopped occupying. A
 * sentinel left in that slot is what decides when, an element still in normal
 * flow, since the shelf's own position stops describing that slot the moment
 * it is fixed.
 * @docs web.md#finding-your-way
 */
export class ContentsDock {
  constructor(shelf) {
    this.shelf = shelf;
    this.docked = false;
    this.hideTimer = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sentinel = el('div', { class: 'shelf-sentinel', 'aria-hidden': 'true' });
    shelf.before(this.sentinel);
    this.observer = new IntersectionObserver(([entry]) => {
      this.set(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    this.observer.observe(this.sentinel);
  }

  set(docked) {
    if (docked === this.docked) {
      return;
    }
    this.docked = docked;
    window.clearTimeout(this.hideTimer);
    if (docked) {
      this.shelf.classList.add('is-fixed');
      // A frame apart, so the browser paints the off-screen start position
      // before the class that animates away from it is added.
      requestAnimationFrame(() => this.shelf.classList.add('is-visible'));
      return;
    }
    this.shelf.classList.remove('is-visible');
    this.hideTimer = window.setTimeout(
      () => this.shelf.classList.remove('is-fixed'),
      this.reduced ? 0 : DOCK_TRANSITION_MS,
    );
  }

  stop() {
    this.observer.disconnect();
    window.clearTimeout(this.hideTimer);
    this.sentinel.remove();
    this.shelf.classList.remove('is-fixed', 'is-visible');
  }
}
