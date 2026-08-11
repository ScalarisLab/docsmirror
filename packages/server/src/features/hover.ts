/**
 * Hover: the documentation itself, rendered where the pointer is written.
 *
 * A pointer that cannot be resolved still produces a hover, saying what is
 * wrong at the moment the reader asks is the entire value of the feature.
 * @docs server.md#hover
 */

import { closestMatch, renderDatedSections, type PointerResolution } from '@scalarislab/docsmirror-core';
import { MarkupKind, type Hover, type Position } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { PointerIndex, pointerRange } from '../pointer/PointerIndex';
import { docsRootLabel, freshnessLabel } from '../render/labels';
import { absolutizeTargets, demoteHeadings, stripFrontMatter, stripLeadingHeading } from '../render/markdown';
import type { Workspace } from '../workspace/Workspace';

/** Headings in a hover box start here, whatever depth they had in the document. */
const HOVER_HEADING_LEVEL = 4;
/** Enough anchors to find the right one, few enough to stay a tooltip. */
const MAX_LISTED_ANCHORS = 12;

function code(value: string): string {
  return `\`${value}\``;
}

function body(resolution: PointerResolution, absolutePath: string | undefined): string {
  if (resolution.status !== 'resolved') {
    return '';
  }
  const withoutTitle = stripLeadingHeading(stripFrontMatter(resolution.markdown), resolution.title);
  const demoted = renderDatedSections(demoteHeadings(withoutTitle, HOVER_HEADING_LEVEL).trim());
  if (demoted.length === 0) {
    return '*This section has no body.*';
  }
  return absolutePath === undefined ? demoted : absolutizeTargets(demoted, absolutePath);
}

/**
 * The markdown shown for a pointer, resolved or not. `nearestPath` is the
 * closest document the root does hold, when the pointer named one it does not.
 */
export function renderHover(resolution: PointerResolution, workspace: Workspace, nearestPath?: string): string {
  const pointer = resolution.pointer;

  if (resolution.status === 'file-not-found') {
    const lines = [
      `**Unresolved pointer** · ${code(pointer.path)}`,
      '',
      `No document at ${code(pointer.path)} in the docs root ${code(docsRootLabel(workspace))}.`,
    ];
    if (nearestPath !== undefined) {
      lines.push('', `Did you mean ${code(nearestPath)}?`);
    }
    return lines.join('\n');
  }

  if (resolution.status === 'anchor-not-found') {
    const anchor = pointer.anchor ?? '';
    const nearest = closestMatch(anchor, resolution.available);
    const lines = [
      `**Anchor not found** · ${code(resolution.file.path)}`,
      '',
      `${code(resolution.file.path)} has no heading anchored at ${code(`#${anchor}`)}.`,
    ];
    if (nearest !== undefined) {
      lines.push('', `Did you mean ${code(`#${nearest}`)}?`);
    }
    if (resolution.available.length > 0) {
      const listed = resolution.available.slice(0, MAX_LISTED_ANCHORS).map((slug) => code(`#${slug}`));
      const more = resolution.available.length - listed.length;
      lines.push('', `Anchors in this document: ${listed.join(', ')}${more > 0 ? `, and ${more} more` : ''}.`);
    }
    return lines.join('\n');
  }

  const header = [
    `**${resolution.title}**`,
    code(resolution.file.path),
    freshnessLabel(resolution.file, resolution.staleness),
  ].join(' · ');

  return [header, '', '---', '', body(resolution, workspace.root.absolutePathOf(resolution.file.path))].join('\n');
}

/** Hover for the pointer under the cursor, or `null` when there is no pointer. */
export async function hoverAt(
  document: TextDocument,
  position: Position,
  workspace: Workspace,
  index: PointerIndex,
): Promise<Hover | null> {
  const pointer = index.at(document, position);
  if (pointer === undefined) {
    return null;
  }
  const resolution = await workspace.resolver.resolve(pointer);
  const nearestPath =
    resolution.status === 'file-not-found' ? closestMatch(pointer.path, await workspace.root.list()) : undefined;
  return {
    contents: { kind: MarkupKind.Markdown, value: renderHover(resolution, workspace, nearestPath) },
    range: pointerRange(pointer),
  };
}
