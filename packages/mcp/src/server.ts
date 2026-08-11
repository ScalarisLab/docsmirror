/**
 * The Model Context Protocol surface: tools an agent calls, and documents it
 * can attach as resources.
 *
 * This module is wiring only. Every answer comes from `@scalarislab/docsmirror-core`
 * through a project snapshot, so an agent, an editor and a CI run describe the
 * same documentation surface.
 * @docs agents.md#working-with-ai-agents
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolFailure, unexpectedFailureMessage } from './errors';
import { DocsProject } from './project/DocsProject';
import { documentResources, MARKDOWN_MIME_TYPE, readResource } from './resources/documents';
import { toolNamed, TOOLS } from './tools';

const SERVER_NAME = 'docsmirror';
// The version has one source of truth: package.json. dist/server.js sits one
// directory below it, in the repository and in the packed tarball alike.
const SERVER_VERSION = (require('../package.json') as { version: string }).version;

/**
 * What the client tells the model about this server before any call. It states
 * the one habit that makes the rest pay off: map first, then read one section.
 */
const INSTRUCTIONS =
  'This project documents itself with DocsMirror: source comments stay one line long and carry a ' +
  '`@docs <path>#<anchor>` pointer at the document that justifies them, where the path is relative to ' +
  'the project\'s docs root. Call `list_documentation` once to learn what documentation exists, then ' +
  '`read_documentation` for the single section a task actually needs, do not read the documentation ' +
  'tree upfront. When you meet a `@docs` pointer in code, resolve it with `read_documentation` instead ' +
  'of guessing the path, and when you need the code behind a documented decision, call ' +
  '`find_references`.';

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Builds the server for one project root. The manifest is built on first use. */
export function createServer(projectRoot: string): Server {
  const project = new DocsProject(projectRoot);
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name } = request.params;
    const tool = toolNamed(name);
    if (tool === undefined) {
      return errorResult(
        `No tool named \`${name}\` on this server. Available tools: ${TOOLS.map((each) => `\`${each.name}\``).join(', ')}.`,
      );
    }
    try {
      const snapshot = await project.current();
      return textResult(await tool.run(request.params.arguments ?? {}, snapshot));
    } catch (error) {
      return errorResult(
        error instanceof ToolFailure ? error.message : unexpectedFailureMessage(name, error),
      );
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const snapshot = await project.current();
    return {
      resources: documentResources(snapshot).map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        title: resource.title,
        mimeType: resource.mimeType,
        ...(resource.description === undefined ? {} : { description: resource.description }),
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const snapshot = await project.current();
    const text = await readResource(snapshot, request.params.uri);
    return {
      contents: [{ uri: request.params.uri, mimeType: MARKDOWN_MIME_TYPE, text }],
    };
  });

  return server;
}
