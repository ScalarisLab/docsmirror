/**
 * The map: every document and section an agent could read, with none of their
 * text. Choosing what to read is the expensive mistake this replaces.
 * @docs agents.md#working-with-ai-agents
 */

import { asJson, type ToolDefinition } from './types';

export const listDocumentation: ToolDefinition = {
  name: 'list_documentation',
  title: 'List documentation',
  description:
    'Call this first, before reading or guessing any documentation in this project. It returns the ' +
    'whole documentation surface in one compact answer: every document with its path, title, one-line ' +
    'summary, freshness and how many code sites depend on it, plus every section of every document ' +
    'with its anchor slug, title and summary. It deliberately contains no document text, use it to ' +
    'decide which single section is worth reading, then call `read_documentation` with the path and ' +
    'anchor you picked. Paths returned here are exactly what a `@docs` pointer carries, so they can be ' +
    'passed unchanged to every other tool.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  run: async (_args, snapshot) => {
    const { manifest } = snapshot;
    return asJson({
      docsRoot: manifest.docsRoot,
      generatedAt: manifest.generatedAt,
      stats: manifest.stats,
      documents: manifest.nodes.map((node) => ({
        path: node.path,
        title: node.title,
        summary: node.summary,
        staleness: node.staleness,
        lastModified: node.lastModified,
        words: node.words,
        references: node.referencedBy.length,
        anchors: node.anchors.map((anchor) => ({
          anchor: anchor.slug,
          title: anchor.title,
          level: anchor.level,
          summary: anchor.summary,
          references: anchor.referencedBy.length,
        })),
      })),
    });
  },
};
