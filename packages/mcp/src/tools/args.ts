/**
 * Argument reading for tool calls.
 *
 * The JSON schema advertised with each tool states the contract; this checks it
 * again on arrival, because a client is free to send anything and a wrong type
 * must come back as an instruction, not as a crash.
 */

import { ToolFailure } from '../errors';

export type ToolArguments = Record<string, unknown>;

export function requiredString(args: ToolArguments, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ToolFailure(`\`${name}\` is required and must be a non-empty string.`);
  }
  return value;
}

export function optionalString(args: ToolArguments, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ToolFailure(`\`${name}\` must be a string when given.`);
  }
  return value;
}

export function optionalInteger(
  args: ToolArguments,
  name: string,
  bounds: { readonly min: number; readonly max: number },
): number | undefined {
  const value = args[name];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ToolFailure(`\`${name}\` must be a whole number when given.`);
  }
  if (value < bounds.min || value > bounds.max) {
    throw new ToolFailure(`\`${name}\` must be between ${bounds.min} and ${bounds.max}.`);
  }
  return value;
}
