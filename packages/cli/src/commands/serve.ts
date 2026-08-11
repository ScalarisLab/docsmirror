import * as nodePath from 'node:path';

export interface ServeOptions {
  readonly projectRoot: string;
  readonly port: number | undefined;
  readonly host: string | undefined;
}

/**
 * `@scalarislab/docsmirror-web` is the one dependency `check` and `manifest` never touch
 *, a webapp and its markdown renderer, pulled in only for this command.
 * Loading it dynamically, and listing it as optional in `package.json`,
 * means a CI install that runs `npm ci --omit=optional` for `check`/`manifest`
 * never pays for it, while a normal install still gets `serve` for free.
 * @docs cli.md#docsmirror-serve
 */
async function loadServer(): Promise<typeof import('@scalarislab/docsmirror-web')> {
  try {
    return await import('@scalarislab/docsmirror-web');
  } catch (error) {
    // Only a genuinely absent module earns the install hint. A web package
    // that is installed but crashes while loading must surface its own error,
    // or the hint sends the user reinstalling a package they already have.
    const code = (error as NodeJS.ErrnoException).code;
    const missingWeb =
      (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
      (error as Error).message.includes('@scalarislab/docsmirror-web');
    if (missingWeb) {
      throw new Error(
        '`docsmirror serve` needs @scalarislab/docsmirror-web, which is not installed. Run `npm install @scalarislab/docsmirror-web`.',
      );
    }
    throw error;
  }
}

/**
 * Runs `docsmirror serve`. Unlike the other commands this one does not return
 * until the server stops, so it resolves only on shutdown.
 * @docs web.md#local-not-hosted
 */
export async function runServe(options: ServeOptions): Promise<number> {
  const projectRoot = nodePath.resolve(options.projectRoot);

  let server;
  try {
    const { startDocsServer } = await loadServer();
    server = await startDocsServer({
      projectRoot,
      ...(options.port === undefined ? {} : { port: options.port }),
      ...(options.host === undefined ? {} : { host: options.host }),
    });
  } catch (error) {
    process.stderr.write(`docsmirror: ${(error as Error).message}\n`);
    return 2;
  }

  process.stdout.write(`DocsMirror is serving ${projectRoot}\n${server.url}\n`);

  return new Promise<number>((resolve) => {
    let stopping = false;
    const stop = (): void => {
      if (stopping) {
        return;
      }
      stopping = true;
      void server.close().then(
        () => resolve(0),
        (error: unknown) => {
          process.stderr.write(`docsmirror: ${(error as Error).message}\n`);
          resolve(1);
        },
      );
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}
