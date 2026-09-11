import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatBar,
  formatCountdown,
  formatPercent,
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

function payloadWith(usage: Record<string, unknown>): unknown {
  return { usage };
}

function snapshotWith(percent: Record<string, number>, statuses: Record<string, string> = {}): UsageSnapshot {
  const windows = Object.entries(percent).map(([key, value]) => ({
    key: key as "rolling" | "weekly" | "monthly",
    label: key === "rolling" ? "5h" : key === "weekly" ? "7d" : "30d",
    status: (statuses[key] ?? "ok") as "ok" | "rate-limited" | "unknown",
    usedPercent: value,
    resetsAt: null,
  }));
  return {
    capturedAt: NOW,
    windows,
    isLimited: windows.some((w) => w.status === "rate-limited"),
  };
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
    snapshot.windows.map((w) => [w.key, w.label, w.usedPercent, w.status]),
    [
      ["rolling", "5h", 63, "ok"],
      ["weekly", "7d", 41, "ok"],
      ["monthly", "30d", 12, "ok"],
    ],
  );
  assert.equal(snapshot.windows[0]!.resetsAt, NOW + 2 * HOUR);
  assert.equal(snapshot.isLimited, false);
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
  assert.equal(snapshot.windows[1]!.usedPercent, 0);
});

test("parses ISO strings, epoch seconds and epoch milliseconds", () => {
  assert.equal(parseResetAt("2026-09-11T14:00:00.000Z"), Date.parse("2026-09-11T14:00:00.000Z"));
  assert.equal(parseResetAt("1789137600"), 1_789_137_600_000);
  assert.equal(parseResetAt(1_789_137_600_000), 1_789_137_600_000);
  assert.equal(parseResetAt("nope"), null);
  assert.equal(parseResetAt(null), null);
  assert.equal(parseResetAt(Number.NaN), null);
});

test("formats the one-line widget with used percentages and reset countdowns", () => {
  const snapshot = parseUsageSnapshot(
    payloadWith({
      rolling: { status: "ok", percent: 63, resetsAt: new Date(NOW + 2 * HOUR + 14 * 60_000).toISOString() },
      weekly: { status: "ok", percent: 41, resetsAt: new Date(NOW + 5 * DAY + 3 * HOUR).toISOString() },
      monthly: { status: "rate-limited", percent: 100, resetsAt: new Date(NOW + 23 * DAY + 4 * HOUR).toISOString() },
    }),
    NOW,
  );
  assert.ok(snapshot);

  assert.equal(
    formatUsageLine(snapshot, { showResetTimes: true }, NOW),
    "OpenCode Go · 5h 63% used ↺2h14m · 7d 41% used ↺5d3h · 30d LIMIT ↺23d4h",
  );
  assert.equal(
    formatUsageLine(snapshot, { showResetTimes: false }, NOW),
    "OpenCode Go · 5h 63% used · 7d 41% used · 30d LIMIT",
  );
});

test("colours the same percentage differently as the budget drains", () => {
  assert.equal(severityForWindow(snapshotWith({ rolling: 69 }).windows[0]!), "ok");
  assert.equal(severityForWindow(snapshotWith({ rolling: 70 }).windows[0]!), "warning");
  assert.equal(severityForWindow(snapshotWith({ rolling: 90 }).windows[0]!), "critical");
  assert.equal(
    severityForWindow(snapshotWith({ rolling: 1 }, { rolling: "rate-limited" }).windows[0]!),
    "critical",
  );
});

test("splits the widget line into severity-tagged segments", () => {
  const segments = usageSegments(snapshotWith({ rolling: 63, weekly: 72 }), { showResetTimes: false }, NOW);
  assert.deepEqual(segments, [
    { text: "OpenCode Go", severity: "muted" },
    { text: " · ", severity: "muted" },
    { text: "5h ", severity: "muted" },
    { text: "63% used", severity: "ok" },
    { text: " · ", severity: "muted" },
    { text: "7d ", severity: "muted" },
    { text: "72% used", severity: "warning" },
  ]);
});

test("formats countdowns and percentages", () => {
  assert.equal(formatCountdown(0), "now");
  assert.equal(formatCountdown(45_000), "45s");
  assert.equal(formatCountdown(5 * 60_000), "5m");
  assert.equal(formatCountdown(2 * HOUR + 14 * 60_000), "2h14m");
  assert.equal(formatCountdown(5 * DAY + 3 * HOUR), "5d3h");
  assert.equal(formatCountdown(-1000), "now");
  assert.equal(formatPercent(63.6), "64%");
  assert.equal(formatPercent(120), "100%");
});

test("renders the detailed breakdown with bars", () => {
  const snapshot = parseUsageSnapshot(
    payloadWith({ rolling: { status: "ok", percent: 50, resetsAt: new Date(NOW + HOUR).toISOString() } }),
    NOW,
  );
  assert.ok(snapshot);
  const [line] = formatUsageDetail(snapshot, NOW);
  assert.ok(line);
  assert.equal(
    line.startsWith(`5h  ${"█".repeat(10)}${"░".repeat(10)}  50% used  ↺ 1h0m (`),
    true,
  );
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
