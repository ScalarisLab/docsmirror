/**
 * Parsed pointers per open document, cached by document version.
 *
 * Hover, inlay hints, definition, links and diagnostics all ask the same
 * question of the same text; parsing it once per keystroke instead of five
 * times is the whole point of this cache.
 * @docs server.md#pointer-index
 */

import { parseSource, type DocsPointer, type ParseResult } from '@scalarislab/docsmirror-core';
import { Range, type Position } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/** The LSP range covering a pointer, from `@` to the end of its target. */
export function pointerRange(pointer: Pick<DocsPointer, 'line' | 'column' | 'endColumn'>): Range {
  return Range.create(pointer.line, pointer.column, pointer.line, pointer.endColumn);
}

export class PointerIndex {
  private readonly cache = new Map<string, { version: number; result: ParseResult }>();

  private parse(document: TextDocument): ParseResult {
    const cached = this.cache.get(document.uri);
    if (cached !== undefined && cached.version === document.version) {
      return cached.result;
    }
    const result = parseSource(document.getText());
    this.cache.set(document.uri, { version: document.version, result });
    return result;
  }

  pointers(document: TextDocument): readonly DocsPointer[] {
    return this.parse(document).pointers;
  }

  /** The pointer under a cursor, hover included, or `undefined` when there is none. */
  at(document: TextDocument, position: Position): DocsPointer | undefined {
    return this.pointers(document).find(
      (pointer) =>
        pointer.line === position.line &&
        position.character >= pointer.column &&
        position.character <= pointer.endColumn,
    );
  }

  forget(uri: string): void {
    this.cache.delete(uri);
  }
}
