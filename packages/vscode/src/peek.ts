/**
 * Expanding a pointer, in place.
 *
 * One command, two renderings. When the inline view is available the section is
 * drawn in the comment itself; otherwise the peek view is the native shape that
 * does the same job, it opens inside the code, shows the target section at its
 * heading, and closes on Escape. Everyone gets an expansion; some get a better
 * one. See [inline documentation](#inline-documentation) for why it is a
 * setting rather than the default.
 * @docs vscode.md#collapsed-markers
 */

import * as vscode from 'vscode';
import { inlineAvailable } from './inline';

/** The one command that opens what a pointer points at. */
export const PEEK_COMMAND = 'docsmirror.peek';

type Definition = vscode.Location | vscode.LocationLink;

function toLocation(definition: Definition): vscode.Location {
  return 'targetUri' in definition
    ? new vscode.Location(definition.targetUri, definition.targetSelectionRange ?? definition.targetRange)
    : definition;
}

/**
 * Peeks the section a pointer targets. The arguments come from the marker
 * click, which knows the pointer's own position; without them the pointer
 * under the cursor is used, which is what makes the command work from the
 * keyboard and the palette.
 */
async function peek(uri?: string, line?: number, character?: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const target = uri === undefined ? editor?.document.uri : vscode.Uri.parse(uri);
  const position =
    line === undefined || character === undefined
      ? editor?.selection.active
      : new vscode.Position(line, character);
  if (target === undefined || position === undefined) {
    return;
  }

  // Only when the peek was asked for from somewhere else: reopening the editor
  // that is already showing would scroll it out from under the reader.
  if (editor?.document.uri.toString() !== target.toString()) {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target));
  }

  const definitions = await vscode.commands.executeCommand<Definition[]>(
    'vscode.executeDefinitionProvider',
    target,
    position,
  );
  if (definitions === undefined || definitions.length === 0) {
    void vscode.window.showInformationMessage('DocsMirror: no documentation is pointed at here.');
    return;
  }

  await vscode.commands.executeCommand(
    'editor.action.peekLocations',
    target,
    position,
    definitions.map(toLocation),
    'peek',
  );
}

/**
 * Registers the expand command. `expandInline` is the richer rendering, used
 * whenever it is switched on and the editor grants it.
 */
export function registerPeek(context: vscode.ExtensionContext, expandInline: () => Promise<void>): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      PEEK_COMMAND,
      async (uri?: string, line?: number, character?: number): Promise<void> => {
        if (inlineAvailable()) {
          await expandInline();
          return;
        }
        await peek(uri, line, character);
      },
    ),
  );
}
