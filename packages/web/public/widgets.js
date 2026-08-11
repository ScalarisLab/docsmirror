import { el } from './dom.js';
import { hrefFor } from './router.js';

/**
 * Contextual widgets: the apparatus, set into the margin beside the prose it
 * belongs to.
 *
 * Two rules govern the whole system, and neither is negotiable.
 *
 * **What a widget says comes from data.** Every widget below is triggered by a
 * measurable condition over the manifest, the reverse reference map or the
 * health report, a count, a set intersection, a rate compared with the rest of
 * the corpus. Nothing here inspects the prose for words, and there is no
 * vocabulary anywhere in this file: a widget that appeared because the text
 * "mentioned Redis" would be a guess wearing the costume of a fact.
 *
 * **Where a widget sits comes from measurement.** A widget floats into the
 * margin and the prose wraps around it, so it needs a run of prose at least as
 * tall as itself to wrap; against a three-line section it would collide with
 * the next heading and read as broken. So placement asks the layout, not the
 * author: a passage hosts a widget only if it is tall enough, never two
 * widgets share a vertical band, and anything that cannot be seated gracefully
 * folds inline in reading order instead. An empty margin beside short prose is
 * correct. A crushed widget is not.
 * @docs web.md#contextual-widgets
 */

/**
 * Which widget wins when two are eligible for the same passage. A broken
 * pointer outranks everything because it is the one thing on the page that is
 * actually wrong.
 */
const PRIORITY = {
  unresolved: 100,
  references: 80,
  shared: 60,
  emphasis: 40,
};

/** Clear space a passage must have on top of the widget's own height. */
const BREATHING_PX = 32;

/** Documents listed by the shared-sources widget. */
const MAX_SHARED = 4;

/**
 * Destinations the emphasis widget lists. Five made a block too tall to seat
 * beside anything but the longest passage on a page, and a widget that always
 * folds is not a margin widget.
 */
const MAX_DENSE_ELSEWHERE = 3;

/**
 * Source files two documents must share before they count as neighbours.
 *
 * One is the right threshold, and it was measured rather than guessed:
 * requiring two shared files makes the widget fire on nothing at all, because
 * a `@docs` pointer is written once per topic and reference sets come out
 * almost disjoint. One shared file still means a specific, nameable source
 * file depends on both pages, which is a fact, and the widget shows which
 * file so the reader can judge it.
 * @docs web.md#a-widget-appears-because-the-data-says-so
 */
const MIN_SHARED_FILES = 1;

function figure(text, pointer = false) {
  return el('span', { class: `figure${pointer ? ' is-pointer' : ''}`, text });
}

function shell({ label, count, children, warn = false }) {
  return el('aside', { class: `figure-block widget${warn ? ' widget-warn' : ''}` }, [
    el('p', { class: 'figure-label' }, [label, count === undefined ? null : figure(String(count))]),
    ...children,
  ]);
}

/* ------------------------------------------------- a pointer that is broken -- */

/**
 * Trigger: `/api/health` reports at least one unresolved pointer whose target
 * is this document. The page a reader is looking at is provably not what some
 * comment in the codebase thinks it is, and that is worth interrupting for.
 */
function unresolvedWidget(issues) {
  if (issues.length === 0) {
    return undefined;
  }
  return {
    id: 'unresolved',
    priority: PRIORITY.unresolved,
    anchor: undefined,
    strict: false,
    node: shell({
      warn: true,
      label: issues.length === 1 ? 'A pointer here is broken' : 'Pointers here are broken',
      count: issues.length,
      children: issues.map((issue) =>
        el('div', { class: 'widget-row is-stacked' }, [
          el('span', { class: 'widget-site' }, [
            el('span', { class: 'widget-file', text: issue.file }),
            issue.range === undefined ? null : figure(`:${issue.range.line + 1}`),
          ]),
          el('span', { class: 'widget-note', text: issue.message.replace(/`/g, '') }),
          issue.suggestion === undefined
            ? null
            : el('span', { class: 'widget-note is-fix', text: `Did you mean ${issue.suggestion}` }),
        ]),
      ),
    }),
  };
}

/* ----------------------------------------- the code that names this section -- */

/**
 * Trigger: the manifest anchor for this section has at least one entry in
 * `referencedBy`. The reverse map already exists; this only surfaces it at the
 * height it applies to, instead of in a list at the side of the page where the
 * reader has to work out which row belongs to what they are reading.
 */
function referenceWidgets(node) {
  return (node?.anchors ?? [])
    .filter((anchor) => (anchor.referencedBy?.length ?? 0) > 0)
    .map((anchor) => {
      const references = anchor.referencedBy;
      const files = new Set(references.map((reference) => reference.file));
      return {
        id: `references:${anchor.slug}`,
        priority: PRIORITY.references,
        anchor: anchor.slug,
        // A pointer count is a statement about one section. Floated anywhere
        // else it would read as a claim about the prose it sits beside.
        strict: true,
        node: shell({
          label: 'Referenced from',
          count: references.length,
          children: [
            ...references.map((reference) =>
              el('div', { class: 'widget-row', title: `${reference.file}:${reference.line}` }, [
                el('span', { class: 'widget-symbol', text: reference.symbol ?? reference.file.split('/').pop() }),
                figure(`:${reference.line}`, true),
              ]),
            ),
            el('p', {
              class: 'widget-foot',
              text: `in ${files.size} source ${files.size === 1 ? 'file' : 'files'}`,
            }),
          ],
        }),
      };
    });
}

/* ------------------------------------- documents that point at the same code -- */

/** Source files the pointers into a document come from. */
function filesOf(node) {
  return new Set((node.referencedBy ?? []).map((reference) => reference.file));
}

/**
 * Trigger: another document's incoming pointers come from source files that
 * also point here, a non-empty intersection of two reference sets, at least
 * `MIN_SHARED_FILES` wide.
 *
 * This is a way through the documentation that no keyword and no link graph
 * offers: two pages are neighbours because the same code depends on both of
 * them, whether or not their prose has a word in common. The widget is pinned
 * to the section whose own pointers contribute most of the overlap, so it lands
 * where the shared dependency is actually being discussed.
 */
function sharedSourcesWidget(node, manifest) {
  const here = filesOf(node);
  if (here.size === 0) {
    return undefined;
  }

  const neighbours = manifest.nodes
    .filter((other) => other.path !== node.path)
    .map((other) => ({ other, shared: [...filesOf(other)].filter((file) => here.has(file)) }))
    .filter((entry) => entry.shared.length >= MIN_SHARED_FILES)
    .sort((left, right) => right.shared.length - left.shared.length)
    .slice(0, MAX_SHARED);

  if (neighbours.length === 0) {
    return undefined;
  }

  const overlap = new Set(neighbours.flatMap((entry) => entry.shared));
  return {
    id: 'shared',
    priority: PRIORITY.shared,
    anchor: densestAnchorFor(node, overlap),
    strict: false,
    node: shell({
      label: 'Also read by the same code',
      count: neighbours.length,
      children: [
        ...neighbours.map((entry) =>
          el(
            'a',
            {
              class: 'widget-row is-link',
              href: hrefFor({ doc: entry.other.path, view: 'read' }),
              title: entry.shared.join('\n'),
            },
            [
              el('span', { class: 'widget-title', text: entry.other.title }),
              figure(String(entry.shared.length), true),
            ],
          ),
        ),
        el('p', { class: 'widget-foot', text: 'Through' }),
        ...[...overlap].slice(0, MAX_SHARED).map((file) =>
          el('span', { class: 'widget-note', text: file }),
        ),
      ],
    }),
  };
}

/** The section whose own pointers come from the most of the shared files. */
function densestAnchorFor(node, files) {
  let best;
  let bestCount = 0;
  for (const anchor of node.anchors ?? []) {
    const count = new Set(
      (anchor.referencedBy ?? []).map((reference) => reference.file).filter((file) => files.has(file)),
    ).size;
    if (count > bestCount) {
      bestCount = count;
      best = anchor.slug;
    }
  }
  return best;
}

/* -------------------------------------------- the term this document leans on -- */

/**
 * Trigger: `/api/emphasis` finds a term whose rate in this document is a
 * multiple of its rate across the corpus, which at least three documents use
 * and at most half of them do, and which at least two other documents use
 * densely enough to be worth opening.
 *
 * The term is discovered, never listed. Nothing in the client or the server
 * knows what the corpus is about, and the same code finds `host` in a crawler's
 * documentation and something else entirely in someone else's.
 */
function emphasisWidget(emphasis) {
  if (emphasis === undefined || emphasis === null) {
    return undefined;
  }
  return {
    id: 'emphasis',
    priority: PRIORITY.emphasis,
    // The term describes the whole document; the densest section is only the
    // best place to say so, not the only truthful one.
    anchor: emphasis.anchor ?? undefined,
    strict: false,
    node: shell({
      label: 'Leans on',
      count: undefined,
      children: [
        el('p', { class: 'widget-term', text: emphasis.term }),
        el('p', { class: 'widget-note' }, [
          figure(String(emphasis.count)),
          ` times here, `,
          figure(`${emphasis.lift.toFixed(0)}×`),
          ' the rate of the rest of the corpus',
        ]),
        el('p', { class: 'widget-foot', text: 'Where else it is dense' }),
        ...emphasis.elsewhere.slice(0, MAX_DENSE_ELSEWHERE).map((entry) =>
          el('a', { class: 'widget-row is-link', href: hrefFor({ doc: entry.path, view: 'read' }) }, [
            el('span', { class: 'widget-title', text: entry.title }),
            figure(String(entry.count)),
          ]),
        ),
      ],
    }),
  };
}

/* ------------------------------------------------------------------ assembly -- */

/**
 * Every widget this document's data supports, unplaced. A widget that has no
 * data is simply absent, there is no empty state, because a margin with
 * nothing in it is the correct rendering of nothing to say.
 */
export function buildWidgets({ node, manifest, health, emphasis }) {
  const issues = (health?.issues ?? []).filter(
    (issue) => issue.kind !== 'orphan-doc' && issue.target === node.path,
  );
  return [
    unresolvedWidget(issues),
    ...referenceWidgets(node),
    sharedSourcesWidget(node, manifest),
    emphasisWidget(emphasis),
  ].filter(Boolean);
}

/* ----------------------------------------------------------------- placement -- */

const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/**
 * The runs of prose a widget could sit beside: everything between one heading
 * and the next. The lede before the first heading is a passage too, and often
 * the tallest one on a short page.
 */
function passagesOf(prose) {
  const passages = [];
  let current = { slug: undefined, blocks: [] };
  for (const child of prose.children) {
    // The contents shelf is a float down the left of the prose, not a block of
    // it: measuring it as one would report a passage as tall as the document.
    if (child.classList.contains('shelf')) {
      continue;
    }
    if (HEADINGS.has(child.tagName)) {
      passages.push(current);
      current = { slug: child.id === '' ? undefined : child.id, blocks: [] };
      continue;
    }
    current.blocks.push(child);
  }
  passages.push(current);
  return passages.filter((passage) => passage.blocks.length > 0);
}

function heightOf(passage) {
  const first = passage.blocks[0].getBoundingClientRect();
  const last = passage.blocks[passage.blocks.length - 1].getBoundingClientRect();
  return last.bottom - first.top;
}

/** Puts a widget at the head of a passage, where the float can be wrapped. */
function seat(passage, widget) {
  widget.node.classList.remove('is-inline');
  passage.blocks[0].insertAdjacentElement('beforebegin', widget.node);
}

/** Puts a widget between passages, in reading order, still after its section. */
function fold(passage, widget) {
  widget.node.classList.add('is-inline');
  passage.blocks[passage.blocks.length - 1].insertAdjacentElement('afterend', widget.node);
}

/**
 * Seats every widget, measuring rather than guessing.
 *
 * The widget's own height is measured once, its width is fixed, so its height
 * does not depend on where it lands, and every passage is measured before
 * anything is inserted, because a float does not change the height of the prose
 * it sits beside.
 */
export function placeWidgets(prose, widgets, { floating }) {
  for (const widget of widgets) {
    widget.node.remove();
  }
  const passages = passagesOf(prose);
  if (passages.length === 0) {
    return;
  }

  const ordered = [...widgets].sort((left, right) => right.priority - left.priority);

  if (!floating) {
    // No margin to float into: every widget folds, in reading order, after the
    // section it belongs to.
    for (const widget of ordered) {
      fold(bySlug(passages, widget.anchor) ?? passages[0], widget);
    }
    return;
  }

  const measured = passages.map((passage) => ({ ...passage, height: heightOf(passage), taken: false }));

  for (const widget of ordered) {
    const preferred = bySlug(measured, widget.anchor);
    const needed = measure(prose, widget);

    if (preferred !== undefined && !preferred.taken && preferred.height >= needed + BREATHING_PX) {
      preferred.taken = true;
      seat(preferred, widget);
      continue;
    }

    // A strict widget belongs beside its own section or nowhere else: floated
    // against unrelated prose it would read as a claim about that prose.
    if (widget.strict) {
      fold(preferred ?? measured[0], widget);
      continue;
    }

    // A soft widget prefers its own section but is true of the document, so it
    // takes the next passage with room, searching from where it wanted to be,
    // then wrapping, so it never lands above the thing it was pointing at
    // unless there is nowhere below.
    const from = preferred === undefined ? 0 : measured.indexOf(preferred);
    const host = fits(measured.slice(from), needed) ?? fits(measured.slice(0, from), needed);
    if (host === undefined) {
      // Where a margin exists, a soft widget either holds it or is not shown.
      // Folded, it becomes the full-width band across the prose that this
      // design does not allow, and what it says is contextual enrichment
      // rather than something the page would be wrong without.
      continue;
    }
    host.taken = true;
    seat(host, widget);
  }
}

function fits(passages, needed) {
  return passages.find((passage) => !passage.taken && passage.height >= needed + BREATHING_PX);
}

function bySlug(passages, slug) {
  return slug === undefined ? undefined : passages.find((passage) => passage.slug === slug);
}

/** A widget's height at the width it will be laid out in, read once. */
function measure(prose, widget) {
  if (widget.height === undefined) {
    widget.node.classList.remove('is-inline');
    widget.node.style.visibility = 'hidden';
    prose.append(widget.node);
    widget.height = widget.node.offsetHeight;
    widget.node.remove();
    widget.node.style.visibility = '';
  }
  return widget.height;
}
