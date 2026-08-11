/**
 * The document head, condensing as the reader goes down the page.
 *
 * It is the page keeping its identity in view, a running head, not a bar. The
 * whole condensation is one number, `--head-progress`, which runs from 0 at the
 * top of the document to 1 once the head is compact; the stylesheet turns that
 * number into a scale on the title, a counter-shift on the crumb and actions,
 * and the fade of the sentence around the pointer.
 *
 * Nothing here animates a property that would lay the document out again. The
 * title is *scaled*, not resized, and the head's own box is *translated*, not
 * shortened, on a nine-hundred-line document the difference between those two
 * choices is the difference between a head that condenses and a page that
 * stutters. What it costs instead is one measurement per document, and one more
 * whenever the window changes width, because the title's size is set in `vw`.
 * @docs web.md#the-composition
 */

/** Where the title lands once condensed: reading size, still the title. */
const CONDENSED_TITLE_PX = 21;

/** A title never shrinks past this, however large it started. */
const MIN_SCALE = 0.22;

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Whether the browser can run the condensation off the main thread. Where it
 * can, CSS drives `--head-progress` from the scroll position itself and this
 * module only measures.
 */
const SCROLL_TIMELINE = CSS.supports('animation-timeline', 'scroll()');

export function installHead(masthead) {
  let range = 1;
  let frame = 0;
  let driving = false;

  const apply = () => {
    frame = 0;
    // Asked for less motion: the head still pins, but it takes its two states
    // directly instead of travelling between them.
    const progress = REDUCED.matches
      ? Number(window.scrollY > range / 2)
      : Math.min(1, Math.max(0, window.scrollY / range));
    masthead.style.setProperty('--head-progress', String(progress));
  };

  const onScroll = () => {
    if (frame === 0) {
      frame = requestAnimationFrame(apply);
    }
  };

  const sync = () => {
    const needed = REDUCED.matches || !SCROLL_TIMELINE;
    if (needed === driving) {
      return;
    }
    driving = needed;
    if (needed) {
      window.addEventListener('scroll', onScroll, { passive: true });
      apply();
      return;
    }
    cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener('scroll', onScroll);
    masthead.style.removeProperty('--head-progress');
  };

  REDUCED.addEventListener('change', sync);
  sync();

  return {
    /**
     * Reads the head at its full size and works out how far it has to shrink.
     * Transforms do not affect layout, so this measures the same whatever the
     * head currently looks like.
     */
    measure() {
      const title = masthead.querySelector('.title');
      const height = title?.offsetHeight ?? 0;
      const size = title === null || title === undefined ? 0 : Number.parseFloat(getComputedStyle(title).fontSize);
      const scale = size > 0 ? Math.max(MIN_SCALE, Math.min(1, CONDENSED_TITLE_PX / size)) : 1;
      const shrink = height * (1 - scale);

      const full = masthead.offsetHeight;
      masthead.style.setProperty('--title-k', String(scale));
      masthead.style.setProperty('--head-shrink', `${shrink}px`);
      // The head is done condensing by the time it would have scrolled away
      // its own height. Tying the travel to how much it shrinks instead would
      // finish the whole move inside a few dozen pixels, which reads as a snap.
      range = Math.max(full, 1);
      masthead.style.setProperty('--head-range', `${range}px`);

      // What the rest of the page has to keep clear of: the pinned contents
      // sits under it, and an anchored heading must land below it.
      document.documentElement.style.setProperty('--head-condensed', `${full - shrink}px`);

      if (driving) {
        apply();
      }
    },
  };
}
