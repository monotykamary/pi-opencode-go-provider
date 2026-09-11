/**
 * OpenCode Go usage windows.
 *
 * `GET https://opencode.ai/zen/go/v1/usage` is the only place the Go plan's
 * three meter windows are published. Server source:
 *   sst/opencode packages/console/app/src/routes/zen/go/v1/usage.ts
 *
 *   Authorization: Bearer <api-key>
 *   200 { "usage": { "rolling" | "weekly" | "monthly":
 *           { "status": "ok" | "rate-limited", "percent": 0-100,
 *             "resetsAt": "<ISO-8601>" } } }
 *   401 AuthError (missing/unknown key), 403 EntitlementError (no Go plan)
 *
 * `percent` is the share of that window's dollar budget already spent
 * (`floor(min(100, usage / limit * 100))`), so the widget reports it as
 * "% used". The dollar limits are not on the wire; see USAGE_LIMITS_NOTE.
 */

export const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

/** Published Go budget per window; informational only, not sent by the API. */
export const USAGE_LIMITS_NOTE = "5h $12 · 7d $30 · 30d $60";

export type UsageWindowKey = "rolling" | "weekly" | "monthly";
export type UsageStatus = "ok" | "rate-limited" | "unknown";
export type UsageSeverity = "ok" | "warning" | "critical" | "muted";

export interface UsageWindow {
  key: UsageWindowKey;
  /** Short human label: 5h / 7d / 30d. */
  label: string;
  status: UsageStatus;
  /** 0-100, share of the window budget already consumed. */
  usedPercent: number;
  /** Window rollover instant in epoch milliseconds, or null when unknown. */
  resetsAt: number | null;
}

export interface UsageSnapshot {
  capturedAt: number;
  windows: UsageWindow[];
  isLimited: boolean;
}

export interface UsageSegment {
  text: string;
  severity: UsageSeverity;
}

export interface UsageFormatOptions {
  showResetTimes: boolean;
}

export const USAGE_WINDOW_LABELS: Record<UsageWindowKey, string> = {
  rolling: "5h",
  weekly: "7d",
  monthly: "30d",
};

const WINDOW_KEYS: UsageWindowKey[] = ["rolling", "weekly", "monthly"];
const WARNING_PERCENT = 70;
const CRITICAL_PERCENT = 90;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Accept ISO-8601 strings, epoch seconds, or epoch milliseconds. */
export function parseResetAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return parseResetAt(Number(trimmed));
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseWindow(key: UsageWindowKey, raw: unknown): UsageWindow | undefined {
  if (!isRecord(raw)) return undefined;
  const percent = toFiniteNumber(raw.percent);
  if (percent === undefined) return undefined;
  const status: UsageStatus =
    raw.status === "rate-limited" ? "rate-limited" : raw.status === "ok" ? "ok" : "unknown";
  return {
    key,
    label: USAGE_WINDOW_LABELS[key],
    status,
    usedPercent: clampPercent(percent),
    resetsAt: parseResetAt(raw.resetsAt),
  };
}

/**
 * Parse a usage response into a snapshot. Returns undefined when the payload
 * carries no usable window so callers can report "no data" instead of zeros.
 */
export function parseUsageSnapshot(payload: unknown, now = Date.now()): UsageSnapshot | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) return undefined;
  const usage = payload.usage;
  const windows: UsageWindow[] = [];
  for (const key of WINDOW_KEYS) {
    const window = parseWindow(key, usage[key]);
    if (window) windows.push(window);
  }
  if (windows.length === 0) return undefined;
  return {
    capturedAt: now,
    windows,
    isLimited: windows.some((window) => window.status === "rate-limited"),
  };
}

/** Turn a non-2xx usage response into an actionable message. */
export function usageHttpErrorMessage(status: number, payload: unknown): string {
  const detail =
    isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : undefined;
  const suffix = detail ? `: ${detail}` : ".";
  if (status === 401) return `OpenCode Go rejected the API key (401)${suffix}`;
  if (status === 403) return `This key has no OpenCode Go subscription (403)${suffix}`;
  return `OpenCode Go usage request failed (${status})${suffix}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(clampPercent(value))}%`;
}

/** Compact duration for a countdown: 2h14m / 5d3h / 45s / now. */
export function formatCountdown(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return "unknown";
  const total = Math.max(0, Math.round(milliseconds / 1000));
  if (total === 0) return "now";
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function clockFormat(now: number, reset: number): Intl.DateTimeFormatOptions {
  const current = new Date(now);
  const target = new Date(reset);
  if (target.toDateString() === current.toDateString()) {
    return { hour: "numeric", minute: "2-digit" };
  }
  if (target.getTime() - current.getTime() < 7 * 86_400_000) {
    return { weekday: "short", hour: "numeric", minute: "2-digit" };
  }
  return { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
}

/** Local wall-clock time the window rolls over, e.g. "16:46" or "Mon 16:46". */
export function formatResetClock(resetAt: number, now = Date.now()): string {
  try {
    return new Intl.DateTimeFormat(undefined, clockFormat(now, resetAt)).format(resetAt);
  } catch {
    return new Date(resetAt).toISOString();
  }
}

export function severityForWindow(window: UsageWindow): UsageSeverity {
  if (window.status === "rate-limited" || window.usedPercent >= CRITICAL_PERCENT) return "critical";
  if (window.usedPercent >= WARNING_PERCENT) return "warning";
  return "ok";
}

/** Single-line breakdown: "OpenCode Go · 5h 63% used ↺2h14m · 7d ...". */
export function usageSegments(
  snapshot: UsageSnapshot,
  options: UsageFormatOptions,
  now = Date.now(),
): UsageSegment[] {
  const segments: UsageSegment[] = [{ text: "OpenCode Go", severity: "muted" }];
  for (const window of snapshot.windows) {
    segments.push({ text: " · ", severity: "muted" });
    segments.push({ text: `${window.label} `, severity: "muted" });
    if (window.status === "rate-limited") {
      segments.push({ text: "LIMIT", severity: "critical" });
    } else {
      segments.push({
        text: `${formatPercent(window.usedPercent)} used`,
        severity: severityForWindow(window),
      });
    }
    if (options.showResetTimes && window.resetsAt !== null) {
      segments.push({
        text: ` ↺${formatCountdown(window.resetsAt - now)}`,
        severity: "muted",
      });
    }
  }
  return segments;
}

export function formatUsageLine(
  snapshot: UsageSnapshot,
  options: UsageFormatOptions,
  now = Date.now(),
): string {
  return usageSegments(snapshot, options, now)
    .map((segment) => segment.text)
    .join("");
}

/** Progress bar: 20 cells, filled by percent. */
export function formatBar(percent: number, width = 20): string {
  const filled = Math.round((clampPercent(percent) / 100) * width);
  return `${"\u2588".repeat(filled)}${"\u2591".repeat(width - filled)}`;
}

/** Multi-line breakdown with bars, used by the command output. */
export function formatUsageDetail(snapshot: UsageSnapshot, now = Date.now()): string[] {
  return snapshot.windows.map((window) => {
    const limited = window.status === "rate-limited";
    const percent = limited ? 100 : window.usedPercent;
    const reset =
      window.resetsAt === null
        ? ""
        : `  ↺ ${formatCountdown(window.resetsAt - now)} (${formatResetClock(window.resetsAt, now)})`;
    return `${window.label.padEnd(3)} ${formatBar(percent)} ${formatPercent(percent).padStart(4)} used${reset}${limited ? "  RATE LIMITED" : ""}`;
  });
}
