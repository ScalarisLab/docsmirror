import { el } from './dom.js';

/**
 * Taking a piece of the documentation somewhere else: to the clipboard as raw
 * markdown, or as a reference an AI agent can act on.
 */

/** The same split `@docsmirror/core` uses, so section line offsets line up exactly. */
function splitLines(text) {
  return text.split(/\r\n|\n|\r/);
}

/**
 * One section's markdown, heading included, cut at the boundaries the server
 * computed. Without a section, the whole document.
 */
export function markdownOf(payload, slug) {
  if (slug === undefined) {
    return payload.markdown;
  }
  const section = payload.sections.find((entry) => entry.slug === slug);
  if (section === undefined) {
    return payload.markdown;
  }
  return splitLines(payload.markdown).slice(section.headingLine, section.endLine).join('\n').replace(/\s+$/, '');
}

/**
 * The string a person pastes into a chat with a coding agent.
 *
 * It has to do three things in the space of a prompt line: name the target in
 * the project's own `@docs path#anchor` convention so the agent can resolve it,
 * carry the human title so the paste still means something to the person
 * reading the conversation, and read as an instruction rather than a citation.
 * The second line is the one thing an agent that has never met the convention
 * cannot guess, where the path is relative to.
 */
export function agentReferenceFor({ path, anchor, title }) {
  const pointer = anchor === undefined ? path : `${path}#${anchor}`;
  return [
    `Consult @docs ${pointer}, "${title}", before working on this.`,
    "Resolve @docs paths against this repository's docs root.",
  ].join('\n');
}

/**
 * Puts text on the clipboard, whatever the page is being served over.
 *
 * `navigator.clipboard` only exists in a secure context. `localhost` and
 * `127.0.0.1` qualify, but the moment someone reaches the same dev server over
 * a plain LAN address, `http://192.168.1.20:4321`, which is exactly how you
 * read your own docs from a second machine, the whole API is simply absent and
 * every copy button silently does nothing. The selection-based path has no such
 * requirement, so it is the fallback rather than an apology.
 */
export async function writeClipboard(text) {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or a non-secure context that still exposes the
      // object; fall through to the selection path.
    }
  }

  const field = document.createElement('textarea');
  field.value = text;
  // Must be rendered and non-readonly to be selectable, but must not scroll the
  // page or steal a visible frame.
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
  document.body.append(field);

  const restore = document.activeElement;
  try {
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    if (restore instanceof HTMLElement) {
      restore.focus({ preventScroll: true });
    }
  }
}

const CONFIRM_MS = 1400;

/**
 * Copies, then says so on the control that was pressed, the only place a
 * reader is looking at that moment. Failure is reported in the same spot
 * rather than swallowed.
 */
export function copyButton({ className, label, done = 'Copied', text, announce }) {
  let timer;
  const button = el('button', {
    type: 'button',
    class: className,
    text: label,
    onclick: async () => {
      clearTimeout(timer);
      const ok = await writeClipboard(text());
      button.textContent = ok ? done : 'Copy failed';
      button.classList.toggle('is-done', ok);
      button.classList.toggle('is-failed', !ok);
      announce?.(ok ? `${label}: copied to the clipboard.` : `${label} failed. The browser refused the clipboard.`);
      timer = setTimeout(() => {
        button.textContent = label;
        button.classList.remove('is-done', 'is-failed');
      }, CONFIRM_MS);
    },
  });
  return button;
}
