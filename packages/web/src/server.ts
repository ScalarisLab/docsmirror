import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import * as nodePath from 'node:path';
import { HistoryService } from './history';
import { isTrustedRequest, readJsonBody, sendBuffer, sendError, sendJson } from './http';
import { docPathOf, isWritableDocPath } from './paths';
import { DocsProject } from './project';
import { ASSET_TYPES, readPublicFile } from './static';

export interface DocsServerOptions {
  /** Project to serve. Its `docsmirror.config.json` names the docs root. */
  readonly projectRoot: string;
  /** Port to listen on. `0` picks a free one, which tests rely on. */
  readonly port?: number;
  /** Interface to bind. Loopback by default; anything else opts out of the Host pin. */
  readonly host?: string;
}

export interface DocsServer {
  /** Address the app is reachable at. */
  readonly url: string;
  close(): Promise<void>;
}

const DEFAULT_PORT = 4321;
const DEFAULT_HOST = '127.0.0.1';

function firstQueryValue(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) ?? undefined;
}

/**
 * The local documentation app: reads a project's docs root, renders it, and
 * writes edits straight back to the files.
 * @docs web.md#http-api
 */
export async function startDocsServer(options: DocsServerOptions): Promise<DocsServer> {
  const project = await DocsProject.open(options.projectRoot);
  const history = new HistoryService(project);
  const host = options.host ?? DEFAULT_HOST;

  const routes = new Routes(project, history);
  const requestedPort = options.port ?? DEFAULT_PORT;
  let boundPort = requestedPort;

  const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const server = createServer((request, response) => {
    void handle(request, response, routes, boundPort, loopbackOnly);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address !== null && typeof address === 'object') {
    boundPort = address.port;
  }

  return {
    url: `http://${host.includes(':') ? `[${host}]` : host}:${boundPort}/`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
    server.closeAllConnections?.();
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  routes: Routes,
  port: number,
  loopbackOnly: boolean,
): Promise<void> {
  try {
    if (!isTrustedRequest(request, port, loopbackOnly)) {
      sendError(response, 403, 'This server only answers requests from the machine it runs on.');
      return;
    }
    const url = new URL(request.url ?? '/', 'http://localhost');
    await routes.dispatch(request, response, url);
  } catch (error) {
    if (!response.headersSent) {
      sendError(response, 500, error instanceof Error ? error.message : 'Unexpected server error.');
    } else {
      response.end();
    }
  }
}

class Routes {
  constructor(
    private readonly project: DocsProject,
    private readonly history: HistoryService,
  ) {}

  async dispatch(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const method = request.method ?? 'GET';

    if (url.pathname === '/api/doc' && method === 'PUT') {
      await this.writeDocument(request, response);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      sendError(response, 405, `${method} is not allowed here.`);
      return;
    }

    switch (url.pathname) {
      case '/api/manifest':
        sendJson(response, 200, await this.project.manifestNow());
        return;
      case '/api/health':
        sendJson(response, 200, await this.project.healthNow());
        return;
      case '/api/doc':
        await this.readDocument(response, url);
        return;
      case '/api/emphasis':
        await this.emphasis(response, url);
        return;
      case '/api/search':
        sendJson(response, 200, await this.project.search(firstQueryValue(url, 'q') ?? ''));
        return;
      case '/api/history/graph':
        sendJson(response, 200, await this.history.graph());
        return;
      case '/api/history/file':
        await this.fileHistory(response, url);
        return;
      case '/api/history/diff':
        await this.diff(response, url);
        return;
      case '/asset':
        await this.asset(response, url);
        return;
      default:
        break;
    }

    if (url.pathname.startsWith('/api/')) {
      sendError(response, 404, 'No such endpoint.');
      return;
    }
    await this.staticFile(response, url);
  }

  private async readDocument(response: ServerResponse, url: URL): Promise<void> {
    const path = docPathOf(this.project.root, firstQueryValue(url, 'path'));
    if (path === undefined) {
      sendError(response, 400, 'The path parameter must name a document inside the docs root.');
      return;
    }
    // The same extension policy as the write: this endpoint serves documents,
    // and a contained path to anything else in the docs root is not one.
    if (!isWritableDocPath(path)) {
      sendError(response, 400, 'Only markdown documents can be read here.');
      return;
    }
    const document = await this.project.readDocument(path);
    if (document === undefined) {
      sendError(response, 404, `No document at ${path}.`);
      return;
    }
    sendJson(response, 200, document);
  }

  /**
   * What this document leans on that the corpus does not. Answers `null` when
   * no term stands out, which is an ordinary result rather than an error.
   */
  private async emphasis(response: ServerResponse, url: URL): Promise<void> {
    const path = docPathOf(this.project.root, firstQueryValue(url, 'path'));
    if (path === undefined) {
      sendError(response, 400, 'The path parameter must name a document inside the docs root.');
      return;
    }
    sendJson(response, 200, (await this.project.emphasisOf(path)) ?? null);
  }

  private async writeDocument(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendError(response, body.status, body.message);
      return;
    }
    const payload = body.value as { path?: unknown; markdown?: unknown };
    const path = docPathOf(this.project.root, payload.path);
    if (path === undefined) {
      sendError(response, 400, 'The path field must name a document inside the docs root.');
      return;
    }
    if (!isWritableDocPath(path)) {
      sendError(response, 400, 'Only markdown documents can be written.');
      return;
    }
    if (typeof payload.markdown !== 'string') {
      sendError(response, 400, 'The markdown field must be a string.');
      return;
    }
    const node = await this.project.writeDocument(path, payload.markdown);
    if (node === undefined) {
      sendError(response, 500, `The document at ${path} could not be described after the write.`);
      return;
    }
    sendJson(response, 200, node);
  }

  private async fileHistory(response: ServerResponse, url: URL): Promise<void> {
    const path = docPathOf(this.project.root, firstQueryValue(url, 'path'));
    if (path === undefined) {
      sendError(response, 400, 'The path parameter must name a document inside the docs root.');
      return;
    }
    sendJson(response, 200, await this.history.timeline(path));
  }

  private async diff(response: ServerResponse, url: URL): Promise<void> {
    const path = docPathOf(this.project.root, firstQueryValue(url, 'path'));
    const from = firstQueryValue(url, 'from');
    const to = firstQueryValue(url, 'to');
    if (path === undefined) {
      sendError(response, 400, 'The path parameter must name a document inside the docs root.');
      return;
    }
    if (from === undefined || to === undefined) {
      sendError(response, 400, 'The from and to parameters are both required.');
      return;
    }
    sendJson(response, 200, await this.history.diff(path, from, to));
  }

  /** Images a document embeds, read from the docs root and nowhere else. */
  private async asset(response: ServerResponse, url: URL): Promise<void> {
    const path = docPathOf(this.project.root, firstQueryValue(url, 'path'));
    const contentType = path === undefined ? undefined : ASSET_TYPES.get(nodePath.posix.extname(path).toLowerCase());
    const absolute = path === undefined ? undefined : this.project.root.absolutePathOf(path);
    if (path === undefined || contentType === undefined || absolute === undefined) {
      sendError(response, 400, 'The path parameter must name an image inside the docs root.');
      return;
    }
    try {
      sendBuffer(response, 200, contentType, await fs.readFile(absolute));
    } catch {
      sendError(response, 404, `No asset at ${path}.`);
    }
  }

  private async staticFile(response: ServerResponse, url: URL): Promise<void> {
    const file = await readPublicFile(url.pathname);
    if (file === undefined) {
      sendError(response, 404, 'Not found.');
      return;
    }
    sendBuffer(response, 200, file.contentType, file.body);
  }
}
