/**
 * Editor settings, read from the `docsmirror` configuration section.
 *
 * Settings are a thin override layer: whatever they set wins over
 * `docsmirror.config.json`, and whatever they leave out keeps the file's value.
 * @docs server.md#settings
 */

import type { StalenessOptions } from '@docsmirror/core';

export interface DocsMirrorSettings {
  /** Docs root, relative to the workspace folder. Overrides the config file. */
  readonly docsRoot: string | undefined;
  readonly staleness: Partial<StalenessOptions>;
  readonly inlayHints: { readonly enabled: boolean };
  readonly diagnostics: { readonly enabled: boolean };
}

/** The section name the client is asked to send, and the one it must watch. */
export const SETTINGS_SECTION = 'docsmirror';

export const DEFAULT_SETTINGS: DocsMirrorSettings = {
  docsRoot: undefined,
  staleness: {},
  inlayHints: { enabled: true },
  diagnostics: { enabled: true },
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function booleanAt(source: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = source?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function positiveNumberAt(source: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Reads whatever the client sent for the `docsmirror` section. Unknown fields
 * and wrong types are ignored rather than rejected: a language server that
 * refuses to start over a typo in a settings file is a broken editor.
 */
export function parseSettings(value: unknown): DocsMirrorSettings {
  const raw = asRecord(value);
  if (raw === undefined) {
    return DEFAULT_SETTINGS;
  }

  const staleness = asRecord(raw['staleness']);
  const agingAfterDays = positiveNumberAt(staleness, 'agingAfterDays');
  const staleAfterDays = positiveNumberAt(staleness, 'staleAfterDays');
  const docsRoot = raw['docsRoot'];

  return {
    docsRoot: typeof docsRoot === 'string' && docsRoot.trim().length > 0 ? docsRoot.trim() : undefined,
    staleness: {
      ...(agingAfterDays === undefined ? {} : { agingAfterDays }),
      ...(staleAfterDays === undefined ? {} : { staleAfterDays }),
    },
    inlayHints: { enabled: booleanAt(asRecord(raw['inlayHints']), 'enabled', DEFAULT_SETTINGS.inlayHints.enabled) },
    diagnostics: { enabled: booleanAt(asRecord(raw['diagnostics']), 'enabled', DEFAULT_SETTINGS.diagnostics.enabled) },
  };
}
