#!/usr/bin/env node
/**
 * Launcher for the DocsMirror language server.
 *
 * Transport selection lives in the server itself: with no argument it speaks
 * stdio, so any generic LSP client can start it as `docsmirror-lsp`.
 * @docs server.md#launching
 */
'use strict';

require('../dist/server.js').start();
