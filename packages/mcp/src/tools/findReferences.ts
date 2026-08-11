/**
 * The map read backwards: from a document to the code that depends on it.
 * @docs convention.md#the-pointer
 */

import type { ManifestReference } from '@scalarislab/docsmirror-core';
import { optionalString, requiredString } from './args';
import { requireAnchor, requireNode } from './lookup';
import { asJson, type ToolDefinition } from './types';

function describe(reference: ManifestReference): Record<string, unknown> {
  return {
    file: reference.file,
    line: reference.line,
    symbol: reference.symbol,
    anchor: reference.anchor,
  };
}

export const findReferences: ToolDefinition = {
  name: 'find_references',
  title: 'Find references',
  description:
    'List the code that depends on a document, or on one of its sections: every `@docs` pointer aimed at ' +
    'it, with the source file, the 1-based line of the comment and the symbol that comment documents. ' +
    'Call it before editing documentation, to see what a rewrite would invalidate, and call it to go the ' +
    'other way, from a documented decision to the code implementing it, which is faster and more exact ' +
    'than searching the repository for the idea. Give `anchor` to narrow the answer to the pointers ' +
    'aiming at that section; omit it to get every pointer into the document, each labelled with the ' +
    'anchor it targets. An empty list means the document is documentation nothing points at.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Docs-root-relative path of the document, as returned by the other tools.',
      },
      anchor: {
        type: 'string',
        description: 'Slug of a section, to list only the pointers aiming at it.',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  run: async (args, snapshot) => {
    const path = requiredString(args, 'path');
    const anchor = optionalString(args, 'anchor');
    const node = requireNode(snapshot, path);

    if (anchor === undefined) {
      return asJson({
        path: node.path,
        title: node.title,
        references: node.referencedBy.map(describe),
        count: node.referencedBy.length,
      });
    }

    const manifestAnchor = requireAnchor(node, anchor, snapshot);
    return asJson({
      path: node.path,
      title: node.title,
      anchor: manifestAnchor.slug,
      anchorTitle: manifestAnchor.title,
      references: manifestAnchor.referencedBy.map(describe),
      count: manifestAnchor.referencedBy.length,
    });
  },
};
