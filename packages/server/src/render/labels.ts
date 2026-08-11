/**
 * The short English labels every surface shows. One vocabulary for hovers,
 * inlay hints and tooltips, so the same document never reads two ways.
 * @docs server.md#labels
 */

import { formatDate, type DocFile, type Staleness } from '@scalarislab/docsmirror-core';
import type { Workspace } from '../workspace/Workspace';
import { relativePosix } from '../workspace/paths';

const STALENESS_LABELS: Record<Staleness, string> = {
  fresh: 'Fresh',
  aging: 'Aging',
  stale: 'Stale',
  unknown: 'Undated',
};

function stalenessLabel(staleness: Staleness): string {
  return STALENESS_LABELS[staleness];
}

/**
 * `updated YYYY-MM-DD · Aging`, or just the staleness when the root cannot
 * date the document.
 */
export function freshnessLabel(file: DocFile, staleness: Staleness): string {
  const date = formatDate(file.lastModified);
  return date === undefined ? stalenessLabel(staleness) : `updated ${date} · ${stalenessLabel(staleness)}`;
}

/** The docs root as the user wrote it, `docs/` rather than an absolute path. */
export function docsRootLabel(workspace: Workspace): string {
  const relative = relativePosix(workspace.rootPath, workspace.docsDirectory);
  return relative === undefined ? workspace.docsDirectory : `${relative}/`;
}
