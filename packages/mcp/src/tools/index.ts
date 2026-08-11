/** The tools this server exposes, in the order an agent would use them. */

import { findReferences } from './findReferences';
import { getManifest } from './getManifest';
import { listDocumentation } from './listDocumentation';
import { readDocumentation } from './readDocumentation';
import { searchDocumentation } from './searchDocumentation';
import type { ToolDefinition } from './types';

export const TOOLS: readonly ToolDefinition[] = [
  listDocumentation,
  searchDocumentation,
  readDocumentation,
  findReferences,
  getManifest,
];

export function toolNamed(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}
