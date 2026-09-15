/**
 * Glyph policy: legacy terminals (mintty/Cygwin) get an ASCII footer so an
 * over-wide glyph cannot shift the widget line and desync pi's renderer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_USAGE_CONFIG } from "../config.ts";
import { ASCII_GLYPHS, UNICODE_GLYPHS, detectLegacyTerminal, resolveGlyphSet, resolveWidgetGlyphSet } from "../glyphs.ts";
import { formatBar, usageSegments } from "../usage.ts";
import { truncateToWidth } from "../format.ts";

const mintty = { TERM_PROGRAM: "mintty", TERM: "xterm" } as NodeJS.ProcessEnv;
const cygwin = { TERM: "cygwin" } as NodeJS.ProcessEnv;
const wt = { TERM_PROGRAM: "Windows_Terminal", TERM: "xterm-256color" } as NodeJS.ProcessEnv;
const isAscii = (value: string) => [...value].every((char) => char.charCodeAt(0) < 128);

test("detects legacy terminals", () => {
  assert.equal(detectLegacyTerminal(mintty), true);
  assert.equal(detectLegacyTerminal(cygwin), true);
  assert.equal(detectLegacyTerminal(wt), false);
  assert.equal(detectLegacyTerminal({} as NodeJS.ProcessEnv), false);
});

test("auto degrades on legacy terminals; explicit modes win for the status line", () => {
  assert.equal(resolveGlyphSet("auto", mintty), ASCII_GLYPHS);
  assert.equal(resolveGlyphSet("auto", wt), UNICODE_GLYPHS);
  assert.equal(resolveGlyphSet("unicode", mintty), UNICODE_GLYPHS);
  assert.equal(resolveGlyphSet("ascii", wt), ASCII_GLYPHS);
});

test("widget content clamps an explicit unicode choice on legacy terminals", () => {
  assert.equal(resolveWidgetGlyphSet("unicode", mintty), ASCII_GLYPHS);
  assert.equal(resolveWidgetGlyphSet("unicode", wt), UNICODE_GLYPHS);
  assert.equal(resolveWidgetGlyphSet("auto", mintty), ASCII_GLYPHS);
  assert.equal(resolveWidgetGlyphSet("ascii", wt), ASCII_GLYPHS);
});

test("the default config is auto", () => {
  assert.equal(DEFAULT_USAGE_CONFIG.glyphs, "auto");
});

test("the ASCII set is pure ASCII and renders an ASCII usage line", () => {
  assert.equal(isAscii(Object.values(ASCII_GLYPHS).join("")), true);
  assert.equal(isAscii(Object.values(UNICODE_GLYPHS).join("")), false);

  const snapshot = {
    bankedResets: null,
    windows: [
      { key: "rolling" as const, label: "5h", remainingPercent: 63, status: "ok" as const, resetsAt: Date.now() + 3_600_000, limitUsd: null },
      { key: "weekly" as const, label: "7d", remainingPercent: 41, status: "ok" as const, resetsAt: Date.now() + 86_400_000, limitUsd: null },
    ],
  };
  const asciiLine = usageSegments(snapshot, { showResetTimes: true, glyphs: ASCII_GLYPHS }, 0)
    .map((segment) => segment.text)
    .join("");
  const unicodeLine = usageSegments(snapshot, { showResetTimes: true }, 0)
    .map((segment) => segment.text)
    .join("");
  assert.equal(isAscii(asciiLine), true);
  assert.equal(asciiLine.includes("5h: 63% - 7d: 41%"), true);
  assert.equal(unicodeLine.includes("\u00b7"), true);
  assert.equal(unicodeLine.includes("\u21ba"), true);
});

test("bars and truncation take the ASCII glyphs too", () => {
  assert.equal(formatBar(50, 4, ASCII_GLYPHS), "##--");
  assert.equal(formatBar(50, 4), "\u2588\u2588\u2591\u2591");
  const cut = truncateToWidth("abcdefghij", 5, ASCII_GLYPHS.ellipsis);
  assert.equal(cut, "ab...");
  assert.equal(isAscii(cut), true);
});
