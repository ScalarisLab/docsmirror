'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseSections, slugify, SlugRegistry } = require('@scalarislab/docsmirror-core');
const { renderMarkdown } = require('../dist/markdown.js');

/**
 * The anchor is computed from the heading's SOURCE text and never from what is
 * on screen.
 *
 * This matters because the app is free to change how a heading is displayed:
 * rendering its inline markdown already does exactly that, and a slug taken
 * from the rendered text would move silently the moment a heading contained a
 * link, an image or a reference. Every `@docs pointer#anchor` in the codebase
 * would then resolve in CI and land nowhere in the browser.
 */

/** Heading ids in document order, read out of the rendered HTML. */
function renderedIds(markdown) {
  return [...renderMarkdown(markdown, 'sample.md').matchAll(/<h[1-6] id="([^"]*)"/g)].map((match) => match[1]);
}

/** The text a reader actually sees for a heading, tags stripped. */
function displayedText(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function renderedHeadings(markdown) {
  return [...renderMarkdown(markdown, 'sample.md').matchAll(/<h[1-6] id="([^"]*)">([\s\S]*?)<\/h[1-6]>/g)].map(
    (match) => ({ id: match[1], display: displayedText(match[2]) }),
  );
}

test('a rendered heading id is the slug of its source text', () => {
  const markdown = [
    '# Circuit breaker',
    '',
    '## How the breaker decides a host is dead, and forgives it',
    '',
    '### The `HostOutcome` type',
    '',
    '## Why *two* keys per request',
  ].join('\n');

  const sources = [
    'Circuit breaker',
    'How the breaker decides a host is dead, and forgives it',
    'The `HostOutcome` type',
    'Why *two* keys per request',
  ];

  assert.deepEqual(renderedIds(markdown), sources.map((heading) => slugify(heading)));
});

test('the id survives a heading whose displayed text differs from its source', () => {
  // An image contributes its alt text to the slug and nothing at all to the
  // visible text, so these two headings are the case where slugging what is on
  // screen and slugging the source give different answers. The anchor has to
  // come from the source.
  const markdown = ['## Status ![healthy](badge.png)', '', '## ![Circuit breaker](d.png) overview'].join('\n');
  const headings = renderedHeadings(markdown);

  assert.deepEqual(
    headings.map((heading) => heading.id),
    [slugify('Status ![healthy](badge.png)'), slugify('![Circuit breaker](d.png) overview')],
  );
  assert.deepEqual(
    headings.map((heading) => heading.id),
    ['status-healthy', 'circuit-breaker-overview'],
  );

  for (const heading of headings) {
    assert.notEqual(
      heading.id,
      slugify(heading.display),
      `#${heading.id} must not be derivable from the displayed text "${heading.display}"`,
    );
  }
});

test('repeated headings get GitHub duplicate suffixes, in source order', () => {
  const markdown = ['## Limits', '', '## Limits', '', '## Limits'].join('\n');
  assert.deepEqual(renderedIds(markdown), ['limits', 'limits-1', 'limits-2']);
});

test('rendered ids match the manifest anchors a pointer resolves against', () => {
  // The CLI, the language server and the manifest all reach an anchor through
  // `parseSections`. If the browser disagreed with them, a pointer that passes
  // `docsmirror check` would still scroll to nothing.
  const markdown = [
    '# Scheduling and politeness',
    '',
    'Opening prose.',
    '',
    '## The `PROCESS_DEATH_WINDOW_MS` guard',
    '',
    'Body.',
    '',
    '### Why it is not a timeout',
    '',
    'Body.',
    '',
    '## A failure of ours is not a failure of theirs',
    '',
    'Body.',
  ].join('\n');

  assert.deepEqual(
    renderedIds(markdown),
    parseSections(markdown).map((section) => section.slug),
  );
});

test('the registry the renderer uses is the one core exports', () => {
  const markdown = ['## Anchors', '', '## Anchors'].join('\n');
  const registry = new SlugRegistry();
  assert.deepEqual(renderedIds(markdown), [registry.next('Anchors'), registry.next('Anchors')]);
});

/*
 * URL schemes are allowlisted, not merely escaped. The app renders whatever
 * happens to be in the repository inside an origin that can PUT /api/doc, so
 * a crafted `javascript:` or `data:` target must never come out clickable:
 * escaping alone would leave it a perfectly valid, perfectly hostile href.
 */

test('a link with an untrusted scheme renders inert, never as an href', () => {
  const markdown = '[run](javascript:alert(1)) and [smuggle](data:text/html,<script>alert(1)</script>)';
  const html = renderMarkdown(markdown, 'sample.md');
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('href="data:'));
  assert.match(html, /<span class="unlinked"[^>]*>run<\/span>/);
  assert.match(html, /<span class="unlinked"[^>]*>smuggle<\/span>/);
});

test('allowlisted schemes still come out as live links', () => {
  const markdown = '[site](https://example.com) [plain](http://example.com) [mail](mailto:docs@example.com)';
  const html = renderMarkdown(markdown, 'sample.md');
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(html.includes('href="http://example.com"'));
  assert.ok(html.includes('href="mailto:docs@example.com"'));
});

test('an image with an untrusted scheme renders as its alt text, not a tag', () => {
  const markdown = '![poked](javascript:alert(1)) and ![inlined](data:image/svg+xml,<svg/>)';
  const html = renderMarkdown(markdown, 'sample.md');
  assert.ok(!html.includes('<img'));
  assert.match(html, /<span class="unlinked">poked<\/span>/);
  assert.match(html, /<span class="unlinked">inlined<\/span>/);
});

test('an http image keeps its tag', () => {
  const html = renderMarkdown('![badge](https://example.com/badge.png)', 'sample.md');
  assert.ok(html.includes('<img src="https://example.com/badge.png" alt="badge">'));
});
