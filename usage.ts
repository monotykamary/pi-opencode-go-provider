/**
 * OpenCode Go usage windows.
 *
 * `GET https://opencode.ai/zen/go/v1/usage` is the only place the Go plan's
 * three meter windows are published. Server source:
 *   sst/opencode packages/console/app/src/routes/zen/go/v1/usage.ts
 *   sst/opencode packages/console/core/src/subscription.ts
 *
 *   Authorization: Bearer <api-key>
 *   200 { "usage": { "rolling" | "weekly" | "monthly":
 *           { "status": "ok" | "rate-limited", "percent": 0-100,
 *             "resetsAt": "<ISO-8601>" } } }
 *   401 AuthError (missing/unknown key), 403 EntitlementError (no Go plan)
 *
 * `percent` is the share of the window budget already spent
 * (`floor(min(100, usage / limit * 100))`, forced to 100 once the window is rate
 * limited), so every surface here reports `100 - percent` — the budget you have
 * left. The dollar limits are not on the wire; see USAGE_LIMITS_NOTE.
 *
 * The widget line mirrors the pi-better-openai usage line so both providers read
 * the same way:
 *
 *   Usage: 5h: 63% · 7d: 41% · 30d: 12% · 5h ↺ 2h14m · 7d ↺ 3d20h ·
 *   30d ↺ 20d0h
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
  /** 0-100, share of the window budget already consumed (raw API value). */
  usedPercent: number;
  /** 0-100, share of the window budget still available (100 - usedPercent). */
  remainingPercent: number;
  /** Window rollover instant in epoch milliseconds, or null when unknown. */
  resetsAt: number | null;
}

export interface UsageSnapshot {
  capturedAt: number;
  windows: UsageWindow[];
  isLimited: boolean;
  /**
   * Banked reset credits. The Go API does not expose this today — its payload
   * carries only status/percent/resetsAt per window — so the segment stays off
   * the line until a response actually includes `bankedResets`.
   */
  bankedResets: number | null;
}

export interface UsageSegment {
  text: string;
  severity: UsageSeverity;
}

export interface UsageFormatOptions {
  showResetTimes: boolean;
  showBankedResets?: boolean;
}

export const USAGE_WINDOW_LABELS: Record<UsageWindowKey, string> = {
  rolling: "5h",
  weekly: "7d",
  monthly: "30d",
};

/** Whether a window's reset needs a calendar date as well as a weekday. */
const USAGE_WINDOW_INCLUDE_DATE: Record<UsageWindowKey, boolean> = {
  rolling: false,
  weekly: true,
  monthly: true,
};

const WINDOW_KEYS: UsageWindowKey[] = ["rolling", "weekly", "monthly"];
/** Remaining budget at or below these thresholds turns the percentage amber/red. */
const WARNING_REMAINING_PERCENT = 30;
const CRITICAL_REMAINING_PERCENT = 10;

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
  const usedPercent = clampPercent(percent);
  return {
    key,
    label: USAGE_WINDOW_LABELS[key],
    status,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetsAt: parseResetAt(raw.resetsAt),
  };
}

function parseBankedResets(usage: Record<string, unknown>): number | null {
  const count = toFiniteNumber(usage.bankedResets);
  return count !== undefined && Number.isInteger(count) && count >= 0 ? count : null;
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
    bankedResets: parseBankedResets(usage),
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

/** Compact duration for a countdown: 2h14m / 5d3h / 45m / 12s / now. */
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

interface ResetClockFormatters {
  time: Intl.DateTimeFormat;
  weekday: Intl.DateTimeFormat;
  date: Intl.DateTimeFormat;
}

const RESET_CLOCK_FORMATTER_LIMIT = 8;
const resetClockFormatters = new Map<string, ResetClockFormatters>();

function timeZoneId(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  } catch {
    return "local";
  }
}

/** Intl formatters are expensive; cache one set per time zone and offset. */
function resetClockFormatterFor(reset: Date): ResetClockFormatters {
  const key = `${timeZoneId()}:${reset.getTimezoneOffset()}`;
  let formatters = resetClockFormatters.get(key);
  if (!formatters) {
    formatters = {
      time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }),
      weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }),
      date: new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" }),
    };
    resetClockFormatters.set(key, formatters);
    while (resetClockFormatters.size > RESET_CLOCK_FORMATTER_LIMIT) {
      const oldest = resetClockFormatters.keys().next().value;
      if (oldest === undefined) break;
      resetClockFormatters.delete(oldest);
    }
  }
  return formatters;
}

/**
 * Local wall-clock instant a window rolls over: "3:14 PM" later today,
 * "Tue 3:14 PM" within the week, or "Tue 9/15 10:42 AM" with `includeDate`.
 */
export function formatResetClock(
  resetAt: number,
  options?: { includeDate?: boolean },
  now = Date.now(),
): string | null {
  const reset = new Date(resetAt);
  if (Number.isNaN(reset.getTime())) return null;
  const formatters = resetClockFormatterFor(reset);
  const time = formatters.time.format(reset);
  if (!options?.includeDate && reset.toDateString() === new Date(now).toDateString()) return time;
  const weekday = formatters.weekday.format(reset);
  if (!options?.includeDate) return `${weekday} ${time}`;
  return `${weekday} ${formatters.date.format(reset)} ${time}`;
}

/**
 * "↺ 2h14m", with the window label when several are listed. The widget carries
 * countdowns only: three windows plus three wall-clock times run past the
 * terminal width, so the exact reset time lives in the breakdown instead.
 */
function formatCompactReset(
  label: string | undefined,
  resetAt: number | null,
  now: number,
): string | null {
  if (resetAt === null) return null;
  return `${label ? `${label} ` : ""}↺ ${formatCountdown(resetAt - now)}`;
}

/** "3 banked resets", or null when the count is absent or zero. */
export function formatBankedResetsSuffix(count: number | null): string | null {
  if (count === null || !Number.isInteger(count) || count <= 0) return null;
  return `${count} banked reset${count === 1 ? "" : "s"}`;
}

/** Remaining budget drives the colour: plenty left is green, nearly spent is red. */
export function severityForWindow(window: UsageWindow): UsageSeverity {
  if (window.status === "rate-limited" || window.remainingPercent <= CRITICAL_REMAINING_PERCENT) {
    return "critical";
  }
  if (window.remainingPercent <= WARNING_REMAINING_PERCENT) return "warning";
  return "ok";
}

/**
 * One-line widget, split into severity-tagged segments:
 * "Usage: 5h: 63% · 7d: 41% · 30d: 12% · 5h ↺ 2h14m · 7d ↺ 3d20h · 30d ↺ …".
 */
export function usageSegments(
  snapshot: UsageSnapshot,
  options: UsageFormatOptions,
  now = Date.now(),
): UsageSegment[] {
  const windows = snapshot.windows;
  const labelled = windows.length > 1;
  const segments: UsageSegment[] = [{ text: "Usage: ", severity: "muted" }];
  windows.forEach((window, index) => {
    if (index > 0) segments.push({ text: " · ", severity: "muted" });
    segments.push({ text: `${window.label}: `, severity: "muted" });
    segments.push({
      text: formatPercent(window.remainingPercent),
      severity: severityForWindow(window),
    });
  });
  if (options.showResetTimes) {
    for (const window of windows) {
      const reset = formatCompactReset(labelled ? window.label : undefined, window.resetsAt, now);
      if (reset) segments.push({ text: ` · ${reset}`, severity: "muted" });
    }
  }
  if (options.showBankedResets !== false) {
    const banked = formatBankedResetsSuffix(snapshot.bankedResets);
    if (banked) segments.push({ text: ` · ${banked}`, severity: "muted" });
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

/** Progress bar: 20 cells, filled by the remaining percentage. */
export function formatBar(percent: number, width = 20): string {
  const filled = Math.round((clampPercent(percent) / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

/** Multi-line breakdown with bars, used by the command output. */
export function formatUsageDetail(snapshot: UsageSnapshot, now = Date.now()): string[] {
  return snapshot.windows.map((window) => {
    const clock = window.resetsAt === null
      ? null
      : formatResetClock(window.resetsAt, { includeDate: USAGE_WINDOW_INCLUDE_DATE[window.key] }, now);
    const reset =
      window.resetsAt === null || clock === null
        ? ""
        : `  ↺ ${formatCountdown(window.resetsAt - now)} - ${clock}`;
    const limited = window.status === "rate-limited" ? "  RATE LIMITED" : "";
    return `${window.label.padEnd(3)} ${formatBar(window.remainingPercent)} ${formatPercent(window.remainingPercent).padStart(4)} left${reset}${limited}`;
  });
}
