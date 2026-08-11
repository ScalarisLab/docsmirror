import { search } from './api.js';
import { clear, el, markTerms } from './dom.js';
import { hrefFor } from './router.js';

/**
 * The way into the corpus: a real field, on the page, with its suggestions
 * directly under it. Never a palette, the keyboard shortcut only moves focus
 * to a control that was already there, and is never advertised.
 *
 * It heads the sidebar, above the corpus it searches, and stays on screen the
 * whole time because the sidebar does. That is the one lane where a permanent
 * control does not fight anything: the right margin is the widgets' and a
 * sticky element cannot share it with floats, but the left column is neither
 * the reading measure nor the figure lane. A bar pinned across the top of the
 * page would have been the application frame this design does not have.
 * @docs web.md#search
 */

const QUERY_DELAY_MS = 110;

/**
 * Which kinds of hit appear, in which order, under which heading, and how many
 * of each. `/api/search` labels every result with the kind of thing the query
 * matched.
 */
export const DEFAULT_GROUPS = [
  { match: 'document', label: 'Pages', limit: 6 },
  { match: 'heading', label: 'Sections', limit: 8 },
  { match: 'prose', label: 'In the text', limit: 8 },
];

/** With no query, the field offers the documentation set rather than nothing. */
const RESTING_LIMIT = 8;

export class SearchFigure {
  constructor({ groups = DEFAULT_GROUPS, onOpen }) {
    this.groups = groups;
    this.onOpen = onOpen;
    this.items = [];
    this.index = 0;
    this.timer = 0;
    this.token = 0;
    this.nodes = [];

    this.field = el('input', {
      class: 'search-field',
      type: 'search',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Search the documentation',
      'aria-label': 'Search the documentation',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-autocomplete': 'list',
      'aria-controls': 'search-suggestions',
      oninput: () => this.query(this.field.value),
      onfocus: () => this.query(this.field.value),
      onkeydown: (event) => this.onKeyDown(event),
    });

    this.list = el('ul', {
      class: 'drop suggestions',
      id: 'search-suggestions',
      role: 'listbox',
      hidden: true,
    });

    this.node = el('div', { class: 'search' }, [this.field, this.list]);

    document.addEventListener('pointerdown', (event) => {
      if (!this.node.contains(event.target)) {
        this.close();
      }
    });
  }

  setDocuments(nodes) {
    this.nodes = nodes;
  }

  focus() {
    this.field.focus();
    this.field.select();
  }

  close() {
    clearTimeout(this.timer);
    this.token += 1;
    this.list.hidden = true;
    this.field.setAttribute('aria-expanded', 'false');
  }

  query(text) {
    clearTimeout(this.timer);
    const token = (this.token += 1);
    if (text.trim().length === 0) {
      this.show(
        this.nodes.slice(0, RESTING_LIMIT).map((node) => ({
          path: node.path,
          anchor: undefined,
          title: node.title,
          document: node.title,
          excerpt: node.summary ?? node.path,
          match: 'document',
        })),
        [],
      );
      return;
    }
    this.timer = setTimeout(async () => {
      const found = await search(text).catch(() => []);
      if (token === this.token) {
        this.show(found, text.toLowerCase().split(/\s+/).filter(Boolean));
      }
    }, QUERY_DELAY_MS);
  }

  /** Orders results into the configured groups and caps each one. */
  arrange(results) {
    const arranged = [];
    for (const group of this.groups) {
      const members = results.filter((result) => result.match === group.match).slice(0, group.limit);
      if (members.length > 0) {
        arranged.push({ label: group.label, members });
      }
    }
    return arranged;
  }

  show(results, terms) {
    const arranged = this.arrange(results);
    this.items = arranged.flatMap((group) => group.members);
    this.index = 0;
    clear(this.list);
    this.list.hidden = false;
    this.field.setAttribute('aria-expanded', 'true');

    if (this.items.length === 0) {
      this.list.append(el('li', { class: 'suggestion-empty', text: 'Nothing matches that.' }));
      return;
    }

    let position = 0;
    for (const group of arranged) {
      this.list.append(el('li', { class: 'drop-label', role: 'presentation', text: group.label }));
      for (const item of group.members) {
        const at = position;
        position += 1;

        const title = el('span', { class: 'suggestion-title' });
        title.append(markTerms(item.title, terms));
        const excerpt = el('span', { class: 'suggestion-excerpt' });
        excerpt.append(markTerms(item.excerpt ?? '', terms));

        this.list.append(
          el(
            'li',
            {
              class: `suggestion${at === 0 ? ' is-active' : ''}`,
              role: 'option',
              'aria-selected': String(at === 0),
              onpointermove: () => this.moveTo(at),
              onpointerdown: (event) => {
                event.preventDefault();
                this.choose(at);
              },
            },
            [
              title,
              excerpt,
              el('span', {
                class: 'suggestion-where',
                // A hit inside a section has to name the document it lives in,
                // or the reader is given a heading with no home.
                text:
                  item.document === item.title
                    ? item.path
                    : `${item.document}, ${item.anchor === undefined ? item.path : `${item.path}#${item.anchor}`}`,
              }),
            ],
          ),
        );
      }
    }
  }

  rows() {
    return [...this.list.querySelectorAll('.suggestion')];
  }

  moveTo(position) {
    const rows = this.rows();
    if (position < 0 || position >= rows.length || position === this.index) {
      return;
    }
    rows[this.index]?.classList.remove('is-active');
    rows[this.index]?.setAttribute('aria-selected', 'false');
    this.index = position;
    rows[position].classList.add('is-active');
    rows[position].setAttribute('aria-selected', 'true');
    rows[position].scrollIntoView({ block: 'nearest' });
  }

  choose(position) {
    const item = this.items[position];
    if (item === undefined) {
      return;
    }
    this.close();
    this.field.blur();
    this.onOpen(hrefFor({ doc: item.path, anchor: item.anchor, view: 'read', history: undefined }));
  }

  onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveTo(Math.min(this.index + 1, this.items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveTo(Math.max(this.index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.choose(this.index);
    }
  }
}
