/**
 * Definition: the pointer behaves like a symbol, go-to-definition opens the
 * document at the heading the anchor names.
 * @docs server.md#definition
 */

import { splitLines, type ResolvedPointer } from '@docsmirror/core';
import { Range, type Location, type LocationLink, type Position } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { PointerIndex, pointerRange } from '../pointer/PointerIndex';
import type { Workspace } from '../workspace/Workspace';
import { pathToUri } from '../workspace/paths';

/** The URI of a resolved document, whatever the root was able to provide. */
export function targetUri(resolution: ResolvedPointer, workspace: Workspace): string | undefined {
  if (resolution.file.uri !== undefined) {
    return resolution.file.uri;
  }
  const absolute = workspace.root.absolutePathOf(resolution.file.path);
  return absolute === undefined ? undefined : pathToUri(absolute);
}

/** The heading line of the section, and the span the section covers. */
export function targetRanges(resolution: ResolvedPointer): { selection: Range; full: Range } {
  const lines = splitLines(resolution.file.content);
  const section = resolution.section;
  const headingLine = section?.headingLine ?? 0;
  const endLine = section?.endLine ?? lines.length;
  const headingLength = (lines[headingLine] ?? '').length;
  const lastLine = Math.max(headingLine, endLine - 1);
  const lastLength = lastLine === headingLine ? headingLength : (lines[lastLine] ?? '').length;
  return {
    selection: Range.create(headingLine, 0, headingLine, headingLength),
    full: Range.create(headingLine, 0, lastLine, lastLength),
  };
}

/**
 * Where the pointer under the cursor leads. `LocationLink`s are returned when
 * the client understands them, so the editor can preview the jump.
 */
export async function definitionAt(
  document: TextDocument,
  position: Position,
  workspace: Workspace,
  index: PointerIndex,
  linkSupport: boolean,
): Promise<Location[] | LocationLink[] | null> {
  const pointer = index.at(document, position);
  if (pointer === undefined) {
    return null;
  }
  const resolution = await workspace.resolver.resolve(pointer);
  if (resolution.status !== 'resolved') {
    return null;
  }
  const uri = targetUri(resolution, workspace);
  if (uri === undefined) {
    return null;
  }

  const ranges = targetRanges(resolution);
  if (!linkSupport) {
    return [{ uri, range: ranges.selection }];
  }
  return [
    {
      originSelectionRange: pointerRange(pointer),
      targetUri: uri,
      targetRange: ranges.full,
      targetSelectionRange: ranges.selection,
    },
  ];
}
