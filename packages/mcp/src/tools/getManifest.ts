/**
 * The manifest verbatim, for callers that want the whole structure rather than
 * an answer.
 * @docs manifest.md#the-format
 */

import { asJson, type ToolDefinition } from './types';

export const getManifest: ToolDefinition = {
  name: 'get_manifest',
  title: 'Get manifest',
  description:
    'Return the project\'s complete documentation manifest as generated from the current filesystem: ' +
    'every document with its full anchor list, the links between documents, per-anchor references, ' +
    'modification dates and freshness, and the surface-wide counts. Prefer `list_documentation` for ' +
    'ordinary work, it answers the same question in a fraction of the tokens. Reach for this one when ' +
    'you need the structure itself: auditing what is documented, following the link graph, or reporting ' +
    'on orphaned documents.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  run: async (_args, snapshot) => asJson(snapshot.manifest),
};
