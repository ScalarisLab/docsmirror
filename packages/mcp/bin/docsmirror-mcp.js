#!/usr/bin/env node
/**
 * Launcher for the DocsMirror MCP server.
 *
 * It speaks stdio, the transport an editor or agent runtime spawns a local
 * server with. The optional argument is the project root to serve; with none,
 * the working directory is the project, which is how clients launch it.
 * @docs agents.md#working-with-ai-agents
 */
'use strict';

require('../dist/index.js')
  .start(process.argv.slice(2))
  .catch((error) => {
    process.stderr.write(`docsmirror-mcp: ${error && error.message ? error.message : String(error)}\n`);
    process.exit(1);
  });
