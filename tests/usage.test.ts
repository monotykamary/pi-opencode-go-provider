import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatBankedResetsSuffix,
  formatBar,
  formatCountdown,
  formatPercent,
  formatResetClock,
  formatUsageDetail,
  formatUsageLine,
  parseResetAt,
  parseUsageSnapshot,
  severityForWindow,
  usageHttpErrorMessage,
  usageSegments,
  type UsageSnapshot,
} from "../usage.ts";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;
// Localized clock: "3:14 PM" or "15:14", optionally prefixed with a weekday.
const CLOCK = /(?:\S+ )?\d{1,2}:\d{2}(?:\s?[AP]M)?/;
// Long-window clock always carries a weekday and a date: "Tue 9/15 10:42 AM".
const DATE_CLOCK = /\S+ \d{1,2}\/\d{1,2} \d{1,2}:\d{2}(?:\s?[AP]M)?/;

function payloadWith(usage: Record<string, unknown>): unknown {
  return { usage };
}

/** Build a snapshot through the real parser so fixtures cannot drift. */
function snapshotWith(
  used: Record<string, number>,
  statuses: Record<string, string> = {},
): UsageSnapshot {
  const usage: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(used)) {
    usage[key] = { status: statuses[key] ?? "ok", percent: value, resetsAt: null };
  }
  const snapshot = parseUsageSnapshot(payloadWith(usage), NOW);
  assert.ok(snapshot);
  return snapshot;
}

test("parses the live usage shape into three labeled windows", () => {
  const snapshot = parseUsageSnapshot(
    payloadWith({
      rolling: { status: "ok", percent: 63, resetsAt: new Date(NOW + 2 * HOUR).toISOString() },
      weekly: { status: "ok", percent: 41, resetsAt: new Date(NOW + 5 * DAY).toISOString() },
      monthly: { status: "ok", percent: 12, resetsAt: new Date(NOW + 23 * DAY).toISOString() },
    }),
    NOW,
  );

  assert.ok(snapshot);
  assert.deepEqual(
    snapshot.windows.map((w) => [w.key, w.label, w.usedPercent, w.remainingPercent, w.status]),
    [
      ["rolling", "5h", 63, 37, "ok"],
      ["weekly", "7d", 41, 59, "ok"],
      ["monthly", "30d", 12, 88, "ok"],
    ],
  );
  assert.equal(snapshot.windows[0]!.resetsAt, NOW + 2 * HOUR);
  assert.equal(snapshot.isLimited, false);
  assert.equal(snapshot.bankedResets, null);
});

test("flags rate-limited windows", () => {
  const snapshot = parseUsageSnapshot(
    payloadWith({
      rolling: { status: "rate-limited", percent: 100, resetsAt: new Date(NOW + HOUR).toISOString() },
      weekly: { status: "ok", percent: 20, resetsAt: null },
    }),
    NOW,
  );
  assert.ok(snapshot);
  assert.equal(snapshot.isLimited, true);
  assert.equal(snapshot.windows.length, 2);
  assert.equal(snapshot.windows[0]!.remainingPercent, 0);
  assert.equal(snapshot.windows[1]!.resetsAt, null);
});

test("ignores malformed windows and rejects payloads without usable data", () => {
  assert.equal(parseUsageSnapshot(undefined, NOW), undefined);
  assert.equal(parseUsageSnapshot({}, NOW), undefined);
  assert.equal(parseUsageSnapshot({ usage: {} }, NOW), undefined);
  assert.equal(parseUsageSnapshot({ usage: { rolling: { status: "ok" } } }, NOW), undefined);
  assert.equal(parseUsageSnapshot({ rollingUsage: { usagePercent: 5 } }, NOW), undefined);

  const partial = parseUsageSnapshot(
    payloadWith({
      rolling: { status: "ok", percent: 10, resetsAt: "not-a-date" },
      weekly: { status: "weird", percent: "25" },
      monthly: null,
    }),
    NOW,
  );
  assert.ok(partial);
  assert.equal(partial.windows.length, 2);
  assert.equal(partial.windows[0]!.resetsAt, null);
  assert.equal(partial.windows[1]!.status, "unknown");
  assert.equal(partial.windows[1]!.usedPercent, 25);
  assert.equal(partial.windows[1]!.remainingPercent, 75);
});

test("clamps out-of-range percents", () => {
  const snapshot = parseUsageSnapshot(
    payloadWith({
      rolling: { status: "ok", percent: 140 },
      weekly: { status: "ok", percent: -20 },
    }),
    NOW,
  );
  assert.ok(snapshot);
  assert.equal(snapshot.windows[0]!.usedPercent, 100);
  assert.equal(snapshot.windows[0]!.remainingPercent, 0);
  assert.equal(snapshot.windows[1]!.usedPercent, 0);
  assert.equal(snapshot.windows[1]!.remainingPercent, 100);
});

test("parses ISO strings, epoch seconds and epoch milliseconds", () => {
  assert.equal(parseResetAt("2026-09-11T14:00:00.000Z"), Date.parse("2026-09-11T14:00:00.000Z"));
  assert.equal(parseResetAt("1789137600"), 1_789_137_600_000);
  assert.equal(parseResetAt(1_789_137_600_000), 1_789_137_600_000);
  assert.equal(parseResetAt("nope"), null);
  assert.equal(parseResetAt(null), null);
  assert.equal(parseResetAt(Number.NaN), null);
});

test("formats the widget line with remaining budget and reset countdowns", () => {
  const snapshot = parseUsageSnapshot(
    payloadWith({
      rolling: { status: "ok", percent: 37, resetsAt: new Date(NOW + 2 * HOUR + 14 * 60_000).toISOString() },
      weekly: { status: "ok", percent: 59, resetsAt: new Date(NOW + 5 * DAY + 3 * HOUR).toISOString() },
      monthly: { status: "rate-limited", percent: 100, resetsAt: new Date(NOW + 23 * DAY + 4 * HOUR).toISOString() },
    }),
    NOW,
  );
  assert.ok(snapshot);

  assert.equal(
    formatUsageLine(snapshot, { showResetTimes: true }, NOW),
    "Usage: 5h: 63% · 7d: 41% · 30d: 0% · 5h ↺ 2h14m · 7d ↺ 5d3h · 30d ↺ 23d4h",
  );
  assert.equal(
    formatUsageLine(snapshot, { showResetTimes: false }, NOW),
    "Usage: 5h: 63% · 7d: 41% · 30d: 0%",
  );
});

test("uses the singular label only when a single window is reported", () => {
  const snapshot = parseUsageSnapshot(
    payloadWith({ weekly: { status: "ok", percent: 77, resetsAt: new Date(NOW + 3 * DAY + 20 * HOUR).toISOString() } }),
    NOW,
  );
  assert.ok(snapshot);
  assert.equal(
    formatUsageLine(snapshot, { showResetTimes: true }, NOW),
    "Usage: 7d: 23% · ↺ 3d20h",
  );
});

test("appends banked resets only when the API reports them", () => {
  const withResets = parseUsageSnapshot(
    payloadWith({ rolling: { status: "ok", percent: 10, resetsAt: null }, bankedResets: 3 }),
    NOW,
  );
  assert.ok(withResets);
  assert.equal(withResets.bankedResets, 3);
  assert.equal(
    formatUsageLine(withResets, { showResetTimes: false }, NOW),
    "Usage: 5h: 90% · 3 banked resets",
  );
  assert.equal(
    formatUsageLine(withResets, { showResetTimes: false, showBankedResets: false }, NOW),
    "Usage: 5h: 90%",
  );
  assert.equal(formatBankedResetsSuffix(1), "1 banked reset");
  assert.equal(formatBankedResetsSuffix(0), null);
  assert.equal(formatBankedResetsSuffix(-2), null);
  assert.equal(formatBankedResetsSuffix(null), null);
  assert.equal(formatUsageLine(snapshotWith({ rolling: 10 }), { showResetTimes: false }, NOW), "Usage: 5h: 90%");
});

test("colours the line by how much budget is left", () => {
  assert.equal(severityForWindow(snapshotWith({ rolling: 69 }).windows[0]!), "ok");
  assert.equal(severityForWindow(snapshotWith({ rolling: 70 }).windows[0]!), "warning");
  assert.equal(severityForWindow(snapshotWith({ rolling: 90 }).windows[0]!), "critical");
  assert.equal(
    severityForWindow(snapshotWith({ rolling: 1 }, { rolling: "rate-limited" }).windows[0]!),
    "critical",
  );
});

test("splits the widget line into severity-tagged segments", () => {
  const segments = usageSegments(snapshotWith({ rolling: 37, weekly: 70 }), { showResetTimes: false }, NOW);
  assert.deepEqual(segments, [
    { text: "Usage: ", severity: "muted" },
    { text: "5h: ", severity: "muted" },
    { text: "63%", severity: "ok" },
    { text: " · ", severity: "muted" },
    { text: "7d: ", severity: "muted" },
    { text: "30%", severity: "warning" },
  ]);
});

test("formats countdowns, percentages and reset clocks", () => {
  assert.equal(formatCountdown(0), "now");
  assert.equal(formatCountdown(45_000), "45s");
  assert.equal(formatCountdown(5 * 60_000), "5m");
  assert.equal(formatCountdown(2 * HOUR + 14 * 60_000), "2h14m");
  assert.equal(formatCountdown(5 * DAY + 3 * HOUR), "5d3h");
  assert.equal(formatCountdown(-1000), "now");
  assert.equal(formatPercent(63.6), "64%");
  assert.equal(formatPercent(120), "100%");

  const soon = NOW + 2 * HOUR + 14 * 60_000;
  assert.match(formatResetClock(soon, { includeDate: false }, NOW) ?? "", CLOCK);
  const far = NOW + 5 * DAY + 3 * HOUR;
  assert.match(formatResetClock(far, { includeDate: true }, NOW) ?? "", DATE_CLOCK);
  assert.equal(formatResetClock(far, { includeDate: true }, NOW)?.includes("/"), true);
  assert.equal(formatResetClock(Number.NaN, undefined, NOW), null);
});

test("renders the detailed breakdown with remaining bars", () => {
  const snapshot = parseUsageSnapshot(
    payloadWith({ rolling: { status: "ok", percent: 50, resetsAt: new Date(NOW + HOUR).toISOString() } }),
    NOW,
  );
  assert.ok(snapshot);
  const [line] = formatUsageDetail(snapshot, NOW);
  assert.ok(line);
  assert.match(line, /^5h  █{10}░{10}  50% left  ↺ 1h0m - (?:\S+ )?\d{1,2}:\d{2}(?:\s?[AP]M)?$/);

  const limited = snapshotWith({ monthly: 100 }, { monthly: "rate-limited" });
  const [limitedLine] = formatUsageDetail(limited, NOW);
  assert.ok(limitedLine);
  assert.match(limitedLine, /^30d ░{20}   0% left {2}RATE LIMITED$/);
  assert.equal(formatBar(0), "░".repeat(20));
  assert.equal(formatBar(100), "█".repeat(20));
});

test("turns HTTP failures into actionable messages", () => {
  const auth = { error: { type: "AuthError", message: "Missing API key." } };
  assert.equal(
    usageHttpErrorMessage(401, auth),
    "OpenCode Go rejected the API key (401): Missing API key.",
  );
  assert.equal(
    usageHttpErrorMessage(403, { error: { message: "OpenCode Go subscription required." } }),
    "This key has no OpenCode Go subscription (403): OpenCode Go subscription required.",
  );
  assert.equal(usageHttpErrorMessage(500, null), "OpenCode Go usage request failed (500).");
});
