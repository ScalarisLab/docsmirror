/**
 * The markdown itself, a whole document, or the one section a pointer names.
 * @docs convention.md#anchors
 */

import { findSection, parseSections, sectionMarkdown } from '@scalarislab/docsmirror-core';
import { ToolFailure } from '../errors';
import { optionalString, requiredString } from './args';
import { requireAnchor, requireNode } from './lookup';
import type { ToolDefinition } from './types';

export const readDocumentation: ToolDefinition = {
  name: 'read_documentation',
  title: 'Read documentation',
  description:
    'Return the markdown of one document, or of a single section of it when `anchor` is given. This is ' +
    'the call that replaces opening a folder of files: name the anchor you chose from ' +
    '`list_documentation` or `search_documentation` and you receive that heading and everything under ' +
    'it, its subsections included, the rest of the document excluded. Omit `anchor` only when you ' +
    'genuinely need the whole document. `path` is docs-root-relative, exactly as it appears in a `@docs` ' +
    'pointer or in the other tools\' answers; it is not relative to the source file you are editing.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Docs-root-relative path of the document, for example `decisions/retry-policy.md`. Take it from ' +
          '`list_documentation`, `search_documentation` or a `@docs` pointer.',
      },
      anchor: {
        type: 'string',
        description:
          'Slug of the section to return, the part after `#` in a pointer. Omit to read the whole document.',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  run: async (args, snapshot) => {
    const path = requiredString(args, 'path');
    const anchor = optionalString(args, 'anchor');
    const node = requireNode(snapshot, path);

    const file = await snapshot.read(node.path);
    if (file === undefined) {
      throw new ToolFailure(
        `\`${node.path}\` is in this project's documentation map but could not be read from disk just now. ` +
          'It was probably moved or deleted; call `list_documentation` again for the current map.',
      );
    }

    if (anchor === undefined) {
      return file.content;
    }

    const manifestAnchor = requireAnchor(node, anchor, snapshot);
    const sections = parseSections(file.content);
    const section = findSection(sections, manifestAnchor.slug);
    if (section === undefined) {
      throw new ToolFailure(
        `\`${node.path}\` no longer defines the section \`${manifestAnchor.slug}\`. Call ` +
          '`list_documentation` again for the anchors it currently has.',
      );
    }
    return sectionMarkdown(file.content, section);
  },
};
