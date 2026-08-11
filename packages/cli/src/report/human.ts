import type { ValidationIssue } from '@scalarislab/docsmirror-core';
import { color } from './color';
import type { ReportSummary } from './json';

export interface HumanReportOptions {
  readonly issues: readonly ValidationIssue[];
  readonly summary: ReportSummary;
  readonly quiet: boolean;
  /** One line of context (project/docs root) printed before issues, suppressed in quiet mode. */
  readonly context: string | undefined;
}

function severityLabel(issue: ValidationIssue): string {
  return issue.severity === 'error' ? color.error('error') : color.warning('warning');
}

/**
 * A suggestion for a near-miss anchor is a question; anything else is an
 * instruction, and dressing it as "Did you mean …?" reads as nonsense.
 */
function suggestionText(issue: ValidationIssue): string {
  if (issue.suggestion === undefined) {
    return '';
  }
  return issue.kind === 'anchor-not-found' || issue.kind === 'file-not-found'
    ? ` Did you mean \`${issue.suggestion}\`?`
    : ` ${issue.suggestion}`;
}

function issueLine(issue: ValidationIssue): string {
  const position = issue.range === undefined ? '' : `${issue.range.line}:${issue.range.column}  `;
  return `  ${position}${severityLabel(issue)}  ${issue.message}${suggestionText(issue)}`;
}

export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function summaryLine(summary: ReportSummary): string {
  return (
    `${pluralize(summary.scannedFiles, 'file')} scanned, ` +
    `${pluralize(summary.pointerCount, 'pointer')} found, ` +
    `${summary.resolvedCount} resolved, ` +
    `${pluralize(summary.issueCount, 'issue')}.`
  );
}

/** Groups issues by file and renders one indented line per issue. */
export function formatHuman(options: HumanReportOptions): string {
  const { issues, summary, quiet, context } = options;
  const lines: string[] = [];

  if (!quiet && context !== undefined) {
    lines.push(color.dim(context), '');
  }

  const byFile = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const bucket = byFile.get(issue.file);
    if (bucket === undefined) {
      byFile.set(issue.file, [issue]);
    } else {
      bucket.push(issue);
    }
  }
  for (const [file, fileIssues] of byFile) {
    lines.push(color.bold(file));
    for (const issue of fileIssues) {
      lines.push(issueLine(issue));
    }
  }

  if (lines.length > 0) {
    lines.push('');
  }
  lines.push(summaryLine(summary));

  return `${lines.join('\n')}\n`;
}
