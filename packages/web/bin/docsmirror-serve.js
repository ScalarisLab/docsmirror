#!/usr/bin/env node
/**
 * Starts the DocsMirror web app against a project.
 *
 *   docsmirror-serve [project-root] [--port <number>] [--open]
 *
 * The project root defaults to the current working directory. The server binds
 * to 127.0.0.1 and is a development tool, never something to expose.
 */
const { spawn } = require('node:child_process');
const { startDocsServer } = require('../dist/index.js');

const USAGE = [
  'Usage: docsmirror-serve [project-root] [options]',
  '',
  'Options:',
  '  --port <number>  Port to listen on (default 4321)',
  '  --open           Open the app in the default browser',
  '  -h, --help       Show this message',
].join('\n');

function parseArguments(argv) {
  let projectRoot = process.cwd();
  let port = 4321;
  let open = false;
  let sawProjectRoot = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      return { help: true };
    }
    if (argument === '--open') {
      open = true;
    } else if (argument === '--port') {
      index += 1;
      port = Number(argv[index]);
    } else if (argument.startsWith('--port=')) {
      port = Number(argument.slice('--port='.length));
    } else if (argument.startsWith('-')) {
      return { error: `Unknown option: ${argument}` };
    } else if (sawProjectRoot) {
      return { error: `Unexpected argument: ${argument}` };
    } else {
      projectRoot = argument;
      sawProjectRoot = true;
    }
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return { error: 'The --port option needs an integer between 0 and 65535.' };
  }
  return { projectRoot, port, open };
}

function openInBrowser(url) {
  const command =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}\n`);
    return 2;
  }

  const server = await startDocsServer({ projectRoot: parsed.projectRoot, port: parsed.port });
  process.stdout.write(`DocsMirror is reading ${parsed.projectRoot} at ${server.url}\n`);
  if (parsed.open) {
    openInBrowser(server.url);
  }

  const stop = () => {
    server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return undefined;
}

main().then((code) => {
  if (code !== undefined) {
    process.exit(code);
  }
});
