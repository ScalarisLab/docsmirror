import type { ValidationIssue } from '@docsmirror/core';

export interface ReportSummary {
  readonly scannedFiles: number;
  readonly pointerCount: number;
  readonly resolvedCount: number;
  readonly issueCount: number;
}

export interface JsonReport {
  readonly ok: boolean;
  readonly summary: ReportSummary;
  readonly issues: readonly ValidationIssue[];
}

/** Machine-readable report: `{ ok, summary, issues }`, pretty-printed. */
export function formatJson(report: JsonReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
