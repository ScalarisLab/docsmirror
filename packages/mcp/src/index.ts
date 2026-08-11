/**
 * DocsMirror over the Model Context Protocol: a coding agent asks what
 * documentation exists instead of guessing, and reads the one section it needs.
 * @docs agents.md#working-with-ai-agents
 */

import * as nodePath from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

/**
 * The project root a launcher named, defaulting to the working directory:
 * the folder an editor starts an MCP server in is the project it opened.
 */
export function projectRootFrom(argv: readonly string[], cwd: string = process.cwd()): string {
  const named = argv.find((argument) => !argument.startsWith('-'));
  return nodePath.resolve(cwd, named ?? '.');
}

/**
 * Starts the server on stdio, the transport an editor or agent runtime spawns
 * a local server with. Resolves when the client disconnects.
 */
export async function start(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const server = createServer(projectRootFrom(argv));
  await server.connect(new StdioServerTransport());
}

export { createServer } from './server';
export { ToolFailure } from './errors';
