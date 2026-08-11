/**
 * Transport selection.
 *
 * `vscode-languageserver` reads the transport from `process.argv` and refuses
 * to start when none is given. A language server that cannot be launched by a
 * plain `docsmirror-lsp` is a language server most editors cannot use, so an
 * argument-free start means stdio.
 * @docs server.md#launching
 */

const TRANSPORT_FLAGS = ['--stdio', '--node-ipc', '--socket', '--pipe'] as const;

/** Adds `--stdio` when the caller named no transport. Any named one is left alone. */
export function ensureTransportFlag(argv: string[]): void {
  const named = argv
    .slice(2)
    .some((argument) => TRANSPORT_FLAGS.some((flag) => argument === flag || argument.startsWith(`${flag}=`)));
  if (!named) {
    argv.push('--stdio');
  }
}
