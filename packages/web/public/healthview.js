import { LONG_DOCUMENT_WORDS, renderSurfaceHead } from './docmeta.js';
import { el } from './dom.js';
import { hrefFor } from './router.js';

/**
 * What `docsmirror check` finds, on screen instead of only in CI.
 *
 * A pointer that resolves to nothing is the one failure mode this convention
 * has, and it is invisible while reading. The rest is softer, documents no
 * code and no index reaches, documents that grew past the length anyone
 * finishes, and is stated in the same muted register rather than raised as an
 * alarm, because none of it is broken, only unattended.
 * @docs cli.md#what-check-verifies
 */

const UNRESOLVED = ['file-not-found', 'anchor-not-found', 'malformed-pointer'];

/** Renders a message's backticked spans as code, from text nodes only. */
function message(text) {
  const parts = text.split('`');
  return el(
    'p',
    { class: 'issue-message' },
    parts.map((part, index) => (index % 2 === 1 ? el('code', { text: part }) : part)),
  );
}

function fact(value, label, caution = false) {
  return el('span', { class: `fact${caution && value > 0 ? ' is-caution' : ''}` }, [
    el('span', { class: 'figure', text: value.toLocaleString('en') }),
    ` ${label}`,
  ]);
}

function section(title, count, body) {
  return el('section', { class: 'apparatus' }, [
    el('p', { class: 'apparatus-label' }, [title, el('span', { class: 'figure', text: String(count) })]),
    body,
  ]);
}

function pointerIssue(issue) {
  const line = issue.range === undefined ? '' : `:${issue.range.line + 1}`;
  return el('li', { class: 'issue is-error' }, [
    el('span', { class: 'issue-site figure', text: `${issue.file}${line}` }),
    message(issue.message),
    issue.suggestion ? el('p', { class: 'issue-fix', text: `Did you mean ${issue.suggestion}` }) : null,
  ]);
}

function documentIssue(path, text) {
  return el('li', { class: 'issue' }, [
    el('a', { class: 'issue-site figure', href: hrefFor({ doc: path, view: 'read' }), text: path }),
    message(text),
  ]);
}

function pathList(nodes, detail) {
  return el(
    'ul',
    { class: 'path-list' },
    nodes.map((node) =>
      el('li', {}, [
        el('a', { class: 'apparatus-name', href: hrefFor({ doc: node.path, view: 'read' }), text: node.title, title: node.path }),
        el('span', { class: 'apparatus-leader', 'aria-hidden': 'true' }),
        el('span', { class: 'figure is-quiet', text: detail(node) }),
      ]),
    ),
  );
}

export function renderHealthView(container, { health, manifest }) {
  const unresolved = health.issues.filter((issue) => UNRESOLVED.includes(issue.kind));
  const orphans = health.issues.filter((issue) => issue.kind === 'orphan-doc');
  const unreferenced = manifest.nodes.filter((node) => node.referencedBy.length === 0);
  const long = [...manifest.nodes]
    .filter((node) => node.words >= LONG_DOCUMENT_WORDS)
    .sort((left, right) => right.words - left.words);

  renderSurfaceHead(container, {
    title: 'Documentation health',
    summary:
      'Every @docs pointer in the repository, resolved against the docs root, the same verdict the CI gate reaches.',
    facts: [
      fact(health.pointerCount, 'pointers'),
      fact(health.resolvedCount, 'resolved'),
      fact(unresolved.length, 'unresolved', true),
      fact(orphans.length, 'unreachable', true),
      fact(unreferenced.length, 'unreferenced', true),
    ],
  });

  container.append(
    el('p', { class: 'surface-note' }, [
      el('span', { class: 'figure is-quiet', text: `${health.scannedFiles.toLocaleString('en')} source files scanned` }),
      el('a', { class: 'tool', href: '/api/health', target: '_blank', rel: 'noreferrer', text: 'raw JSON' }),
    ]),
  );

  if (unresolved.length === 0 && orphans.length === 0) {
    container.append(
      el('p', {
        class: 'all-clear',
        text: 'Every pointer resolves, and every document is reachable. Nothing here needs attention.',
      }),
    );
  }

  if (unresolved.length > 0) {
    container.append(
      section(
        'Pointers that resolve to nothing',
        unresolved.length,
        el('ul', { class: 'issue-rows' }, unresolved.map(pointerIssue)),
      ),
    );
  }

  if (orphans.length > 0) {
    container.append(
      section(
        'Documents nothing reaches',
        orphans.length,
        el(
          'ul',
          { class: 'issue-rows' },
          orphans.map((issue) => documentIssue(issue.file, issue.message)),
        ),
      ),
    );
  }

  if (unreferenced.length > 0) {
    container.append(
      section(
        'Documents no code points at',
        unreferenced.length,
        el('div', {}, [
          el('p', {
            class: 'issue-message',
            text: 'Reachable, but nothing in the source depends on them. Either the code that should point here does not, or the page is reference material that never will.',
          }),
          pathList(unreferenced, (node) => `${node.anchors.length} ${node.anchors.length === 1 ? 'section' : 'sections'}`),
        ]),
      ),
    );
  }

  if (long.length > 0) {
    container.append(
      section(
        'Documents past 3,000 words',
        long.length,
        el('div', {}, [
          el('p', {
            class: 'issue-message',
            text: 'A pointer into a page this long lands in a wall of prose. Splitting it makes every pointer into it sharper.',
          }),
          pathList(long, (node) => `${node.words.toLocaleString('en')} words`),
        ]),
      ),
    );
  }
}
