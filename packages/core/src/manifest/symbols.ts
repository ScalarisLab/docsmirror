/**
 * Naming the code a pointer sits above.
 *
 * This is a heuristic and is documented as one: DocsMirror scans comments, not
 * an abstract syntax tree, so it reads the first line of code after the comment
 * and recognises the shape of a declaration. A name it cannot place is left
 * `undefined`, the file and line are always exact, and a wrong name would be
 * worse than none.
 * @docs manifest.md#code-references
 */

const DECLARATION_PATTERNS: readonly RegExp[] = [
  /\b(?:class|interface|struct|enum|trait|record|protocol|module|namespace|type)\s+([A-Za-z_$][\w$]*)/,
  /\b(?:function|func|fn|def|sub|proc|method)\s+\*?\s*([A-Za-z_$][\w$]*)/,
  /\b(?:const|let|var|val|readonly|static|public|private|protected)\s+(?:[A-Za-z_$][\w$]*\s+)*?([A-Za-z_$][\w$]*)\s*[=:(]/,
  /^\s*(?:export\s+)?(?:default\s+)?([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s*(?:[A-Za-z_$][\w$]*\s+)*?([A-Za-z_$][\w$]*)\s*\(/,
];

/** Modifiers that are never the name of the thing being declared. */
const NOT_A_NAME = new Set([
  'export', 'default', 'async', 'await', 'public', 'private', 'protected', 'static', 'final',
  'abstract', 'override', 'return', 'if', 'for', 'while', 'switch', 'catch', 'const', 'let',
  'var', 'new', 'throw', 'yield', 'declare', 'pub', 'impl', 'unsafe', 'extern', 'inline',
]);

const COMMENT_START = /^\s*(?:\/\/|\/\*|\*|#|--|;|%|<!--)/;
const DECORATOR = /^\s*(?:@|\[\[|#\[)/;

/**
 * The name of the declaration a comment block introduces, read from the first
 * line of code following it.
 */
export function symbolAfterComment(lines: readonly string[], commentEndLine: number): string | undefined {
  for (let index = commentEndLine + 1; index < lines.length && index <= commentEndLine + 4; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim().length === 0 || DECORATOR.test(line)) {
      continue;
    }
    if (COMMENT_START.test(line)) {
      return undefined;
    }
    for (const pattern of DECLARATION_PATTERNS) {
      const name = pattern.exec(line)?.[1];
      if (name !== undefined && !NOT_A_NAME.has(name)) {
        return name;
      }
    }
    return undefined;
  }
  return undefined;
}
