import { MANIFEST_FILE_NAME } from '@docsmirror/core';
import { runCheck, type CheckOptions } from './commands/check';
import { runExport, type ExportOptions } from './commands/export';
import { runManifest, type ManifestOptions } from './commands/manifest';
import { runServe, type ServeOptions } from './commands/serve';

// The version has one source of truth: package.json. dist/main.js sits one
// directory below it, in the repository and in the packed tarball alike.
const VERSION = (require('../package.json') as { version: string }).version;

const TOP_USAGE = `Usage: docsmirror <command> [options]

Commands:
  check [projectRoot]      Validate @docs pointers in a project
  manifest [projectRoot]   Generate the documentation manifest (${MANIFEST_FILE_NAME})
  serve [projectRoot]      Browse, search and edit the documentation locally
  export [projectRoot]     Write a static, read-only copy of the documentation app

Global options:
  --help, -h      Show help
  --version, -v   Show version number
`;

const SHARED_SCAN_OPTIONS = `  --docs <dir>       Docs root, relative to projectRoot (default from config, "docs")
  --include <glob>   Source glob to scan; repeatable. The first use replaces the
                      configured include list, further uses extend that new list.
  --exclude <glob>   Source glob to skip; repeatable. Always appended to the
                      configured exclude list.`;

const CHECK_USAGE = `Usage: docsmirror check [projectRoot] [options]

Scans a project's sources for @docs pointers, resolves them against the docs
root, and reports broken pointers. When the project has a ${MANIFEST_FILE_NAME},
it also fails if that manifest no longer matches the documentation on disk.
projectRoot defaults to the current working directory.

Options:
${SHARED_SCAN_OPTIONS}
  --orphans          Also report documents that no pointer and no index reaches (off by default)
  --manifest         Require a manifest, failing when the project has none
  --json             Print a machine-readable JSON report on stdout
  --quiet            Print only the summary line and failures
  --help, -h         Show this help
  --version, -v      Show version number

Exit codes:
  0   no issue found
  1   at least one issue reported
  2   usage error (bad flag, unreadable config, missing docs root)
`;

const MANIFEST_USAGE = `Usage: docsmirror manifest [projectRoot] [options]

Generates ${MANIFEST_FILE_NAME}: a machine-readable description of the whole
documentation surface, every document, what it covers, its anchors, and the
code that points at it. The manifest is generated, never hand-edited.
projectRoot defaults to the current working directory.

Options:
${SHARED_SCAN_OPTIONS}
  --check            Verify the file on disk is current instead of writing it
  --stdout           Print the manifest instead of writing it
  --out <file>       Manifest file name, relative to projectRoot (default "${MANIFEST_FILE_NAME}")
  --help, -h         Show this help
  --version, -v      Show version number

Exit codes:
  0   written, printed, or verified as current
  1   --check found a missing or out-of-date manifest
  2   usage error (bad flag, unreadable config, missing docs root)
`;

const SERVE_USAGE = `Usage: docsmirror serve [projectRoot] [options]

Starts the local documentation app: browse, search, edit and read the history
of the project's own markdown files. It writes to the files in your working
tree and binds to loopback only. projectRoot defaults to the current working
directory. Runs until interrupted.

Options:
  --port <number>    Port to listen on (default 4321; 0 picks a free one)
  --host <address>   Interface to bind (default 127.0.0.1)
  --help, -h         Show this help
  --version, -v      Show version number

Exit codes:
  0   stopped cleanly
  2   usage error (bad flag, missing docs root)
`;

const EXPORT_USAGE = `Usage: docsmirror export [projectRoot] [options]

Writes a static, read-only copy of the documentation app: every document, the
manifest, health, search and git history, ready to host anywhere that serves
plain files, GitHub Pages included. Editing and comparing two arbitrary
revisions need a live server and are not part of the export; run
\`docsmirror serve\` locally for those. projectRoot defaults to the current
working directory.

Options:
  --out <dir>        Output directory, relative to projectRoot (default "docs-site")
  --help, -h         Show this help
  --version, -v      Show version number

Exit codes:
  0   written
  2   usage error (bad flag, missing docs root, @docsmirror/web not installed)
`;

/** Flags shared by every command that scans a project. */
interface ScanArgs {
  projectRoot: string | undefined;
  docsOverride: string | undefined;
  includeOverride: string[] | undefined;
  excludeAdditions: string[];
}

/** A malformed invocation. `main` prints the message with the command's usage and exits 2. */
class UsageError extends Error {}

/** `--help` or `--version` seen while parsing. `main` prints the answer on stdout and exits 0. */
class InfoRequest extends Error {
  constructor(readonly info: 'help' | 'version') {
    super(info);
  }
}

/** Throws when the argument asks for help or the version; every command honours both anywhere. */
function honorInfoFlags(arg: string | undefined): void {
  if (arg === '--help' || arg === '-h') {
    throw new InfoRequest('help');
  }
  if (arg === '--version' || arg === '-v') {
    throw new InfoRequest('version');
  }
}

function emptyScanArgs(): ScanArgs {
  return { projectRoot: undefined, docsOverride: undefined, includeOverride: undefined, excludeAdditions: [] };
}

/**
 * Consumes one argument. Returns how many arguments were used, `0` when the
 * argument is not a shared one; throws when it is malformed.
 */
function readSharedArg(args: readonly string[], index: number, into: ScanArgs): number {
  const arg = args[index];
  if (arg !== '--docs' && arg !== '--include' && arg !== '--exclude') {
    return 0;
  }
  const value = args[index + 1];
  if (value === undefined) {
    throw new UsageError(`${arg} requires a value`);
  }
  if (arg === '--docs') {
    into.docsOverride = value;
  } else if (arg === '--include') {
    into.includeOverride = into.includeOverride === undefined ? [value] : [...into.includeOverride, value];
  } else {
    into.excludeAdditions.push(value);
  }
  return 2;
}

/** Records a bare argument as the project root, rejecting a second one. */
function readProjectRoot(arg: string | undefined, into: ScanArgs): void {
  if (arg !== undefined && arg.startsWith('-')) {
    throw new UsageError(`Unknown option: ${arg}`);
  }
  if (into.projectRoot !== undefined) {
    throw new UsageError(`Unexpected argument: ${arg}`);
  }
  into.projectRoot = arg;
}

function parseCheckArgs(args: readonly string[]): CheckOptions {
  const shared = emptyScanArgs();
  let orphans = false;
  let requireManifest = false;
  let json = false;
  let quiet = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    honorInfoFlags(arg);
    const consumed = readSharedArg(args, i, shared);
    if (consumed > 0) {
      i += consumed - 1;
      continue;
    }
    if (arg === '--orphans') {
      orphans = true;
      continue;
    }
    if (arg === '--manifest') {
      requireManifest = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--quiet') {
      quiet = true;
      continue;
    }
    readProjectRoot(arg, shared);
  }

  return {
    projectRoot: shared.projectRoot ?? process.cwd(),
    docsOverride: shared.docsOverride,
    orphans,
    includeOverride: shared.includeOverride,
    excludeAdditions: shared.excludeAdditions,
    json,
    quiet,
    requireManifest,
  };
}

function parseManifestArgs(args: readonly string[]): ManifestOptions {
  const shared = emptyScanArgs();
  let checkOnly = false;
  let toStdout = false;
  let fileName = MANIFEST_FILE_NAME;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    honorInfoFlags(arg);
    const consumed = readSharedArg(args, i, shared);
    if (consumed > 0) {
      i += consumed - 1;
      continue;
    }
    if (arg === '--check') {
      checkOnly = true;
      continue;
    }
    if (arg === '--stdout') {
      toStdout = true;
      continue;
    }
    if (arg === '--out') {
      const value = args[i + 1];
      if (value === undefined) {
        throw new UsageError('--out requires a value');
      }
      fileName = value;
      i += 1;
      continue;
    }
    readProjectRoot(arg, shared);
  }

  if (checkOnly && toStdout) {
    throw new UsageError('--check and --stdout cannot be combined');
  }

  return {
    projectRoot: shared.projectRoot ?? process.cwd(),
    docsOverride: shared.docsOverride,
    includeOverride: shared.includeOverride,
    excludeAdditions: shared.excludeAdditions,
    checkOnly,
    toStdout,
    fileName,
  };
}

function parseServeArgs(args: readonly string[]): ServeOptions {
  let projectRoot: string | undefined;
  let port: number | undefined;
  let host: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    honorInfoFlags(arg);
    if (arg === '--port' || arg === '--host') {
      const value = args[i + 1];
      if (value === undefined) {
        throw new UsageError(`${arg} requires a value`);
      }
      i += 1;
      if (arg === '--host') {
        host = value;
      } else {
        const parsedPort = Number(value);
        if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
          throw new UsageError(`--port must be a port number, got \`${value}\``);
        }
        port = parsedPort;
      }
      continue;
    }
    if (arg !== undefined && arg.startsWith('-')) {
      throw new UsageError(`Unknown option: ${arg}`);
    }
    if (projectRoot !== undefined) {
      throw new UsageError(`Unexpected argument: ${arg}`);
    }
    projectRoot = arg;
  }

  return { projectRoot: projectRoot ?? process.cwd(), port, host };
}

function parseExportArgs(args: readonly string[]): ExportOptions {
  let projectRoot: string | undefined;
  let outDir = 'docs-site';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    honorInfoFlags(arg);
    if (arg === '--out') {
      const value = args[i + 1];
      if (value === undefined) {
        throw new UsageError('--out requires a value');
      }
      outDir = value;
      i += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith('-')) {
      throw new UsageError(`Unknown option: ${arg}`);
    }
    if (projectRoot !== undefined) {
      throw new UsageError(`Unexpected argument: ${arg}`);
    }
    projectRoot = arg;
  }

  return { projectRoot: projectRoot ?? process.cwd(), outDir };
}

/** Runs one command, or answers the help/version/usage-error interruptions its parser threw. */
async function dispatch(run: () => Promise<number>, usage: string): Promise<number> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof InfoRequest) {
      process.stdout.write(error.info === 'help' ? usage : `${VERSION}\n`);
      return 0;
    }
    if (error instanceof UsageError) {
      process.stderr.write(`docsmirror: ${error.message}\n\n${usage}`);
      return 2;
    }
    throw error;
  }
}

/** Writes a finished command's report to the stream its exit code calls for. */
function report(result: { exitCode: number; output: string }): number {
  (result.exitCode === 2 ? process.stderr : process.stdout).write(result.output);
  return result.exitCode;
}

/** CLI entry point. Returns the process exit code; never calls process.exit itself. */
export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined) {
    process.stderr.write(TOP_USAGE);
    return 2;
  }
  if (command === '--help' || command === '-h') {
    process.stdout.write(TOP_USAGE);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (command === 'check') {
    return dispatch(async () => report(await runCheck(parseCheckArgs(rest))), CHECK_USAGE);
  }
  if (command === 'manifest') {
    return dispatch(async () => report(await runManifest(parseManifestArgs(rest))), MANIFEST_USAGE);
  }
  if (command === 'serve') {
    return dispatch(() => runServe(parseServeArgs(rest)), SERVE_USAGE);
  }
  if (command === 'export') {
    return dispatch(async () => report(await runExport(parseExportArgs(rest))), EXPORT_USAGE);
  }

  process.stderr.write(`docsmirror: unknown command \`${command}\`\n\n${TOP_USAGE}`);
  return 2;
}
