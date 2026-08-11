/**
 * The client's copy of `docsmirror/pointers`, cached per document version.
 *
 * Two features need the same answer: the collapsed marker draws it, and the
 * inline view needs to know which lines carry a resolved pointer before it can
 * open one. Asking twice would double the round trips on every keystroke, so the
 * cache is created once and handed to both, and a request already in flight is
 * shared rather than dropped, because the second caller wants the same answer,
 * not nothing.
 *
 * The request's shape is imported from the server's own protocol module, the
 * `dist/` path keeps the extension bundle down to the contract itself, two
 * string constants and types, rather than the server behind it.
 * @docs server.md#the-pointers-request
 */

import type * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { POINTERS_REQUEST, type PointerMarkersResult } from '@scalarislab/docsmirror-server/dist/protocol';

export type { PointerMarker, PointerMarkersResult, ProtocolRange } from '@scalarislab/docsmirror-server/dist/protocol';

interface InFlight {
  /** The document version the request was issued for. */
  readonly version: number;
  readonly request: Promise<PointerMarkersResult | undefined>;
}

export class PointerCache {
  private readonly entries = new Map<string, { version: number; result: PointerMarkersResult }>();
  private readonly inFlight = new Map<string, InFlight>();

  /** The answer already held for this exact version of the document, if any. */
  get(document: vscode.TextDocument): PointerMarkersResult | undefined {
    const entry = this.entries.get(document.uri.toString());
    return entry !== undefined && entry.version === document.version ? entry.result : undefined;
  }

  /**
   * Asks the server, joining a request already out for the same document,
   * but only when that request was issued for the version being asked about.
   * Joining across versions would cache ranges the edit has already moved.
   */
  async fetch(client: LanguageClient, document: vscode.TextDocument): Promise<PointerMarkersResult | undefined> {
    const key = document.uri.toString();
    const version = document.version;
    const pending = this.inFlight.get(key);
    if (pending !== undefined && pending.version === version) {
      return pending.request;
    }
    const request = client
      .sendRequest<PointerMarkersResult>(POINTERS_REQUEST, { textDocument: { uri: key } })
      .then((result) => {
        // An answer for an older version must not clobber a newer one that
        // happened to land first.
        const held = this.entries.get(key);
        if (held === undefined || held.version <= version) {
          this.entries.set(key, { version, result });
        }
        return result;
      })
      .finally(() => {
        // A fresher request may have replaced this slot already; only the
        // request that owns it clears it.
        if (this.inFlight.get(key)?.request === request) {
          this.inFlight.delete(key);
        }
      });
    this.inFlight.set(key, { version, request });
    return request;
  }

  /** Cache first, server second, callers that can wait use this one. */
  async resolve(client: LanguageClient, document: vscode.TextDocument): Promise<PointerMarkersResult | undefined> {
    return this.get(document) ?? (await this.fetch(client, document));
  }

  forget(document: vscode.TextDocument): void {
    this.entries.delete(document.uri.toString());
  }

  clear(): void {
    this.entries.clear();
  }
}
