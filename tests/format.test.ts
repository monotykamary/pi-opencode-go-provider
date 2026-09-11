import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeStatusText, stripAnsi, truncateToWidth, visibleWidth } from "../format.ts";

const RED = "[31m";
const RESET = "[0m";

test("measures visible width without ANSI escapes", () => {
  assert.equal(visibleWidth("abc"), 3);
  assert.equal(visibleWidth(`${RED}abc${RESET}`), 3);
  assert.equal(visibleWidth(""), 0);
});

test("strips ANSI escapes", () => {
  assert.equal(stripAnsi(`${RED}abc${RESET}`), "abc");
});

test("truncates to a width with an ellipsis", () => {
  assert.equal(truncateToWidth("abcdef", 10), "abcdef");
  assert.equal(truncateToWidth("abcdef", 4), "abc…");
  assert.equal(truncateToWidth("abcdef", 0), "");
  assert.equal(truncateToWidth("abcdef", 4, "..."), "a...");
});

test("truncation keeps colour codes and stays within the width", () => {
  const colored = `${RED}abcdef${RESET}`;
  const cut = truncateToWidth(colored, 4);
  assert.equal(cut.includes(RED), true);
  assert.equal(visibleWidth(cut), 4);
  assert.equal(stripAnsi(cut), "abc…");
});

test("collapses whitespace for the status bar", () => {
  assert.equal(sanitizeStatusText("  a  \n  b \t c "), "a b c");
});
