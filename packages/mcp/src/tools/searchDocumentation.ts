/**
 * Ranked lexical search over documents and sections.
 */

import { rankTargets, queryTerms } from '../search/lexical';
import { searchTargets } from '../search/targets';
import { optionalInteger, requiredString } from './args';
import { asJson, type ToolDefinition } from './types';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export const searchDocumentation: ToolDefinition = {
  name: 'search_documentation',
  title: 'Search documentation',
  description:
    'Search this project\'s documentation for the sections that discuss a term, ranked best first. ' +
    'Matching is lexical, not semantic: it finds the words you type, in titles, headings, summaries and ' +
    'body text, and it infers no synonyms, so search with the vocabulary the documentation itself would ' +
    'use, and try a second wording before concluding a subject is undocumented. A hit in a title or a ' +
    'heading outranks one in body text, and a whole word outranks a fragment. Each result gives the ' +
    'document path, the anchor of the matching section and a short excerpt; pass that path and anchor to ' +
    '`read_documentation` to get the section itself. Use `list_documentation` instead when you want the ' +
    'whole map rather than an answer to one question.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Words to look for. Several words rank higher together: a section matching all of them comes ' +
          'before one matching a single term.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: MAX_LIMIT,
        default: DEFAULT_LIMIT,
        description: `How many results to return. Defaults to ${DEFAULT_LIMIT}.`,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  run: async (args, snapshot) => {
    const query = requiredString(args, 'query');
    const limit = optionalInteger(args, 'limit', { min: 1, max: MAX_LIMIT }) ?? DEFAULT_LIMIT;
    const targets = await searchTargets(snapshot);
    const hits = rankTargets(targets, query, limit);

    return asJson({
      query,
      terms: queryTerms(query),
      matching: 'lexical',
      results: hits.map((hit) => ({
        path: hit.target.path,
        anchor: hit.target.anchor,
        title: hit.target.heading,
        document: hit.target.documentTitle,
        summary: hit.target.summary,
        excerpt: hit.excerpt,
        score: hit.score,
        matchedTerms: hit.matchedTerms,
        references: hit.target.references,
        staleness: hit.target.staleness,
      })),
      ...(hits.length === 0
        ? {
            note:
              'No section contains these words. The search matches words literally, so try the terms the ' +
              'documentation would use, or call `list_documentation` to see what is covered at all.',
          }
        : {}),
    });
  },
};
