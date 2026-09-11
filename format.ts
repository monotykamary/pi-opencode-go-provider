/**
 * Terminal text helpers for the usage widget.
 *
 * Kept dependency-free (no @earendil-works/pi-tui import) so the usage logic
 * stays unit-testable with a bare Node test run and the extension keeps its
 * single devDependency.
 */

const ANSI_PATTERN = "\u001B\\[[0-?]*[ -/]*[@-~]";
const ANSI_SPLIT_REGEXP = new RegExp("(" + ANSI_PATTERN + ")");
const ANSI_TEST_REGEXP = new RegExp(ANSI_PATTERN);

export function stripAnsi(value: string): string {
  return value.replace(new RegExp(ANSI_PATTERN, "g"), "");
}

/** Approximate terminal cell width of a single code point. */
function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0) return 0;
  // Combining marks and zero-width joiners occupy no cells.
  if (code >= 0x0300 && code <= 0x036f) return 0;
  if (code === 0x200d || code === 0xfe0f) return 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

/** Visible width of a string, ignoring ANSI escape sequences. */
export function visibleWidth(value: string): number {
  let width = 0;
  for (const char of stripAnsi(value)) width += charWidth(char);
  return width;
}

/**
 * Slice a possibly-colored string to a terminal width, appending an ellipsis.
 * ANSI sequences before the cut are preserved and a reset is emitted so the
 * ellipsis (and anything after it) keeps the caller's own styling.
 */
export function truncateToWidth(value: string, width: number, ellipsis = "\u2026"): string {
  if (width <= 0) return "";
  if (visibleWidth(value) <= width) return value;
  const budget = Math.max(0, width - visibleWidth(ellipsis));
  const tokens = value.split(ANSI_SPLIT_REGEXP);
  let result = "";
  let used = 0;
  let truncated = false;
  for (const token of tokens) {
    if (token === "") continue;
    if (ANSI_TEST_REGEXP.test(token)) {
      result += token;
      continue;
    }
    for (const char of token) {
      const cellWidth = charWidth(char);
      if (used + cellWidth > budget) {
        truncated = true;
        break;
      }
      result += char;
      used += cellWidth;
    }
    if (truncated) break;
  }
  const reset = ANSI_TEST_REGEXP.test(value) ? "\u001B[0m" : "";
  return result + reset + ellipsis;
}

/** Collapse whitespace so a multi-segment line survives a one-line status bar. */
export function sanitizeStatusText(text: string): string {
  return text.replace(/[ \r\n\t]+/g, " ").trim();
}
