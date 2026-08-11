/**
 * Document links: the same jump as go-to-definition, for clients whose users
 * reach for ctrl-click before F12.
 *
 * The target is the document URI without a line fragment, fragment support in
 * links is a client-by-client affair, and a link that opens the right file
 * everywhere beats one that opens nothing in half the editors.
 * @docs server.md#document-links
 */

import type { DocumentLink } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { PointerIndex, pointerRange } from '../pointer/PointerIndex';
import type { Workspace } from '../workspace/Workspace';
import { targetUri } from './definition';

export async function documentLinksFor(
  document: TextDocument,
  workspace: Workspace,
  index: PointerIndex,
): Promise<DocumentLink[]> {
  const links: DocumentLink[] = [];

  for (const pointer of index.pointers(document)) {
    const resolution = await workspace.resolver.resolve(pointer);
    if (resolution.status !== 'resolved') {
      continue;
    }
    const uri = targetUri(resolution, workspace);
    if (uri === undefined) {
      continue;
    }
    links.push({
      range: pointerRange(pointer),
      target: uri,
      tooltip: `Open ${resolution.title}, ${resolution.file.path}`,
    });
  }

  return links;
}
