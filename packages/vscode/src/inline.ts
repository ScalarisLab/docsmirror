/**
 * The documentation, rendered inside the comment.
 *
 * A pointer line reads `@docs <title> ▾` and opens where it stands: the
 * section's prose appears directly under it, in the text flow, pushing the code
 * down, not in a hover that vanishes, not in a panel somewhere else on screen.
 * Reading the code and reading why it is that way become the same act.
 *
 * ## Asked for, and instant
 *
 * A section opens because the reader clicked it, and only then. What is done
 * ahead of time is the part that costs nothing: every resolved pointer in the
 * document has its prose fetched, rendered and cached before anyone asks, so the
 * marker carries its real title from the first paint and opening one is a single
 * step with the content already in hand. What is never done ahead of time is the
 * part that costs a process: a webview is created when a section is opened, and
 * at no other moment.
 *
 * ## Why this is off by default
 *
 * There is exactly one way to put arbitrary rendered content inline in a VS
 * Code editor, and it is `window.createWebviewTextEditorInset`, a *proposed*
 * API. Proposed APIs are real and stable enough to use, but VS Code only hands
 * them to an extension that declares the proposal **and** was allowed it at
 * startup, and it refuses to publish such an extension to the Marketplace.
 *
 * So the feature asks to be turned on, and everything degrades to the peek view
 * when it is off or when the API is not there. Nothing is ever written into the
 * source file to fake it: duplicating documentation into code is the exact
 * thing this tool exists to stop.
 *
 * ## Standing still
 *
 * An inset cannot be resized and cannot be moved, so every correction is a new
 * webview and every new webview is a flinch the reader sees. The height is
 * therefore known before the inset exists: remembered across sessions, or
 * estimated from the markdown when it has never been seen. The page paints on
 * the editor's own background and is revealed only once that height has been
 * accepted, and a widget near the edge of the viewport is built early and
 * released late so a scroll never builds one it is about to throw away.
 * @docs vscode.md#inline-documentation
 */

import { randomBytes } from 'node:crypto';
import { Marked, type RendererObject, type Tokens } from 'marked';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { SECTION_REQUEST, type SectionContent } from '@scalarislab/docsmirror-server/dist/protocol';
import { markersEnabled } from './markers';
import type { PointerCache, PointerMarker } from './pointers';
import { SETTINGS_SECTION } from './settings';

/** Editor settings the widget copies; a change to one rebuilds every page. */
const EDITOR_APPEARANCE = [
  'editor.fontFamily',
  'editor.fontSize',
  'editor.fontWeight',
  'editor.lineHeight',
  'editor.minimap',
  'editor.scrollbar.verticalScrollbarSize',
];
/** Nothing shorter: a section is at least its meta line and a line of prose. */
const MIN_HEIGHT = 2;
/** Nothing taller: an inset that fills the screen has stopped being a comment. */
const MAX_HEIGHT = 32;
/**
 * How many sections may be open at once, a safety net, not the cost bound.
 *
 * Nothing opens by itself, so what is alive is what the reader asked for, and a
 * reader does not ask for fifty. This only keeps a session that never closed
 * anything from accumulating renderer processes all afternoon, and when it does
 * bite, the section it closes is one that is off screen. What is visible is
 * never taken away.
 */
const MAX_OPEN_SECTIONS = 12;
/** Quiet period before a document's prose is fetched, after it was edited. */
const PREFETCH_DELAY_MS = 250;
/** And on arriving in one, where the reader is waiting for the titles. */
const PREFETCH_SETTLE_MS = 60;
/**
 * Pointers whose prose is fetched ahead of the reader. It is a string and a
 * round trip each, so the bound is generous; it exists for the generated file
 * with a thousand of them, not for the file a person wrote.
 */
const PREFETCH_LIMIT = 200;
/**
 * Quiet period before widgets are mounted and released. Short, because a section
 * already open and already measured costs one webview and no round trip, and the
 * reader scrolling back to it should find it there, but not zero, or a scroll
 * would do this work on every frame it fires.
 */
const REFLOW_DELAY_MS = 40;
/**
 * The hysteresis. A widget is built while its line is within this many rows of
 * the viewport and released only past the second, wider band, so a line sitting
 * on the edge of the screen never oscillates between having a webview and not.
 */
const MOUNT_MARGIN_LINES = 20;
const RELEASE_MARGIN_LINES = 80;
/**
 * Rows of slack accepted between the height an inset was created at and the
 * height its content turned out to need. Below it, replacing the inset would
 * trade a row of background nobody notices for a rebuild everybody sees.
 */
const HEIGHT_TOLERANCE_ROWS = 1;
/** Rebuilds allowed before a widget is shown as it is. Guards against a loop. */
const MAX_SETTLE_ATTEMPTS = 2;
/** Widths within one bucket wrap prose the same way, near enough to a row. */
const WIDTH_BUCKET_PX = 40;
/** Assumed content width until a real one has been measured, once, ever. */
const DEFAULT_CONTENT_WIDTH_PX = 900;
/** Heights remembered before the oldest are dropped. */
const HEIGHT_MEMORY_LIMIT = 400;
const HEIGHT_MEMORY_KEY = 'docsmirror.inline.heights';
const WIDTH_MEMORY_KEY = 'docsmirror.inline.contentWidth';

/** A section fetched and rendered, ready to be opened on any line. */
interface Prepared {
  readonly sectionKey: string;
  readonly markdown: string;
  readonly body: string;
}

/**
 * The proposed surface, kept in one narrow shape. The extension is typed
 * against stable `@types/vscode`, which by definition does not describe a
 * proposal, so this is where the two meet, once, explicitly, rather than an
 * `any` scattered through the feature.
 */
interface WebviewEditorInset {
  readonly webview: vscode.Webview;
  readonly onDidDispose: vscode.Event<void>;
  dispose(): void;
}

type InsetFactory = (
  editor: vscode.TextEditor,
  line: number,
  height: number,
  options?: vscode.WebviewOptions,
) => WebviewEditorInset;

/** The API, or `undefined` when this VS Code did not grant the proposal. */
function insetFactory(): InsetFactory | undefined {
  const candidate = (vscode.window as unknown as { createWebviewTextEditorInset?: InsetFactory })
    .createWebviewTextEditorInset;
  return typeof candidate === 'function' ? candidate : undefined;
}

function inlineEnabled(): boolean {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION).get<boolean>('inlineDocs.enabled', false);
}

/** Whether the inline view can actually run here, setting and API both. */
export function inlineAvailable(): boolean {
  return inlineEnabled() && insetFactory() !== undefined;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The editor's own typography, which the widget wears rather than approximates.
 * A section that renders in the UI font at the UI size reads as a web page
 * embedded in the file; one that sits on the editor's row height, with code in
 * the editor's own font at the editor's own size, reads as the file.
 */
interface EditorTypography {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  /**
   * A text row in pixels, the unit an inset's height is counted in, and what
   * lets the page measure itself in pixels and be given back a height in rows.
   */
  readonly lineHeight: number;
  /**
   * What the editor's own furniture covers on the right of an inset. An inset
   * is as wide as the whole editor, minimap and scrollbar included, and both of
   * those are painted *over* it, prose that runs under them is prose the reader
   * cannot read.
   */
  readonly rightGutter: number;
}

function editorTypography(): EditorTypography {
  const settings = vscode.workspace.getConfiguration('editor');
  const fontSize = settings.get<number>('fontSize', 14);
  // VS Code reads `lineHeight` as a multiplier below 8, as pixels above it, and
  // as "derive it from the font size" at 0. All three have to be reproduced or
  // the widget is sized in a row that is not the editor's row.
  const configured = settings.get<number>('lineHeight', 0);
  const lineHeight =
    configured <= 0 ? Math.round(fontSize * 1.5) : configured < 8 ? Math.round(configured * fontSize) : configured;
  const fontFamily = settings.get<string>('fontFamily', '').trim();
  // The minimap's width is not published to extensions, so this is the widest it
  // can be from its own settings. Reserving a little too much leaves editor
  // background at the end of a line; reserving too little hides words.
  const scrollbar = settings.get<number>('scrollbar.verticalScrollbarSize', 14);
  const minimap =
    settings.get<boolean>('minimap.enabled', true) && settings.get<string>('minimap.side', 'right') === 'right'
      ? clamp(settings.get<number>('minimap.maxColumn', 120) * settings.get<number>('minimap.scale', 1), 40, 200)
      : 0;
  return {
    fontFamily: fontFamily === '' ? 'var(--vscode-editor-font-family)' : fontFamily,
    fontSize,
    fontWeight: settings.get<string>('fontWeight', 'normal').trim() || 'normal',
    lineHeight,
    rightGutter: scrollbar + minimap,
  };
}

/** A settings value on its way into a stylesheet, with no way out of it. */
function cssSafe(value: string): string {
  return value.replace(/[<>{};]/g, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Markdown to HTML.
 *
 * An earlier version of this function asked `markdown.api.render`, an
 * internal command the built-in markdown extension happens to expose, to do
 * this, on the theory that no library needs bundling if the editor already
 * has a renderer. That command is undocumented and not guaranteed present:
 * when it is not, or resolves to something that is not a string, prose that
 * should read as a paragraph with a link in it read as the raw markdown
 * instead, `[title](url)`, brackets and all, never turned into anything.
 * `marked` is what `@scalarislab/docsmirror-web` already renders the same convention
 * with, so this is the same dependency, not a new risk, in exchange for a
 * renderer that is guaranteed to run.
 *
 * Raw HTML in the markdown is escaped rather than passed through, matching
 * `@scalarislab/docsmirror-web`'s renderer: this webview runs with scripts enabled, and a
 * project's own docs are not something to trust with that.
 */

/**
 * Schemes a link may keep. An href is executable surface in a webview with
 * scripts on, `javascript:` above all, and `marked` passes it through, so
 * only schemes that cannot run code survive, plus the in-document `#anchor`
 * the page scrolls to natively. Everything else keeps its text and loses its
 * link, the same treatment `@scalarislab/docsmirror-web` gives a target it will not open.
 */
const SAFE_LINK = /^(?:https?:|mailto:|#)/i;

function renderMarkdown(markdown: string): string {
  const renderer: RendererObject = {
    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },
    link(token: Tokens.Link): string {
      const inline = this.parser.parseInline(token.tokens);
      const href = token.href.trim();
      if (!SAFE_LINK.test(href)) {
        return `<span class="unlinked" title="${escapeHtml(href)}">${inline}</span>`;
      }
      const title =
        token.title === null || token.title === undefined ? '' : ` title="${escapeHtml(token.title)}"`;
      return `<a href="${escapeHtml(href)}"${title}>${inline}</a>`;
    },
  };
  const engine = new Marked({ gfm: true, breaks: false, async: false }, { renderer });
  return engine.parse(markdown) as string;
}

/**
 * The server absolutizes relative image targets to `file:` URIs, which render
 * fine in a hover and not at all here: a webview only loads resources through
 * its own `asWebviewUri` scheme, and only from the roots it was created with.
 * Rewritten per webview at mount time, because the mapping belongs to the
 * instance while the rendered body is cached per section.
 */
function withWebviewImages(webview: vscode.Webview, body: string): string {
  return body.replace(
    /(<img\b[^>]*\bsrc=")(file:[^"]+)(")/g,
    (whole, prefix: string, target: string, suffix: string): string => {
      try {
        const uri = vscode.Uri.parse(target.replace(/&amp;/g, '&'), true);
        return `${prefix}${escapeHtml(webview.asWebviewUri(uri).toString())}${suffix}`;
      } catch {
        return whole;
      }
    },
  );
}

/** The section's prose and its provenance line, rendered once per section. */
function bodyOf(section: SectionContent, rendered: string): string {
  return `<div class="meta">${escapeHtml(section.path)} · ${escapeHtml(section.freshness)}</div>${rendered}`;
}

/**
 * The page.
 *
 * It is styled from the editor's own settings and the theme's own variables, so
 * the section reads as part of the file; it starts invisible on the editor's
 * background and eases in, so no reader ever sees a webview's own empty frame or
 * a layout that was about to change; and it indents itself to the column the
 * pointer starts at, measuring the editor font to get there, so the prose lines
 * up with the comment it belongs to instead of with the window.
 *
 * Scripts are enabled, the page has to measure itself, so the policy is the
 * counterweight: nothing loads by default, images only from the webview's own
 * scheme plus `https:` and `data:`, and the one inline script runs on a nonce
 * minted per page. A doc that smuggles markup in has already had it escaped;
 * this line holds even if that one ever slips.
 */
function page(body: string, type: EditorTypography, indent: number, cspSource: string): string {
  const nonce = randomBytes(16).toString('base64');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root {
    color-scheme: light dark;
    --dm-row: ${type.lineHeight}px;
    --dm-code-family: ${cssSafe(type.fontFamily)};
    --dm-code-size: ${type.fontSize}px;
    --dm-code-weight: ${cssSafe(type.fontWeight)};
    --dm-indent: 0px;
  }
  html { background: var(--vscode-editor-background); }
  body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: var(--dm-code-size);
    line-height: var(--dm-row);
    color: var(--vscode-editor-foreground);
    /* The inset itself cannot grow past its cap, but its content still can:
       a section longer than the cap scrolls inside the room it was given
       rather than losing its tail to a fade nothing can then reach. */
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }
  /* Invisible until the height it reported has been accepted, then eased in.
     The rows themselves arrive in one step, an inset is created at a fixed
     height and cannot grow, so what is animated is the prose settling into the
     room the editor just made for it. */
  .frame {
    padding: 0 ${type.rightGutter}px calc(var(--dm-row) * 0.4) var(--dm-indent);
    opacity: 0;
    transform: translateY(calc(var(--dm-row) * -0.4));
    transition: opacity 120ms ease-out, transform 120ms ease-out;
  }
  body.ready .frame { opacity: 0.95; transform: none; }
  .meta {
    font-size: 0.85em;
    opacity: 0.55;
  }
  h1, h2, h3, h4, h5, h6 { font-size: 1em; font-weight: 600; margin: calc(var(--dm-row) * 0.4) 0 0; }
  p, ul, ol, blockquote, table { margin: calc(var(--dm-row) * 0.2) 0; }
  ul, ol { padding-left: 1.6em; }
  code, pre {
    font-family: var(--dm-code-family);
    font-size: var(--dm-code-size);
    font-weight: var(--dm-code-weight);
  }
  code { background: var(--vscode-textCodeBlock-background); padding: 0 0.25em; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 0 0.6em; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  a { color: var(--vscode-textLink-foreground); }
  /* A link whose target was refused: the words stay, the affordance goes. */
  .unlinked { text-decoration: underline dotted; opacity: 0.8; }
  blockquote { padding-left: 1.2em; font-style: italic; opacity: 0.85; }
  table { border-collapse: collapse; }
  /* Rows are separated by a baseline, never by columns of rules. */
  td, th { border-bottom: 1px solid var(--vscode-editorWidget-border); padding: 0 1.2em 0 0; text-align: left; }
  th { font-weight: 600; }
  img { max-width: 100%; }
</style></head>
<body><div class="frame">${body}</div>
<script nonce="${nonce}">
  const api = acquireVsCodeApi();
  const frame = document.querySelector('.frame');
  const indent = ${indent};
  const gutter = ${type.rightGutter};

  /* The pointer's own column, in pixels of the editor's own font. */
  const indentWidth = () => {
    if (indent <= 0) {
      return 0;
    }
    const ruler = document.createElement('span');
    ruler.textContent = ' '.repeat(indent);
    ruler.style.cssText =
      'position:absolute;visibility:hidden;white-space:pre;font-family:var(--dm-code-family);font-size:var(--dm-code-size)';
    document.body.appendChild(ruler);
    const width = ruler.getBoundingClientRect().width;
    ruler.remove();
    return width;
  };

  const indentPx = indentWidth();
  let reported = -1;
  const measure = () => {
    const height = Math.ceil(frame.getBoundingClientRect().bottom);
    if (height === reported) {
      return;
    }
    reported = height;
    /* The width prose actually wrapped at: the frame less what pads it. */
    api.postMessage({ type: 'height', height, width: frame.clientWidth - indentPx - gutter });
  };

  document.documentElement.style.setProperty('--dm-indent', indentPx + 'px');
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'reveal') {
      return;
    }
    document.body.classList.add('ready');
  });
  new ResizeObserver(measure).observe(frame);
  measure();
</script>
</body></html>`;
}

/**
 * A section that is open. It survives scrolling: the webview under it is torn
 * down when the line leaves the viewport for good and rebuilt when it comes
 * back, which is invisible because the rendered HTML and the measured height are
 * kept here rather than recomputed.
 */
interface Expansion {
  readonly uri: string;
  readonly line: number;
  /** Identifies the section itself, so its measured height survives the widget. */
  readonly sectionKey: string;
  /** The column the pointer starts at, which the widget indents itself to. */
  readonly indent: number;
  readonly body: string;
  height: number;
  /** Rebuilds spent chasing the right height, capped so it can never spin. */
  attempts: number;
}

/** One edit, reduced to what it does to a line number. */
interface Edit {
  /** First line the edit rewrote. */
  readonly from: number;
  /** Last line the edit rewrote, before it was applied. */
  readonly to: number;
  /** Lines gained or lost, zero for anything typed inside a single line. */
  readonly delta: number;
}

function editOf(change: vscode.TextDocumentContentChangeEvent): Edit {
  const from = change.range.start.line;
  const to = change.range.end.line;
  return { from, to, delta: change.text.split('\n').length - 1 - (to - from) };
}

/**
 * Where a remembered line ends up after an edit, or `undefined` when the edit
 * rewrote it and whatever was remembered about it no longer applies.
 */
function lineAfterEdit(line: number, edit: Edit): number | undefined {
  if (line >= edit.from && line <= edit.to) {
    return undefined;
  }
  return line > edit.to ? line + edit.delta : line;
}

/** A short, stable digest of a string. FNV-1a: enough to key a cache on. */
function digest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * How tall a section will turn out to be, before anything has been built.
 *
 * Prose wraps, so the answer depends on the width and the font as much as on
 * the text; both are known, the width from the last widget that measured
 * itself, the font from the editor's settings, and the estimate only has to be
 * close, because a miss of a row is accepted and a real miss is corrected once,
 * behind a page that has not been shown yet.
 */
function estimateRows(markdown: string, type: EditorTypography, contentWidth: number): number {
  // Half the font size is the usual advance width of a proportional face at
  // these sizes; it is a wrapping estimate, not a metric.
  const columns = Math.max(20, Math.floor(contentWidth / (type.fontSize * 0.5)));
  let rows = 1;
  let paragraph = 0;
  let fenced = false;

  const flush = (): void => {
    if (paragraph > 0) {
      rows += Math.ceil(paragraph / columns) + 0.2;
      paragraph = 0;
    }
  };

  for (const line of markdown.split('\n')) {
    const text = line.trim();
    if (text.startsWith('```')) {
      flush();
      fenced = !fenced;
      rows += 1;
      continue;
    }
    if (fenced) {
      rows += 1;
      continue;
    }
    if (text === '') {
      flush();
      continue;
    }
    if (/^!\[[^\]]*\]\(/.test(text)) {
      flush();
      // An image is whatever it is; a screenshot in a doc is usually most of a
      // screen, and over-reaching costs a row of background, not a rebuild.
      rows += 10;
      continue;
    }
    // A heading, a list item and a table row each stand on their own line
    // instead of joining the paragraph around them.
    if (/^([#>|*+-]|\d+\.)\s?/.test(text)) {
      flush();
      rows += Math.ceil(text.length / columns) + (text.startsWith('#') ? 0.6 : 0);
      continue;
    }
    paragraph += text.length + 1;
  }
  flush();
  return clamp(Math.ceil(rows + 0.6), MIN_HEIGHT, MAX_HEIGHT);
}

/**
 * The heights sections turned out to need, kept between sessions.
 *
 * An inset cannot be resized, so a height learned too late costs a rebuild the
 * reader sees. Learned once and written down, it costs nothing ever again, on
 * this file, on another file pointing at the same section, and tomorrow morning.
 * A height is only valid for the content, the row height and the width it was
 * measured at, so all three are in the key.
 */
class HeightMemory {
  private readonly rows: Map<string, number>;
  private width: number;

  constructor(private readonly store: vscode.Memento) {
    this.rows = new Map(Object.entries(store.get<Record<string, number>>(HEIGHT_MEMORY_KEY, {})));
    this.width = store.get<number>(WIDTH_MEMORY_KEY, DEFAULT_CONTENT_WIDTH_PX);
  }

  /** The width prose is assumed to wrap at, from the last widget to say. */
  get contentWidth(): number {
    return this.width;
  }

  key(sectionKey: string, body: string, indent: number, type: EditorTypography): string {
    const bucket = Math.round(this.width / WIDTH_BUCKET_PX);
    return `${sectionKey}|${digest(body)}|${type.lineHeight}|${indent}|${bucket}`;
  }

  get(key: string): number | undefined {
    return this.rows.get(key);
  }

  set(key: string, rows: number): void {
    if (this.rows.get(key) === rows) {
      return;
    }
    // Re-inserted rather than updated, so what is used stays and what is stale
    // reaches the front of the queue and falls off it.
    this.rows.delete(key);
    this.rows.set(key, rows);
    this.persist();
  }

  observeWidth(width: number): void {
    if (width <= 0 || Math.round(width / WIDTH_BUCKET_PX) === Math.round(this.width / WIDTH_BUCKET_PX)) {
      return;
    }
    this.width = width;
    void this.store.update(WIDTH_MEMORY_KEY, width);
  }

  private persist(): void {
    while (this.rows.size > HEIGHT_MEMORY_LIMIT) {
      const oldest = this.rows.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.rows.delete(oldest.value);
    }
    void this.store.update(HEIGHT_MEMORY_KEY, Object.fromEntries(this.rows));
  }
}

/** A webview that exists right now, in one editor, for one expansion. */
interface LiveInset {
  readonly inset: WebviewEditorInset;
  /** The editor it lives in: a document open in two columns has two of these. */
  readonly column: number;
  readonly uri: string;
  readonly line: number;
  /** The height it was created at, which it cannot change. */
  readonly height: number;
  disposing: boolean;
}

/**
 * What the collapsed marker needs to know: which lines are open right now, so
 * it can turn its chevron over rather than invite the reader to open what is
 * already open.
 */
export interface ExpandedSections {
  linesIn(uri: string): ReadonlySet<number>;
  readonly onDidChange: vscode.Event<void>;
}

export interface InlineDocs {
  /** Opens or closes the section on the cursor's line. */
  readonly toggle: () => Promise<void>;
  /** Fetches what the active document points at, for the moments only the caller knows about. */
  readonly refresh: () => void;
  readonly expanded: ExpandedSections;
}

/**
 * Sets the feature up.
 *
 * ## What is spent, and when
 *
 * An inset is a webview: its own document, its own renderer process, its own
 * memory. Sections are opened by hand, so that cost is asked for, and the two
 * rules below keep it from outliving the asking:
 *
 * - **Prose is prefetched, webviews are not.** A section's rendered HTML and its
 *   remembered height are a string and a number; every pointer in the document
 *   has them ready long before the reader arrives, which is what makes a click
 *   open instantly and stops the marker from changing under the reader's eyes.
 * - **The viewport still releases them.** An open section far from the screen
 *   loses its webview and gets it back, from that same cached HTML, before it
 *   comes into view, so a file left with a dozen sections open costs what the
 *   window can show, not what the reader opened all afternoon.
 */
export function registerInlineDocs(
  context: vscode.ExtensionContext,
  client: () => LanguageClient | undefined,
  pointers: PointerCache,
  /**
   * What a click falls back to when the inline view is not available, the
   * usual case, since it needs a proposed API most installs never have. This
   * is `docsmirror.peek`: the same command `Alt+D` runs, and the one that
   * already knows to try inline first and fall back to the native peek view.
   * Takes the pointer's own position explicitly rather than reading the
   * caret, because by the time it runs the caret has already been parked at
   * column 0, outside the pointer go-to-definition needs to resolve it.
   */
  openElsewhere: (uri: string, line: number, character: number) => Promise<void>,
): InlineDocs {
  /** Least recently opened first. */
  const expansions: Expansion[] = [];
  const live = new Map<string, LiveInset>();
  const changed = new vscode.EventEmitter<void>();
  const heights = new HeightMemory(context.globalState);
  /** A page already rendered, by section, the same section twice costs one render. */
  const renderedBodies = new Map<string, string>();
  /** Sections already fetched, by `uri#line`; dropped when the document changes. */
  const prepared = new Map<string, Prepared>();
  let prefetchTimer: NodeJS.Timeout | undefined;
  let reflowTimer: NodeJS.Timeout | undefined;
  /** Bumped whenever the world moves, so an in-flight prefetch knows it is stale. */
  let generation = 0;
  /**
   * Set by anything that opens or closes a section. The marker redraws on that
   * event, and scrolling reconciles many times a second, so saying nothing when
   * nothing opened or closed is what keeps a scroll from repainting the file.
   */
  let coverageChanged = false;

  const lineKey = (uri: string, line: number): string => `${uri}#${line}`;
  const keyOf = (expansion: Expansion): string => lineKey(expansion.uri, expansion.line);
  const viewKey = (editor: vscode.TextEditor, expansion: Expansion): string =>
    `${editor.viewColumn ?? 0}::${keyOf(expansion)}`;

  /** Announces a coverage change once, to whoever draws the pointer lines. */
  const notify = (): void => {
    if (!coverageChanged) {
      return;
    }
    coverageChanged = false;
    changed.fire();
  };

  /** The line number a `uri#line` key names, or `undefined` for another document. */
  const lineOf = (uri: string, key: string): number | undefined => {
    if (!key.startsWith(`${uri}#`)) {
      return undefined;
    }
    const line = Number(key.slice(uri.length + 1));
    return Number.isNaN(line) ? undefined : line;
  };

  const unmount = (key: string): void => {
    const held = live.get(key);
    if (held === undefined) {
      return;
    }
    live.delete(key);
    held.disposing = true;
    held.inset.dispose();
  };

  /** Every webview an expansion has, across every editor showing its document. */
  const unmountEverywhere = (expansion: Expansion): void => {
    for (const [key, held] of [...live]) {
      if (held.uri === expansion.uri && held.line === expansion.line) {
        unmount(key);
      }
    }
  };

  const forget = (expansion: Expansion): void => {
    const index = expansions.indexOf(expansion);
    if (index >= 0) {
      expansions.splice(index, 1);
      coverageChanged = true;
    }
    unmountEverywhere(expansion);
  };

  const forgetIn = (uri: vscode.Uri): void => {
    for (const expansion of [...expansions]) {
      if (expansion.uri === uri.toString()) {
        forget(expansion);
      }
    }
  };

  const forgetAll = (): void => {
    for (const expansion of [...expansions]) {
      forget(expansion);
    }
  };

  /** Everything cached about a document, when its text no longer matches. */
  const dropPrepared = (uri: string): void => {
    for (const key of [...prepared.keys()]) {
      if (key.startsWith(`${uri}#`)) {
        prepared.delete(key);
      }
    }
  };

  /**
   * Applies one edit to everything remembered by line.
   *
   * Typing inside a line moves nothing, and that is almost all typing: the
   * sections on screen keep the webviews they already have, and the prose
   * already fetched stays fetched. Only a change in the *number* of lines moves
   * the sections below it, and an inset cannot be moved, its line is fixed when
   * it is created, so those are closed and the reader opens them again.
   *
   * The lines the edit rewrote are the exception: what a pointer said there may
   * no longer be what it says.
   */
  const applyEdit = (uri: string, edit: Edit): void => {
    for (const expansion of [...expansions]) {
      if (expansion.uri === uri && lineAfterEdit(expansion.line, edit) !== expansion.line) {
        forget(expansion);
      }
    }
    for (const [key, entry] of [...prepared]) {
      const line = lineOf(uri, key);
      if (line === undefined) {
        continue;
      }
      const moved = lineAfterEdit(line, edit);
      prepared.delete(key);
      if (moved !== undefined) {
        prepared.set(lineKey(uri, moved), entry);
      }
    }
  };

  /**
   * What the page reports once it has laid itself out, and what is done about it.
   *
   * The height is written down for every later opening of the same section. When
   * it is the height the inset already has, the usual case, because it came
   * from that memory or from an estimate that was close, the page is simply
   * shown. When it is not, the inset is replaced *before* anything has been
   * revealed, so the correction happens under a surface that is still the
   * editor's own background.
   */
  const settle = (editor: vscode.TextEditor, expansion: Expansion, key: string, height: number): void => {
    const held = live.get(key);
    if (held === undefined) {
      return;
    }
    const type = editorTypography();
    const rows = clamp(Math.ceil(height / type.lineHeight), MIN_HEIGHT, MAX_HEIGHT);
    heights.set(heights.key(expansion.sectionKey, expansion.body, expansion.indent, type), rows);

    // Already at the cap and still genuinely taller: no rebuild would ever
    // close that gap, so this counts as settled rather than retried forever.
    // The content itself still scrolls to its real end inside the fixed inset.
    const pinnedAtCap = held.height >= MAX_HEIGHT && height > MAX_HEIGHT * type.lineHeight;
    const slack = held.height - rows;
    const fits = rows === held.height || pinnedAtCap || (slack > 0 && slack <= HEIGHT_TOLERANCE_ROWS);
    if (fits || expansion.attempts >= MAX_SETTLE_ATTEMPTS) {
      void held.inset.webview.postMessage({ type: 'reveal' });
      return;
    }
    expansion.height = rows;
    expansion.attempts += 1;
    unmount(key);
    mount(editor, expansion);
  };

  /**
   * Builds the webview for one expansion, in one editor, at a height that is
   * already known, remembered from a previous opening or estimated from the
   * prose. The page stays invisible until that height has been confirmed.
   */
  const mount = (editor: vscode.TextEditor, expansion: Expansion): void => {
    const create = insetFactory();
    const key = viewKey(editor, expansion);
    // The editor may have moved on since the caller decided to build this: a
    // widget pinned to a line of a document that is no longer there would land
    // on whatever text took its place.
    if (
      create === undefined ||
      live.has(key) ||
      editor.document.uri.toString() !== expansion.uri ||
      expansion.line >= editor.document.lineCount
    ) {
      return;
    }
    const type = editorTypography();
    const inset = create(editor, expansion.line, expansion.height, {
      enableScripts: true,
      // What `asWebviewUri` may serve: the workspace, where the docs and the
      // images they embed live. Without this the rewritten image URIs would
      // resolve and still refuse to load.
      localResourceRoots: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
    });
    const held: LiveInset = {
      inset,
      column: editor.viewColumn ?? 0,
      uri: expansion.uri,
      line: expansion.line,
      height: expansion.height,
      disposing: false,
    };
    live.set(key, held);

    inset.webview.onDidReceiveMessage((message: { type?: string; height?: number; width?: number }) => {
      if (message.type !== 'height' || typeof message.height !== 'number' || live.get(key) !== held) {
        return;
      }
      if (typeof message.width === 'number') {
        heights.observeWidth(message.width);
      }
      settle(editor, expansion, key, message.height);
    });

    inset.onDidDispose(() => {
      if (!held.disposing && live.get(key) === held) {
        live.delete(key);
      }
    });

    inset.webview.html = page(
      withWebviewImages(inset.webview, expansion.body),
      type,
      expansion.indent,
      inset.webview.cspSource,
    );
  };

  /** How far a line is from what the editor is actually showing, in rows. */
  const distance = (editor: vscode.TextEditor, line: number): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const range of editor.visibleRanges) {
      const gap = line < range.start.line ? range.start.line - line : Math.max(0, line - range.end.line);
      best = Math.min(best, gap);
    }
    return best;
  };

  const showsDocument = (editor: vscode.TextEditor, uri: string): boolean => editor.document.uri.toString() === uri;

  const visibleSomewhere = (expansion: Expansion): boolean =>
    vscode.window.visibleTextEditors.some(
      (editor) => showsDocument(editor, expansion.uri) && distance(editor, expansion.line) === 0,
    );

  const expansionAt = (uri: string, line: number): Expansion | undefined =>
    expansions.find((expansion) => expansion.uri === uri && expansion.line === line);

  /**
   * Brings the live webviews in line with what is open and near the screen. It
   * is the single place widgets are created and destroyed, so no caller can leak
   * one by forgetting to, and the two margins are what keep a scroll from
   * building and tearing down the same widget at the edge of the viewport.
   */
  const reconcile = (): void => {
    const editors = vscode.window.visibleTextEditors;
    for (const [key, held] of [...live]) {
      const editor = editors.find(
        (candidate) => (candidate.viewColumn ?? 0) === held.column && showsDocument(candidate, held.uri),
      );
      const open = expansionAt(held.uri, held.line) !== undefined;
      if (editor === undefined || !open || distance(editor, held.line) > RELEASE_MARGIN_LINES) {
        unmount(key);
      }
    }
    for (const editor of editors) {
      for (const expansion of expansions) {
        if (showsDocument(editor, expansion.uri) && distance(editor, expansion.line) <= MOUNT_MARGIN_LINES) {
          mount(editor, expansion);
        }
      }
    }
    notify();
  };

  const reflowSoon = (): void => {
    if (reflowTimer !== undefined) {
      return;
    }
    reflowTimer = setTimeout(() => {
      reflowTimer = undefined;
      reconcile();
    }, REFLOW_DELAY_MS);
  };

  /** Closes what is off screen first, and only ever what is off screen last. */
  const trim = (): void => {
    while (expansions.length > MAX_OPEN_SECTIONS) {
      const victim = expansions.find((expansion) => !visibleSomewhere(expansion)) ?? expansions[0];
      if (victim === undefined) {
        return;
      }
      forget(victim);
    }
  };

  /**
   * Fetches and renders the section on a line, once. The result is keyed by
   * line and by section, so a second pointer at the same section, or a reader
   * closing one and opening it again, costs neither a round trip nor a render.
   */
  const prepare = async (
    active: LanguageClient,
    document: vscode.TextDocument,
    line: number,
  ): Promise<Prepared | undefined> => {
    const uri = document.uri.toString();
    const key = lineKey(uri, line);
    const held = prepared.get(key);
    if (held !== undefined) {
      return held;
    }

    // JSON-RPC carries "nothing" as null, never as undefined: a strict
    // `=== undefined` here read an absent section as a present one.
    const section = await active.sendRequest<SectionContent | null>(SECTION_REQUEST, {
      textDocument: { uri },
      position: { line, character: 0 },
    });
    if (section === null || section === undefined) {
      return undefined;
    }

    const sectionKey = `${section.path}#${section.title}`;
    const body = renderedBodies.get(sectionKey) ?? bodyOf(section, renderMarkdown(section.markdown));
    renderedBodies.set(sectionKey, body);
    const entry: Prepared = { sectionKey, markdown: section.markdown, body };
    prepared.set(key, entry);
    return entry;
  };

  /**
   * The column the pointer's own text starts at, so the widget can line up with
   * the comment rather than with the window.
   */
  const indentOf = (document: vscode.TextDocument, line: number): number => {
    if (line >= document.lineCount) {
      return 0;
    }
    const text = document.lineAt(line).text;
    const keyword = text.indexOf('@docs');
    return keyword >= 0 ? keyword : text.length - text.trimStart().length;
  };

  const open = (document: vscode.TextDocument, line: number, entry: Prepared): void => {
    const type = editorTypography();
    const indent = indentOf(document, line);
    const key = heights.key(entry.sectionKey, entry.body, indent, type);
    expansions.push({
      uri: document.uri.toString(),
      line,
      sectionKey: entry.sectionKey,
      indent,
      body: entry.body,
      height: heights.get(key) ?? estimateRows(entry.markdown, type, heights.contentWidth),
      attempts: 0,
    });
    coverageChanged = true;
  };

  /**
   * Everything the document points at, fetched and rendered before anyone asks
   * for it.
   *
   * This is what makes an open instant and what stops a section from popping in
   * when the reader lands on it: by the time a pointer is on screen its prose is
   * a string in memory. It costs one round trip per distinct section and no
   * webview at all.
   */
  const prefetch = async (document: vscode.TextDocument): Promise<void> => {
    const active = client();
    if (!inlineAvailable() || active === undefined) {
      return;
    }
    const mine = ++generation;
    const result = await pointers.resolve(active, document);
    if (result === undefined || mine !== generation) {
      return;
    }
    const lines = result.markers
      .filter((marker) => marker.resolved)
      .map((marker) => marker.range.start.line)
      .slice(0, PREFETCH_LIMIT);
    for (const line of lines) {
      if (mine !== generation) {
        return;
      }
      await prepare(active, document, line);
    }
  };

  const prefetchSoon = (document: vscode.TextDocument | undefined, delay: number): void => {
    generation += 1;
    if (prefetchTimer !== undefined) {
      clearTimeout(prefetchTimer);
      prefetchTimer = undefined;
    }
    if (document === undefined || !inlineAvailable()) {
      return;
    }
    prefetchTimer = setTimeout(() => {
      prefetchTimer = undefined;
      void prefetch(document);
    }, delay);
  };

  /**
   * Opens or closes the section on a line. Closing is immediate; opening waits
   * only for prose that has almost always been fetched already.
   */
  const toggleAt = async (editor: vscode.TextEditor, line: number): Promise<void> => {
    const uri = editor.document.uri.toString();
    const already = expansionAt(uri, line);
    if (already !== undefined) {
      forget(already);
      notify();
      return;
    }

    const active = client();
    if (insetFactory() === undefined || active === undefined) {
      return;
    }
    const entry = await prepare(active, editor.document, line);
    if (entry === undefined) {
      void vscode.window.showInformationMessage('DocsMirror: no resolved pointer on this line.');
      return;
    }
    if (expansionAt(uri, line) === undefined) {
      open(editor.document, line, entry);
    }
    trim();
    reconcile();
  };

  const toggle = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (editor !== undefined) {
      await toggleAt(editor, editor.selection.active.line);
    }
  };

  /**
   * The resolved pointer on a line. Almost always straight from the cache the
   * markers keep warm; the round trip is there for the click that lands in the
   * moment after an edit, which must not be a click that does nothing.
   */
  const pointerOn = async (
    document: vscode.TextDocument,
    line: number,
  ): Promise<PointerMarker | undefined> => {
    const active = client();
    const cached = pointers.get(document);
    const result = cached ?? (active === undefined ? undefined : await pointers.resolve(active, document));
    return result?.markers.find((marker) => marker.resolved && marker.range.start.line === line);
  };

  /**
   * A click on `@docs` itself, on the comment prefix and indentation before
   * it, or on the background past the end of the line, opens the section, and
   * a click there again closes it, inline when it is available, and through
   * `openElsewhere` (the native peek view) when it is not, which is most
   * installs.
   *
   * A decoration cannot be clicked, it is not a control, it is painted text
   *, so the click is read from where the caret landed, which is the only
   * signal the editor gives, and that signal only exists over *real* text or
   * real (if empty) space. The label reading the section's title is neither:
   * it is a decoration's own painted content, over characters hidden by
   * `display: none` to make room for it, and clicking it lands on painted
   * pixels the caret never reports a position for. `@docs` and the line's own
   * background do report one, which is what this handles.
   *
   * The caret is parked at the start of the line before opening or closing,
   * because clicking the same character twice moves nothing and the editor
   * reports nothing, which would leave the chevron unable to close what it
   * just opened.
   */
  const clicked = async (editor: vscode.TextEditor, position: vscode.Position): Promise<void> => {
    // The click contract belongs to the accordion. With the markers off there
    // is no chevron inviting one, and a pointer line is plain text: a reader
    // clicking into it to edit must not have the caret yanked to column 0 and
    // a section opened over the words they aimed at.
    if (!markersEnabled()) {
      return;
    }
    const marker = await pointerOn(editor.document, position.line);
    if (marker === undefined) {
      return;
    }
    // The answer may have taken a round trip; the caret may have moved on since.
    if (!editor.selection.isEmpty || !editor.selection.active.isEqual(position)) {
      return;
    }
    if (marker.range.start.character > 0) {
      const home = new vscode.Position(position.line, 0);
      editor.selection = new vscode.Selection(home, home);
    }
    if (inlineAvailable()) {
      await toggleAt(editor, position.line);
      return;
    }
    await openElsewhere(editor.document.uri.toString(), marker.range.start.line, marker.range.start.character);
  };

  const expanded: ExpandedSections = {
    linesIn: (uri) => {
      const lines = new Set<number>();
      for (const expansion of expansions) {
        if (expansion.uri === uri) {
          lines.add(expansion.line);
        }
      }
      return lines;
    },
    onDidChange: changed.event,
  };

  const refresh = (): void => prefetchSoon(vscode.window.activeTextEditor?.document, PREFETCH_SETTLE_MS);

  /**
   * Everything rendered, measured or open is wrong: start the document again.
   * The height memory survives on purpose, its keys carry a digest of the
   * rendered body, so an entry for content that changed simply never matches
   * again, and the LRU bound retires it in its own time.
   */
  const rebuild = (): void => {
    forgetAll();
    prepared.clear();
    renderedBodies.clear();
    notify();
    refresh();
  };

  const docsWatcher = vscode.workspace.createFileSystemWatcher('**/*.{md,markdown}');

  context.subscriptions.push(
    changed,
    vscode.window.onDidChangeTextEditorVisibleRanges(() => reflowSoon()),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      reflowSoon();
      prefetchSoon(editor?.document, PREFETCH_SETTLE_MS);
    }),
    // A split closed, or a tab replaced: the widgets in it have no editor left.
    vscode.window.onDidChangeVisibleTextEditors(() => reflowSoon()),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
        return;
      }
      const [selection] = event.selections;
      if (event.selections.length !== 1 || selection === undefined || !selection.isEmpty) {
        return;
      }
      void clicked(event.textEditor, selection.active);
    }),
    // An inset is pinned to a line number and cannot be moved, so a line added
    // above one drifts it away from the pointer it belongs to and it has to go.
    // Everything the edit did not move is left exactly as it is, widgets and
    // prose alike.
    vscode.workspace.onDidChangeTextDocument((event) => {
      const uri = event.document.uri.toString();
      for (const change of event.contentChanges) {
        applyEdit(uri, editOf(change));
      }
      notify();
      prefetchSoon(event.document, PREFETCH_DELAY_MS);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      forgetIn(document.uri);
      dropPrepared(document.uri.toString());
      notify();
    }),
    // A document under the docs root changed: what was rendered from it is wrong.
    docsWatcher,
    docsWatcher.onDidChange(() => rebuild()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      // Any setting of ours can change what a pointer resolves to, or whether
      // it may be shown at all, and the editor's own appearance is the
      // widget's appearance. Heights are keyed by content, row height and
      // width, so what was measured stays valid wherever those still match.
      if (
        event.affectsConfiguration(SETTINGS_SECTION) ||
        EDITOR_APPEARANCE.some((setting) => event.affectsConfiguration(setting))
      ) {
        rebuild();
      }
    }),
    new vscode.Disposable(() => {
      if (prefetchTimer !== undefined) {
        clearTimeout(prefetchTimer);
      }
      if (reflowTimer !== undefined) {
        clearTimeout(reflowTimer);
      }
    }),
    // The window going away must take every webview with it.
    new vscode.Disposable(forgetAll),
  );

  return { toggle, refresh, expanded };
}
