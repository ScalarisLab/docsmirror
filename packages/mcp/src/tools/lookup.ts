/**
 * Resolving what a caller named, and explaining it when there is nothing there.
 *
 * An unknown path is the most common mistake an agent makes, and the useful
 * answer is never "not found", it is the closest path that does exist, next to
 * the handful it could have meant instead.
 */

import { closestMatch, type ManifestAnchor, type ManifestNode } from '@scalarislab/docsmirror-core';
import { ToolFailure } from '../errors';
import type { ProjectSnapshot } from '../project/ProjectSnapshot';

/** How many existing names to list when a caller named one that does not exist. */
const SUGGESTION_LIMIT = 8;

function listOf(values: readonly string[]): string {
  const shown = values.slice(0, SUGGESTION_LIMIT).map((value) => `\`${value}\``).join(', ');
  return values.length > SUGGESTION_LIMIT ? `${shown}, … (${values.length} in total)` : shown;
}

/** The document a caller named, or a failure naming the ones that exist. */
export function requireNode(snapshot: ProjectSnapshot, path: string): ManifestNode {
  const node = snapshot.node(path);
  if (node !== undefined) {
    return node;
  }
  const paths = snapshot.paths;
  if (paths.length === 0) {
    throw new ToolFailure(
      `This project has no documentation under its docs root (\`${snapshot.config.docsRoot}\`), so \`${path}\` ` +
        'cannot be read. Check the project root the server was started in.',
    );
  }
  const closest = closestMatch(path, paths);
  const suggestion = closest === undefined ? '' : ` Did you mean \`${closest}\`?`;
  throw new ToolFailure(
    `No document \`${path}\` in this project's docs root.${suggestion} ` +
      `Documents available: ${listOf(paths)}. Call \`list_documentation\` for the full map.`,
  );
}

/** The section a caller named, or a failure naming the anchors that document defines. */
export function requireAnchor(node: ManifestNode, anchor: string, snapshot: ProjectSnapshot): ManifestAnchor {
  const found = snapshot.anchor(node, anchor);
  if (found !== undefined) {
    return found;
  }
  const slugs = node.anchors.map((candidate) => candidate.slug);
  if (slugs.length === 0) {
    throw new ToolFailure(
      `\`${node.path}\` has no headings, so it has no anchor \`${anchor}\`. Read the whole document by ` +
        'omitting `anchor`.',
    );
  }
  const closest = closestMatch(anchor, slugs);
  const suggestion = closest === undefined ? '' : ` Did you mean \`${closest}\`?`;
  throw new ToolFailure(
    `\`${node.path}\` has no anchor \`${anchor}\`.${suggestion} Anchors it defines: ${listOf(slugs)}.`,
  );
}
