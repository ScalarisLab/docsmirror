/** Small DOM helpers. Everything the app renders goes through these. */

/**
 * Builds an element. Attributes are plain properties; `class` and `text` are
 * shorthands, and children may be nodes or strings.
 */
export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    if (name === 'class') {
      node.className = value;
    } else if (name === 'text') {
      node.textContent = value;
    } else if (name.startsWith('on') && typeof value === 'function') {
      node.addEventListener(name.slice(2), value);
    } else {
      node.setAttribute(name, value === true ? '' : String(value));
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child !== undefined && child !== null && child !== false) {
      node.append(child);
    }
  }
  return node;
}

/** Namespaced element builder, for the history graph. */
export function svg(tag, attributes = {}, children = []) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      node.setAttribute(name, String(value));
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child) {
      node.append(child);
    }
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/**
 * Renders text with every query term wrapped in a `<mark>`. Built from text
 * nodes rather than markup, so a document can never inject into the results.
 */
export function markTerms(text, terms) {
  const fragment = document.createDocumentFragment();
  const wanted = terms.filter((term) => term.length > 0);
  if (wanted.length === 0) {
    fragment.append(text);
    return fragment;
  }
  const lowered = text.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    let at = -1;
    let length = 0;
    for (const term of wanted) {
      const index = lowered.indexOf(term, cursor);
      if (index >= 0 && (at < 0 || index < at)) {
        at = index;
        length = term.length;
      }
    }
    if (at < 0) {
      fragment.append(text.slice(cursor));
      break;
    }
    fragment.append(text.slice(cursor, at));
    fragment.append(el('mark', { text: text.slice(at, at + length) }));
    cursor = at + length;
  }
  return fragment;
}

/** A calm, absolute date, the form a note carries in a list. */
export function formatDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A single explanatory line, used for empty and unavailable states. */
export function notice(headline, detail) {
  return el('div', { class: 'notice' }, [
    el('p', { class: 'notice-headline', text: headline }),
    detail ? el('p', { class: 'notice-detail', text: detail }) : null,
  ]);
}
