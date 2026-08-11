/** Bare ANSI colour helpers. No dependency: colour is used only when stdout is a TTY and NO_COLOR is unset. */

// Per the no-color.org convention, only a NON-empty NO_COLOR disables colour;
// `NO_COLOR=` is the documented way to opt back in for one invocation.
const ANSI_ENABLED = Boolean(process.stdout.isTTY) && !process.env['NO_COLOR'];

const ESC = '\x1b[';

const CODES = {
  red: '31',
  yellow: '33',
  dim: '2',
  bold: '1',
} as const;

function wrap(code: string, text: string): string {
  return ANSI_ENABLED ? `${ESC}${code}m${text}${ESC}0m` : text;
}

export const color = {
  error: (text: string): string => wrap(CODES.red, text),
  warning: (text: string): string => wrap(CODES.yellow, text),
  dim: (text: string): string => wrap(CODES.dim, text),
  bold: (text: string): string => wrap(CODES.bold, text),
};
