/**
 * Footer glyph policy for the usage widget.
 *
 * Older mintty/Cygwin builds measure emoji and ambiguous-width codepoints with
 * their own cell-width tables, which can disagree with pi's. The widget line is
 * truncated to (now) width - 1 and never padded to the edge, but a glyph the
 * terminal measures wider than expected still shifts everything after it and
 * can desync pi's differential renderer. "auto" swaps the footer glyphs for
 * ASCII on detected legacy terminals; "unicode"/"ascii" force a set.
 */

export type GlyphMode = "auto" | "unicode" | "ascii";

export interface GlyphSet {
  /** Separator between usage atoms. */
  sep: string;
  /** Reset-countdown prefix. */
  reset: string;
  /** Progress-bar fill / remainder (command output). */
  barFilled: string;
  barHollow: string;
  /** Truncation marker. */
  ellipsis: string;
}

export const UNICODE_GLYPHS: GlyphSet = { sep: "\u00b7", reset: "\u21ba", barFilled: "\u2588", barHollow: "\u2591", ellipsis: "\u2026" };
export const ASCII_GLYPHS: GlyphSet = { sep: "-", reset: "~", barFilled: "#", barHollow: "-", ellipsis: "..." };

export const GLYPH_MODES: GlyphMode[] = ["auto", "unicode", "ascii"];

/** True for terminals whose cell-width tables are known to disagree with the
 * width math in format.ts (older mintty/Cygwin builds). */
export function detectLegacyTerminal(env: NodeJS.ProcessEnv = process.env): boolean {
  const termProgram = env.TERM_PROGRAM ?? "";
  const term = env.TERM ?? "";
  return (
    termProgram === "mintty" ||
    termProgram === "cygwin" ||
    termProgram === "msys" ||
    term.startsWith("cygwin") ||
    term.startsWith("msys")
  );
}

export function resolveGlyphSet(mode: GlyphMode, env: NodeJS.ProcessEnv = process.env): GlyphSet {
  if (mode === "unicode") return UNICODE_GLYPHS;
  if (mode === "ascii") return ASCII_GLYPHS;
  return detectLegacyTerminal(env) ? ASCII_GLYPHS : UNICODE_GLYPHS;
}

/** Widget-safe variant. The widget renders inside the editor's row budget, so
 * an over-wide glyph there can desync pi's renderer; status fallback text is
 * not row-budgeted and keeps an explicit choice. */
export function resolveWidgetGlyphSet(mode: GlyphMode, env: NodeJS.ProcessEnv = process.env): GlyphSet {
  if (mode === "unicode" && detectLegacyTerminal(env)) return ASCII_GLYPHS;
  return resolveGlyphSet(mode, env);
}
