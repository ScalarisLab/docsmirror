/**
 * What a tool is, on this server: a name, the description an agent reads to
 * decide whether to call it, the schema of its arguments, and a run function
 * answering from one snapshot of the project.
 */

import type { ProjectSnapshot } from '../project/ProjectSnapshot';
import type { ToolArguments } from './args';

/** The subset of JSON Schema the Model Context Protocol expects for tool inputs. */
export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Record<string, unknown>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

export interface ToolDefinition {
  readonly name: string;
  /** Short human-facing label, shown by clients that list tools to a user. */
  readonly title: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  /** Returns the text handed back to the caller. Failures throw `ToolFailure`. */
  run(args: ToolArguments, snapshot: ProjectSnapshot): Promise<string>;
}

/** Tool payloads are JSON, indented: agents read them, and diffs of them. */
export function asJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
