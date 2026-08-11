/**
 * `docsmirror/pointers`: everything a client needs to draw a pointer line
 * itself, in one request.
 *
 * A client that renders its own marker cannot get there from the standard
 * requests. Links carry no title, hints carry no range, and diagnostics carry
 * neither, stitching the three together would mean the client reimplementing
 * the convention badly. The answers about the convention stay here; the client
 * is left with a string to draw and a range to draw it over.
 * @docs server.md#the-pointers-request
 */

import { Range } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PointerMarker, PointerMarkersResult } from '../protocol';
import { PointerIndex, pointerRange } from '../pointer/PointerIndex';
import type { Workspace } from '../workspace/Workspace';

/** The `path#anchor` span, which starts where `@docs ` stops. */
function targetRangeOf(pointer: { raw: string; path: string; line: number; column: number; endColumn: number }): Range {
  const offset = pointer.raw.indexOf(pointer.path);
  const start = offset < 0 ? pointer.column : pointer.column + offset;
  return Range.create(pointer.line, start, pointer.line, pointer.endColumn);
}

export async function pointerMarkersFor(
  document: TextDocument,
  workspace: Workspace,
  index: PointerIndex,
): Promise<PointerMarkersResult> {
  if (!workspace.docsRootExists) {
    return { docsRootFound: false, markers: [] };
  }

  const pointers = index.pointers(document);
  const resolutions = await Promise.all(pointers.map((pointer) => workspace.resolver.resolve(pointer)));

  const markers = pointers.map((pointer, position): PointerMarker => {
    const resolution = resolutions[position];
    const range = pointerRange(pointer);
    const targetRange = targetRangeOf(pointer);
    if (resolution === undefined || resolution.status !== 'resolved') {
      const written = pointer.anchor === undefined ? pointer.path : `${pointer.path}#${pointer.anchor}`;
      return { range, targetRange, resolved: false, label: written };
    }
    return { range, targetRange, resolved: true, label: resolution.title };
  });

  return { docsRootFound: true, markers };
}
