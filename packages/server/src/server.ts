/**
 * The DocsMirror language server.
 *
 * Every feature reads pointers through `@scalarislab/docsmirror-core`, so an editor, the
 * CLI and a CI run see the same convention and report the same problems. This
 * module is only wiring: protocol in, feature calls out.
 * @docs server.md#the-server
 */

import {
  createConnection,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  WatchKind,
  type ClientCapabilities,
  type InitializeParams,
  type InitializeResult,
  type ServerCapabilities,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CONFIG_FILE_NAME } from '@scalarislab/docsmirror-core';
import { diagnosticsFor } from './features/diagnostics';
import { definitionAt } from './features/definition';
import { documentLinksFor } from './features/documentLink';
import { hoverAt } from './features/hover';
import { inlayHintsFor, resolveInlayHint } from './features/inlayHints';
import { pointerMarkersFor } from './features/pointers';
import { sectionAt } from './features/section';
import { PointerIndex } from './pointer/PointerIndex';
import {
  POINTERS_REQUEST,
  SECTION_REQUEST,
  type PointerMarkersResult,
  type SectionContent,
} from './protocol';
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_SECTION, type DocsMirrorSettings } from './settings';
import { ensureTransportFlag } from './transport';
import { Debouncer } from './util/Debouncer';
import { uriToPath } from './workspace/paths';
import type { Workspace } from './workspace/Workspace';
import { WorkspaceRegistry } from './workspace/WorkspaceRegistry';

export * from './protocol';

/** Quiet period before a changed document is re-validated. */
const VALIDATION_DELAY_MS = 250;

/**
 * Read at runtime rather than hardcoded, so `initialize` can never announce a
 * version the package left behind. The path holds from `dist/server.js` in the
 * npm tarball and from the bundled extension alike: one directory up from the
 * compiled file is the package root and its `package.json`.
 */
const SERVER_VERSION = (require('../package.json') as { version: string }).version;

function supportsInlayHints(capabilities: ClientCapabilities): boolean {
  return capabilities.textDocument?.inlayHint !== undefined;
}

function supportsDocumentLinks(capabilities: ClientCapabilities): boolean {
  return capabilities.textDocument?.documentLink !== undefined;
}

function definitionLinkSupport(capabilities: ClientCapabilities): boolean {
  return capabilities.textDocument?.declaration?.linkSupport === true ||
    capabilities.textDocument?.definition?.linkSupport === true;
}

/** The folders the client opened, as filesystem paths. */
function initialFolders(params: InitializeParams): string[] {
  const folders = params.workspaceFolders ?? [];
  const paths = folders
    .map((folder) => uriToPath(folder.uri))
    .filter((path): path is string => path !== undefined);
  if (paths.length > 0) {
    return paths;
  }
  const rootPath = params.rootUri === null || params.rootUri === undefined ? undefined : uriToPath(params.rootUri);
  return rootPath === undefined ? [] : [rootPath];
}

/**
 * Whether this document is one the project scans for pointers at all.
 *
 * Every request handler below asks the same feature functions diagnostics
 * already asked through `workspace.scansSource`, a markdown file is excluded
 * by default, precisely so a fenced code block *showing* the `@docs`
 * convention is prose, not a pointer. Hover, the collapsed marker, go-to and
 * document links all read the same source text the same way, so without this
 * check every doc explaining the convention would flag its own examples as
 * broken.
 */
function isScanned(document: TextDocument, workspace: Workspace): boolean {
  const path = uriToPath(document.uri);
  return path === undefined || workspace.scansSource(path);
}

export function start(): void {
  ensureTransportFlag(process.argv);

  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const index = new PointerIndex();
  const debouncer = new Debouncer(VALIDATION_DELAY_MS);

  let capabilities: ClientCapabilities = {};
  let settings: DocsMirrorSettings = DEFAULT_SETTINGS;
  let registry = new WorkspaceRegistry(settings, process.cwd());

  const report = (what: string, error: unknown): void => {
    connection.console.error(`docsmirror: ${what} failed, ${(error as Error).message}`);
  };

  /** Runs a request handler, turning any failure into a logged empty answer. */
  const safely = async <T>(what: string, fallback: T, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      report(what, error);
      return fallback;
    }
  };

  /** Runs a notification handler in the background; failure is logged, never thrown. */
  const guard = (what: string, run: () => Promise<void>): void => {
    run().catch((error: unknown) => report(what, error));
  };

  /**
   * The preamble every request shares: the document must be open, owned by a
   * workspace, and one that workspace scans, or the request gets its fallback.
   */
  const withScanned = async <T>(
    what: string,
    uri: string,
    fallback: T,
    run: (document: TextDocument, workspace: Workspace) => Promise<T>,
  ): Promise<T> =>
    safely(what, fallback, async () => {
      const document = documents.get(uri);
      const workspace = await registry.forUri(uri);
      if (document === undefined || workspace === undefined || !isScanned(document, workspace)) {
        return fallback;
      }
      return run(document, workspace);
    });

  const validate = async (document: TextDocument): Promise<void> => {
    try {
      if (!settings.diagnostics.enabled) {
        connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics: [] });
        return;
      }
      const workspace = await registry.forUri(document.uri);
      const diagnostics = workspace === undefined ? [] : await diagnosticsFor(document, workspace);
      connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics });
    } catch (error) {
      report(`validating ${document.uri}`, error);
    }
  };

  const validateAll = async (): Promise<void> => {
    for (const document of documents.all()) {
      await validate(document);
    }
  };

  /** Asks the client to redraw hints whose underlying document changed. */
  const refreshInlayHints = (): void => {
    if (capabilities.workspace?.inlayHint?.refreshSupport === true) {
      void connection.languages.inlayHint.refresh();
    }
  };

  const readSettings = async (): Promise<DocsMirrorSettings> => {
    if (capabilities.workspace?.configuration !== true) {
      return settings;
    }
    return parseSettings(await connection.workspace.getConfiguration({ section: SETTINGS_SECTION }));
  };

  const applySettings = async (next: DocsMirrorSettings): Promise<void> => {
    settings = next;
    await registry.applySettings(next);
    await validateAll();
    refreshInlayHints();
  };

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    capabilities = params.capabilities;
    settings = parseSettings(
      (params.initializationOptions as Record<string, unknown> | undefined)?.[SETTINGS_SECTION] ??
        params.initializationOptions,
    );

    const folders = initialFolders(params);
    registry = new WorkspaceRegistry(settings, folders[0] ?? process.cwd());
    guard('loading workspace folders', async () => {
      await registry.setFolders(folders);
    });

    const serverCapabilities: ServerCapabilities = {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      ...(supportsInlayHints(params.capabilities) ? { inlayHintProvider: { resolveProvider: true } } : {}),
      ...(supportsDocumentLinks(params.capabilities) ? { documentLinkProvider: { resolveProvider: false } } : {}),
      ...(params.capabilities.workspace?.workspaceFolders === true
        ? { workspace: { workspaceFolders: { supported: true, changeNotifications: true } } }
        : {}),
    };

    return { capabilities: serverCapabilities, serverInfo: { name: 'DocsMirror', version: SERVER_VERSION } };
  });

  connection.onInitialized(() => {
    guard('completing initialization', async () => {
      if (capabilities.workspace?.didChangeConfiguration?.dynamicRegistration === true) {
        await connection.client.register(DidChangeConfigurationNotification.type, { section: SETTINGS_SECTION });
      }
      if (capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true) {
        await connection.client.register(DidChangeWatchedFilesNotification.type, {
          watchers: [
            { globPattern: '**/*.md', kind: WatchKind.Create | WatchKind.Change | WatchKind.Delete },
            { globPattern: '**/*.markdown', kind: WatchKind.Create | WatchKind.Change | WatchKind.Delete },
            { globPattern: `**/${CONFIG_FILE_NAME}`, kind: WatchKind.Create | WatchKind.Change | WatchKind.Delete },
          ],
        });
      }
      if (capabilities.workspace?.workspaceFolders === true) {
        connection.workspace.onDidChangeWorkspaceFolders((event) => {
          guard('updating workspace folders', async () => {
            registry.removeFolders(
              event.removed
                .map((folder) => uriToPath(folder.uri))
                .filter((path): path is string => path !== undefined),
            );
            await registry.addFolders(
              event.added.map((folder) => uriToPath(folder.uri)).filter((path): path is string => path !== undefined),
            );
            await validateAll();
          });
        });
      }
      await applySettings(await readSettings());
    });
  });

  connection.onDidChangeConfiguration((params) => {
    guard('applying settings', async () => {
      // The pushed payload is raw editor configuration; the pull goes through
      // the client's own middleware, which may rewrite what it serves, the
      // VS Code client forces inlay hints off while it draws the marker
      // itself. Whenever the client can answer a pull, the pull is the truth,
      // and the push is only trusted when there is no other source.
      if (capabilities.workspace?.configuration === true) {
        await applySettings(await readSettings());
        return;
      }
      const sent = (params.settings as Record<string, unknown> | undefined)?.[SETTINGS_SECTION];
      await applySettings(parseSettings(sent));
    });
  });

  connection.onDidChangeWatchedFiles((params) => {
    guard('handling watched file changes', async () => {
      for (const change of params.changes) {
        const path = uriToPath(change.uri);
        if (path !== undefined) {
          await registry.fileChanged(path);
        }
      }
      await validateAll();
      refreshInlayHints();
    });
  });

  connection.onHover(async (params) =>
    withScanned('hover', params.textDocument.uri, null, async (document, workspace) =>
      hoverAt(document, params.position, workspace, index),
    ),
  );

  connection.onDefinition(async (params) =>
    withScanned('definition', params.textDocument.uri, null, async (document, workspace) =>
      definitionAt(document, params.position, workspace, index, definitionLinkSupport(capabilities)),
    ),
  );

  // Not in the protocol: a client that draws the pointer line itself needs the
  // title and the range together. See features/pointers.
  connection.onRequest(
    POINTERS_REQUEST,
    async (params: { textDocument: { uri: string } }): Promise<PointerMarkersResult> =>
      withScanned(
        'pointer markers',
        params.textDocument.uri,
        { docsRootFound: true, markers: [] },
        async (document, workspace) => pointerMarkersFor(document, workspace, index),
      ),
  );

  // Not in the protocol either: the prose, so a client can render it somewhere
  // the editor does not own. See features/section.
  connection.onRequest(
    SECTION_REQUEST,
    async (params: {
      textDocument: { uri: string };
      position: { line: number; character: number };
    }): Promise<SectionContent | undefined> =>
      withScanned('section', params.textDocument.uri, undefined, async (document, workspace) =>
        sectionAt(document, params.position, workspace, index),
      ),
  );

  connection.onDocumentLinks(async (params) =>
    withScanned('document links', params.textDocument.uri, [], async (document, workspace) =>
      documentLinksFor(document, workspace, index),
    ),
  );

  connection.languages.inlayHint.on(async (params) => {
    if (!settings.inlayHints.enabled) {
      return [];
    }
    return withScanned('inlay hints', params.textDocument.uri, [], async (document, workspace) =>
      inlayHintsFor(document, params.range, workspace, index),
    );
  });

  connection.languages.inlayHint.resolve(async (hint) =>
    safely('inlay hint resolve', hint, async () => {
      const uri = (hint.data as { uri?: string } | undefined)?.uri;
      const document = uri === undefined ? undefined : documents.get(uri);
      const workspace = uri === undefined ? undefined : await registry.forUri(uri);
      return resolveInlayHint(hint, document, workspace, index);
    }),
  );

  documents.onDidChangeContent((event) => {
    debouncer.schedule(event.document.uri, () => {
      void validate(event.document);
    });
  });

  documents.onDidClose((event) => {
    debouncer.cancel(event.document.uri);
    index.forget(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });

  connection.onShutdown(() => {
    debouncer.dispose();
  });

  documents.listen(connection);
  connection.listen();
}
