/**
 * Turns a snapshot into the units search ranks: one for a document's opening
 * and one per section. Sections carry their own text only, a parent heading
 * scoring the prose of every child would rank whole documents above the
 * section that actually answers the query.
 */

import { parseSections, splitLines } from '@docsmirror/core';
import type { ProjectSnapshot } from '../project/ProjectSnapshot';
import type { SearchTarget } from './lexical';

export async function searchTargets(snapshot: ProjectSnapshot): Promise<SearchTarget[]> {
  const targets: SearchTarget[] = [];

  for (const node of snapshot.manifest.nodes) {
    const file = await snapshot.read(node.path);
    if (file === undefined) {
      continue;
    }
    const lines = splitLines(file.content);
    const sections = parseSections(file.content);
    const firstHeading = sections[0]?.headingLine ?? lines.length;

    targets.push({
      path: node.path,
      documentTitle: node.title,
      anchor: undefined,
      heading: node.title,
      summary: node.summary,
      body: lines.slice(0, firstHeading).join('\n'),
      staleness: node.staleness,
      references: node.referencedBy.length,
    });

    for (const [index, section] of sections.entries()) {
      const nextHeading = sections[index + 1]?.headingLine ?? section.endLine;
      const anchor = snapshot.anchor(node, section.slug);
      targets.push({
        path: node.path,
        documentTitle: node.title,
        anchor: section.slug,
        heading: section.title,
        summary: anchor?.summary,
        body: lines.slice(section.bodyLine, nextHeading).join('\n'),
        staleness: node.staleness,
        references: anchor?.referencedBy.length ?? 0,
      });
    }
  }

  return targets;
}
