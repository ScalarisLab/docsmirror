/**
 * Failures an agent can act on.
 *
 * A tool never throws out of the server: the caller is another program, and a
 * transport-level error tells it only that something went wrong. A `ToolFailure`
 * carries the sentence that lets it retry correctly, which path was wrong, and
 * which one it probably meant.
 */

export class ToolFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolFailure';
  }
}

/** The message returned when a tool fails for a reason the server did not anticipate. */
export function unexpectedFailureMessage(tool: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return (
    `${tool} failed while reading the project: ${detail}. ` +
    'The documentation map is rebuilt from the filesystem, so this usually means a file changed or ' +
    'became unreadable mid-call; retrying the same call is safe.'
  );
}
