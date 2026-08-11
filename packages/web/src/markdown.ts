import { normalizeDocsPath, SlugRegistry } from '@scalarislab/docsmirror-core';
import { Marked, type RendererObject, type Tokens } from 'marked';

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i;

/**
 * Targets the renderer will emit as live URLs. Everything else with a scheme:
 * `javascript:`, `data:`, `vbscript:`, renders inert: the app displays
 * whatever happens to be in the repository, inside an origin that can write
 * files back to disk, so a crafted href must never become something clickable.
 * @docs web.md#writing-safely
 */
const LINKABLE_URL = /^(?:https?:|mailto:|\/\/|\/)/i;

const DOCUMENT_EXTENSIONS = ['.md', '.markdown'];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Joins a docs-root-relative document path and a relative link target. */
function resolveAgainst(fromPath: string, target: string): string | undefined {
  const segments = normalizeDocsPath(fromPath).split('/').slice(0, -1);
  for (const segment of normalizeDocsPath(target).split('/')) {
    if (segment === '..') {
      if (segments.pop() === undefined) {
        return undefined;
      }
    } else if (segment !== '.' && segment !== '') {
      segments.push(segment);
    }
  }
  return segments.length > 0 ? segments.join('/') : undefined;
}

function looksLikeDocument(target: string): boolean {
  const lastSegment = target.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  return dot <= 0 || DOCUMENT_EXTENSIONS.includes(lastSegment.slice(dot).toLowerCase());
}

/** The in-app address of a document, optionally at one of its anchors. */
function documentHref(path: string, anchor?: string): string {
  const query = new URLSearchParams({ doc: path });
  if (anchor !== undefined && anchor.length > 0) {
    query.set('anchor', anchor);
  }
  return `#${query.toString()}`;
}

interface LinkRendering {
  readonly kind: 'document' | 'external' | 'inert';
  readonly href: string;
}

function classifyLink(fromPath: string, rawHref: string): LinkRendering {
  const href = rawHref.trim();
  if (href.startsWith('#')) {
    return { kind: 'document', href: documentHref(fromPath, href.slice(1).toLowerCase()) };
  }
  if (ABSOLUTE_URL.test(href)) {
    return { kind: LINKABLE_URL.test(href) ? 'external' : 'inert', href };
  }
  const [target = '', anchor] = href.split('#');
  if (!looksLikeDocument(target)) {
    return { kind: 'inert', href };
  }
  const resolved = resolveAgainst(fromPath, target);
  if (resolved === undefined) {
    return { kind: 'inert', href };
  }
  return { kind: 'document', href: documentHref(resolved, anchor?.toLowerCase()) };
}

/** Where an image's resolved docs-root-relative path is served from. */
const LIVE_ASSET_URL = (path: string): string => `/asset?path=${encodeURIComponent(path)}`;

/**
 * Renders a document to HTML.
 *
 * Two deliberate departures from `marked`'s defaults. Heading ids come from
 * core's `SlugRegistry`, so an anchor that works in a `@docs` pointer works in
 * this app. Raw HTML embedded in markdown is escaped rather than passed
 * through, and link and image targets become live URLs only on an allowlisted
 * scheme: the app renders whatever happens to be in the repository, and the
 * same page can write files back to disk.
 *
 * `assetUrl` turns a resolved image path into the address it loads from. The
 * live server serves one from the docs root on request; a static export has
 * already copied the file, and passes the path it copied it to instead.
 * @docs convention.md#anchors
 */
export function renderMarkdown(
  markdown: string,
  documentPath: string,
  assetUrl: (path: string) => string = LIVE_ASSET_URL,
): string {
  const slugs = new SlugRegistry();

  const renderer: RendererObject = {
    heading(token: Tokens.Heading): string {
      const id = slugs.next(token.text);
      const inline = this.parser.parseInline(token.tokens);
      return `<h${token.depth} id="${escapeHtml(id)}">${inline}</h${token.depth}>\n`;
    },
    link(token: Tokens.Link): string {
      const inline = this.parser.parseInline(token.tokens);
      const title = token.title === null || token.title === undefined ? '' : ` title="${escapeHtml(token.title)}"`;
      const link = classifyLink(documentPath, token.href);
      if (link.kind === 'inert') {
        return `<span class="unlinked" title="${escapeHtml(link.href)}">${inline}</span>`;
      }
      if (link.kind === 'external') {
        return `<a href="${escapeHtml(link.href)}"${title} target="_blank" rel="noreferrer noopener">${inline}</a>`;
      }
      return `<a href="${escapeHtml(link.href)}" class="doc-link"${title}>${inline}</a>`;
    },
    image(token: Tokens.Image): string {
      const alt = escapeHtml(token.text);
      const source = token.href.trim();
      if (ABSOLUTE_URL.test(source)) {
        // The same allowlist as links: an image source is a URL the browser
        // fetches, and it earns a tag only on a scheme the renderer trusts.
        return LINKABLE_URL.test(source)
          ? `<img src="${escapeHtml(token.href)}" alt="${alt}">`
          : `<span class="unlinked">${alt}</span>`;
      }
      const resolved = resolveAgainst(documentPath, token.href);
      if (resolved === undefined) {
        return `<span class="unlinked">${alt}</span>`;
      }
      return `<img src="${escapeHtml(assetUrl(resolved))}" alt="${alt}">`;
    },
    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },
  };

  const engine = new Marked({ gfm: true, breaks: false, async: false }, { renderer });
  return engine.parse(markdown) as string;
}
