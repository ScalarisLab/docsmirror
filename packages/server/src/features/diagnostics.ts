/**
 * Diagnostics: the mechanism that keeps pointers honest while the code moves.
 *
 * The rules come from core's `validateSource`, so the editor and
 * `docsmirror check` never disagree about what is broken. Severity stops at a
 * warning on purpose: a documentation pointer that rotted is worth seeing, and
 * is never worth being mistaken for a compile error.
 * @docs server.md#diagnostics
 */

import { CONFIG_FILE_NAME, validateSource, type IssueSeverity, type ValidationIssue } from '@scalarislab/docsmirror-core';
import { DiagnosticSeverity, Range, type Diagnostic } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Workspace } from '../workspace/Workspace';
import { relativePosix, uriToPath } from '../workspace/paths';

export const DIAGNOSTIC_SOURCE = 'docsmirror';

const SEVERITIES: Record<IssueSeverity, DiagnosticSeverity> = {
  error: DiagnosticSeverity.Warning,
  warning: DiagnosticSeverity.Information,
};

function messageOf(issue: ValidationIssue): string {
  return issue.suggestion === undefined ? issue.message : `${issue.message} Did you mean \`${issue.suggestion}\`?`;
}

function toDiagnostic(issue: ValidationIssue): Diagnostic | undefined {
  if (issue.range === undefined) {
    return undefined;
  }
  return {
    range: Range.create(issue.range.line, issue.range.column, issue.range.line, issue.range.endColumn),
    severity: SEVERITIES[issue.severity],
    code: issue.kind,
    source: DIAGNOSTIC_SOURCE,
    message: messageOf(issue),
  };
}

/**
 * The one thing worth saying when there is no documentation folder to resolve
 * against. "This document does not exist", repeated once per pointer, describes
 * the file as broken when it is the tool that is lost; a reader who trusts that
 * once and finds it false stops reading the warnings for good.
 */
function noDocsRootDiagnostic(issues: readonly ValidationIssue[], workspace: Workspace): Diagnostic[] {
  const first = issues.find((issue) => issue.range !== undefined)?.range;
  if (first === undefined) {
    return [];
  }
  return [
    {
      range: Range.create(first.line, first.column, first.line, first.endColumn),
      severity: DiagnosticSeverity.Warning,
      code: 'docs-root-not-found',
      source: DIAGNOSTIC_SOURCE,
      message:
        `DocsMirror found no docs root for this file, so no pointer in it can be checked. ` +
        `It looked for \`${workspace.config.docsRoot}\` in \`${workspace.rootPath}\`. ` +
        `Point \`docsmirror.docsRoot\` at the right folder, or add a \`${CONFIG_FILE_NAME}\` ` +
        `to the project this file belongs to.`,
    },
  ];
}

/**
 * Every problem in one document. Returns an empty array, never `undefined`,
 * because publishing an empty list is how a fixed pointer clears its warning.
 */
export async function diagnosticsFor(document: TextDocument, workspace: Workspace): Promise<Diagnostic[]> {
  const filePath = uriToPath(document.uri);
  if (filePath !== undefined && !workspace.scansSource(filePath)) {
    return [];
  }
  const reportedPath = (filePath === undefined ? undefined : relativePosix(workspace.rootPath, filePath)) ?? document.uri;
  const { issues } = await validateSource({ path: reportedPath, text: document.getText() }, workspace.resolver);
  if (!workspace.docsRootExists) {
    return noDocsRootDiagnostic(issues, workspace);
  }
  return issues.map(toDiagnostic).filter((diagnostic): diagnostic is Diagnostic => diagnostic !== undefined);
}
