/**
 * Inlay hints: the persistent half of the rendering. A pointer line always
 * carries what it points at, its date and how fresh that is, without hovering.
 *
 * The protocol allows text and nothing else here, so the hint says the three
 * things worth a glance and leaves the body to the hover it links to.
 * @docs server.md#inlay-hints
 */

import type { InlayHint, Range } from 'vscode-languageserver';
import { MarkupKind, type Position } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PointerIndex } from '../pointer/PointerIndex';
import { freshnessLabel } from '../render/labels';
import type { Workspace } from '../workspace/Workspace';
import { renderHover } from './hover';
import { targetRanges, targetUri } from './definition';

/** Enough to identify the pointer again when the client resolves the hint. */
export interface InlayHintData {
  readonly uri: string;
  readonly line: number;
  readonly character: number;
}

function isInlayHintData(value: unknown): value is InlayHintData {
  const data = value as InlayHintData | undefined;
  return (
    typeof data?.uri === 'string' && typeof data.line === 'number' && typeof data.character === 'number'
  );
}

/** End of the line's text, where a hint sits without pushing code around. */
function endOfLine(document: TextDocument, line: number): Position {
  const text = document.getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } });
  return { line, character: text.replace(/\r?\n$/, '').length };
}

/**
 * Hints for the pointers in `range`. Only resolved pointers get one: a broken
 * pointer is a diagnostic, and saying it twice helps nobody.
 */
export async function inlayHintsFor(
  document: TextDocument,
  range: Range,
  workspace: Workspace,
  index: PointerIndex,
): Promise<InlayHint[]> {
  const hints: InlayHint[] = [];

  for (const pointer of index.pointers(document)) {
    if (pointer.line < range.start.line || pointer.line > range.end.line) {
      continue;
    }
    const resolution = await workspace.resolver.resolve(pointer);
    if (resolution.status !== 'resolved') {
      continue;
    }

    const uri = targetUri(resolution, workspace);
    const label = `${resolution.title} · ${freshnessLabel(resolution.file, resolution.staleness)}`;
    const data: InlayHintData = { uri: document.uri, line: pointer.line, character: pointer.column };
    hints.push({
      position: endOfLine(document, pointer.line),
      label: [
        {
          value: label,
          ...(uri === undefined
            ? {}
            : { location: { uri, range: targetRanges(resolution).selection } }),
        },
      ],
      paddingLeft: true,
      data,
    });
  }

  return hints;
}

/**
 * Fills the tooltip when the client asks for it. The section body is the
 * expensive part of a hint, so it is only ever built for the one hint the user
 * is actually pointing at.
 */
export async function resolveInlayHint(
  hint: InlayHint,
  document: TextDocument | undefined,
  workspace: Workspace | undefined,
  index: PointerIndex,
): Promise<InlayHint> {
  if (!isInlayHintData(hint.data) || document === undefined || workspace === undefined) {
    return hint;
  }
  const pointer = index.at(document, { line: hint.data.line, character: hint.data.character });
  if (pointer === undefined) {
    return hint;
  }
  const resolution = await workspace.resolver.resolve(pointer);
  return { ...hint, tooltip: { kind: MarkupKind.Markdown, value: renderHover(resolution, workspace) } };
}
