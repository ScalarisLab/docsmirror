/**
 * Runs the `git` binary as a subprocess, argv-only, never through a shell.
 * @docs history.md#reading-git-not-a-new-format
 */
import { execFile } from 'node:child_process';

export interface GitResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

const MAX_BUFFER = 64 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/**
 * Runs git with an explicit argv array. Never rejects on a non-zero exit code
 * (callers decide what a failure means for them); rejects only when the
 * process itself could not be spawned or run at all (e.g. git is missing).
 */
export function runGit(cwd: string, args: readonly string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args as string[],
      { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          // Spawn-level failure (git missing, EACCES, ETIMEDOUT, ...): no exit code to report.
          reject(error);
          return;
        }
        const exitCode = error ? (error.code as number) : 0;
        resolve({ stdout, stderr, exitCode });
      },
    );
  });
}

/** Runs git and throws with stderr context when the exit code is non-zero. */
export async function runGitOrThrow(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runGit(cwd, args);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${result.exitCode}): ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/**
 * Rejects anything that could be mistaken for a git option by the argv
 * parser, so a caller-supplied path or revision can never smuggle in a flag.
 */
export function assertSafeArg(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  if (value.startsWith('-')) {
    throw new Error(`${label} must not start with '-': ${value}`);
  }
}

/** Normalizes a repository-relative path to the POSIX separators git expects on the wire. */
export function toPosixPath(relativePath: string): string {
  return relativePath.split('\\').join('/');
}
