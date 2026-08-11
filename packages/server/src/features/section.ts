/**
 * `docsmirror/section`: the documentation itself, as markdown, for one pointer.
 *
 * Hover already renders a section, but the client cannot reuse it: a hover is a
 * `MarkupContent` the editor owns and disposes, and a client that wants to put
 * the prose somewhere of its own, an inline panel, a side view, needs the
 * markdown in its hands. So the text is offered separately from the box that
 * usually holds it.
 *
 * It is deliberately fetched per pointer rather than shipped with every marker:
 * a file with thirty pointers would otherwise carry thirty sections nobody
 * asked to read.
 * @docs server.md#the-section-request
 */

import { renderDatedSections } from '@docsmirror/core';
import type { Position } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SectionContent } from '../protocol';
import type { PointerIndex } from '../pointer/PointerIndex';
import { freshnessLabel } from '../render/labels';
import { absolutizeTargets, stripFrontMatter } from '../render/markdown';
import type { Workspace } from '../workspace/Workspace';

export async function sectionAt(
  document: TextDocument,
  position: Position,
  workspace: Workspace,
  index: PointerIndex,
): Promise<SectionContent | undefined> {
  // The line, not the column: once a pointer is collapsed there is no column
  // left to aim at, and "expand the documentation on this line" is the question
  // being asked anyway.
  const pointer = index.at(document, position) ?? index.pointers(document).find((it) => it.line === position.line);
  if (pointer === undefined) {
    return undefined;
  }
  const resolution = await workspace.resolver.resolve(pointer);
  if (resolution.status !== 'resolved') {
    return undefined;
  }
  const absolutePath = workspace.root.absolutePathOf(resolution.file.path);
  const body = renderDatedSections(stripFrontMatter(resolution.markdown).trim());
  return {
    title: resolution.title,
    path: resolution.file.path,
    freshness: freshnessLabel(resolution.file, resolution.staleness),
    markdown: absolutePath === undefined ? body : absolutizeTargets(body, absolutePath),
  };
}
