import type { IncomingMessage, ServerResponse } from 'node:http';

/** Largest request body accepted, in bytes. Documents are prose, not payloads. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.byteLength,
    'cache-control': 'no-store',
  });
  response.end(payload);
}

export function sendError(response: ServerResponse, status: number, message: string): void {
  sendJson(response, status, { error: message });
}

export function sendBuffer(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: Buffer,
): void {
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': body.byteLength,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

export type BodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly status: number; readonly message: string };

/**
 * How much of an oversized body is drained before the socket is cut. A client
 * that overshoots the cap still gets to read the 413, but a client that keeps
 * streaming does not get to do it for ever.
 */
const MAX_DISCARDED_BYTES = MAX_BODY_BYTES * 8;

/** Reads a JSON request body, refusing anything past the size cap. */
export function readJsonBody(request: IncomingMessage): Promise<BodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const settle = (result: BodyResult): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        // Keep reading and discarding: cutting the connection here would reset
        // it before the client could read the answer.
        chunks.length = 0;
        settle({ ok: false, status: 413, message: 'The request body is too large.' });
        if (size > MAX_DISCARDED_BYTES) {
          request.destroy();
        }
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', () => settle({ ok: false, status: 400, message: 'The request body could not be read.' }));
    request.on('end', () => {
      try {
        settle({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        settle({ ok: false, status: 400, message: 'The request body is not valid JSON.' });
      }
    });
  });
}

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]', '::1'];

/**
 * Whether a request may reach a server that writes to disk.
 *
 * On the default loopback bind, a page open in the same browser can still
 * address the server: pinning the Host header stops DNS rebinding, and
 * refusing a foreign Origin stops another site from driving the editor.
 * Binding another interface is an explicit opt-in to being addressed by that
 * interface's name, so the Host pin steps aside there, but a browser request
 * must still come from the page this server served, so the Origin, when one is
 * sent, must match the address the reader used.
 */
export function isTrustedRequest(request: IncomingMessage, port: number, loopbackOnly: boolean): boolean {
  const host = request.headers.host ?? '';
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0] ?? '';
  if (loopbackOnly && !LOOPBACK_HOSTNAMES.includes(hostname)) {
    return false;
  }
  const origin = request.headers.origin;
  if (origin === undefined || origin === 'null') {
    return true;
  }
  try {
    const parsed = new URL(origin);
    return loopbackOnly
      ? LOOPBACK_HOSTNAMES.includes(parsed.hostname) && parsed.port === String(port)
      : parsed.host === host;
  } catch {
    return false;
  }
}
