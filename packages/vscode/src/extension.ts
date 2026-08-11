/**
 * A thin VS Code client. Every language feature lives in the language server,
 * so this file starts it, stops it and forwards configuration; what little the
 * client owns is presentation VS Code has no protocol for, the collapsed
 * marker and the peek it expands into.
 * @docs server.md#editor-clients
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node';
import { registerInlineDocs } from './inline';
import { markersEnabled, registerPointerMarkers } from './markers';
import { PEEK_COMMAND, registerPeek } from './peek';
import { PointerCache } from './pointers';
import { SETTINGS_SECTION } from './settings';

const CLIENT_ID = 'docsmirror';
const CLIENT_NAME = 'DocsMirror';
/** Changes to these files change what a pointer resolves to. */
const WATCHED_FILES = '**/*.{md,markdown,json}';

/** Module-level only so `deactivate` can reach the process to stop it. */
let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // One cache, two readers: the marker draws the pointer line and the inline
  // view opens what is on it, from the same answer.
  const pointers = new PointerCache();
  const inlineDocs = registerInlineDocs(context, () => client, pointers, async (uri, line, character) => {
    await vscode.commands.executeCommand(PEEK_COMMAND, uri, line, character);
  });
  registerPeek(context, inlineDocs.toggle);
  const redrawMarkers = registerPointerMarkers(context, () => client, inlineDocs.expanded, pointers);
  const redraw = (): void => {
    redrawMarkers();
    inlineDocs.refresh();
  };

  // Created once, whatever the server does: a restart replaces the client, and
  // a watcher recreated with it would leave the previous one running forever.
  const watcher = vscode.workspace.createFileSystemWatcher(WATCHED_FILES);
  context.subscriptions.push(watcher);

  const createClient = (): LanguageClient => {
    // The server is bundled beside this file and launched as its own process.
    const module = path.join(__dirname, 'server.js');
    const serverOptions: ServerOptions = {
      run: { module, transport: TransportKind.ipc },
      debug: { module, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6009'] } },
    };

    const clientOptions: LanguageClientOptions = {
      // The convention is language-agnostic: a pointer is valid in any file.
      documentSelector: [{ scheme: 'file' }],
      middleware: {
        workspace: {
          // While this client draws the pointer line itself, the server's inlay
          // hint would be a second copy of the same sentence on the same line.
          configuration: async (params, token, next) => {
            const sections = await next(params, token);
            if (!Array.isArray(sections) || !markersEnabled()) {
              return sections;
            }
            return sections.map((section: unknown) =>
              section === null || typeof section !== 'object'
                ? section
                : { ...(section as object), inlayHints: { enabled: false } },
            );
          },
        },
        // A section already open in the comment shows its own prose; a hover on
        // the same line would say the same thing a second time, in a tooltip
        // sitting right above the text it duplicates.
        provideHover: (document, position, token, next) => {
          if (inlineDocs.expanded.linesIn(document.uri.toString()).has(position.line)) {
            return null;
          }
          return next(document, position, token);
        },
      },
      synchronize: {
        configurationSection: SETTINGS_SECTION,
        fileEvents: watcher,
      },
    };

    return new LanguageClient(CLIENT_ID, CLIENT_NAME, serverOptions, clientOptions);
  };

  const restart = async (): Promise<void> => {
    await client?.stop();
    client = createClient();
    await client.start();
    redraw();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('docsmirror.restartServer', async () => {
      try {
        await restart();
        void vscode.window.showInformationMessage('DocsMirror language server restarted.');
      } catch (error) {
        void vscode.window.showErrorMessage(`DocsMirror could not restart: ${(error as Error).message}`);
      }
    }),
  );

  client = createClient();
  await client.start();
  redraw();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}
