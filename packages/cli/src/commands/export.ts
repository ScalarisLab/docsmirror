import * as nodePath from 'node:path';

export interface ExportOptions {
  readonly projectRoot: string;
  readonly outDir: string;
}

export interface ExportResult {
  readonly exitCode: number;
  readonly output: string;
}

/**
 * `@docsmirror/web` is the one dependency `check` and `manifest` never touch,
 * a webapp and its markdown renderer, pulled in only for this command.
 * Loading it dynamically, and listing it as optional in `package.json`, means
 * a CI install that runs `npm ci --omit=optional` for `check`/`manifest`
 * never pays for it, while a normal install still gets `export` for free.
 * @docs cli.md#docsmirror-export
 */
async function loadWeb(): Promise<typeof import('@docsmirror/web')> {
  try {
    return await import('@docsmirror/web');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const missingWeb =
      (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
      (error as Error).message.includes('@docsmirror/web');
    if (missingWeb) {
      throw new Error(
        '`docsmirror export` needs @docsmirror/web, which is not installed. Run `npm install @docsmirror/web`.',
      );
    }
    throw error;
  }
}

/**
 * Runs `docsmirror export`: writes a read-only, static copy of the
 * documentation app, ready to host anywhere that serves plain files.
 * @docs web.md#static-export
 */
export async function runExport(options: ExportOptions): Promise<ExportResult> {
  const projectRoot = nodePath.resolve(options.projectRoot);
  const outDir = nodePath.resolve(projectRoot, options.outDir);

  let summary;
  try {
    const { exportStaticSite } = await loadWeb();
    summary = await exportStaticSite({ projectRoot, outDir });
  } catch (error) {
    return { exitCode: 2, output: `docsmirror: ${(error as Error).message}\n` };
  }

  const historyLine = summary.history
    ? 'Git history is included.'
    : 'No git history: the project is not a git repository, or has no commits.';
  return {
    exitCode: 0,
    output: `Wrote a static, read-only copy of ${summary.documents} documents and ${summary.assets} assets to ${summary.outDir}\n${historyLine}\n`,
  };
}
