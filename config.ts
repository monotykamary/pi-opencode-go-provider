/**
 * Persistent settings for the opencode-go provider extension.
 *
 * The file is deliberately tiny and optional: every field falls back to
 * DEFAULT_USAGE_CONFIG, then an environment override wins. Written only by
 * `/opencode-go-usage on|off` so the widget choice survives a restart.
 */

import fs from "node:fs";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const PROVIDER_ID = "opencode-go";
export const CONFIG_BASENAME = "opencode-go-provider.json";
/** Shared key so the widget and the status fallback never collide with other extensions. */
export const USAGE_WIDGET_KEY = "opencode-go-usage";

export type UsagePlacement = "aboveEditor" | "belowEditor";

export interface UsageConfig {
  /** Show the usage widget/status at all. */
  enabled: boolean;
  /** Poll interval while a session is open. */
  refreshIntervalMs: number;
  /** Only display usage while the selected model belongs to opencode-go. */
  showOnlyOnProvider: boolean;
  /** Include reset countdowns in the widget line. */
  showResetTimes: boolean;
  placement: UsagePlacement;
}

export const DEFAULT_USAGE_CONFIG: UsageConfig = {
  enabled: true,
  refreshIntervalMs: 60_000,
  showOnlyOnProvider: true,
  showResetTimes: true,
  placement: "belowEditor",
};

export const MIN_USAGE_REFRESH_MS = 15_000;
export const MAX_USAGE_REFRESH_MS = 10 * 60_000;

const USAGE_PLACEMENTS: UsagePlacement[] = ["aboveEditor", "belowEditor"];
const DISABLED_VALUES = new Set(["0", "false", "off", "no", "disable", "disabled"]);
const ENABLED_VALUES = new Set(["1", "true", "on", "yes", "enable", "enabled"]);

export function configPath(): string {
  return path.join(getAgentDir(), CONFIG_BASENAME);
}

export function clampRefreshInterval(milliseconds: number): number {
  if (!Number.isFinite(milliseconds)) return DEFAULT_USAGE_CONFIG.refreshIntervalMs;
  return Math.max(MIN_USAGE_REFRESH_MS, Math.min(MAX_USAGE_REFRESH_MS, Math.round(milliseconds)));
}

function parseFlag(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (DISABLED_VALUES.has(normalized)) return false;
  if (ENABLED_VALUES.has(normalized)) return true;
  return undefined;
}

function readFileUsage(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const usage = (parsed as Record<string, unknown>).usage;
      if (usage && typeof usage === "object" && !Array.isArray(usage)) {
        return usage as Record<string, unknown>;
      }
    }
  } catch {
    // Missing or unreadable config is the normal first-run state.
  }
  return {};
}

/**
 * Resolve the effective usage config: defaults <- config file <- environment.
 * Never throws; a broken config file degrades to defaults.
 */
export function readUsageConfig(env: NodeJS.ProcessEnv = process.env): UsageConfig {
  const config = { ...DEFAULT_USAGE_CONFIG };
  const file = readFileUsage();

  if (typeof file.enabled === "boolean") config.enabled = file.enabled;
  if (typeof file.showOnlyOnProvider === "boolean") config.showOnlyOnProvider = file.showOnlyOnProvider;
  if (typeof file.showResetTimes === "boolean") config.showResetTimes = file.showResetTimes;
  if (typeof file.refreshIntervalMs === "number") {
    config.refreshIntervalMs = clampRefreshInterval(file.refreshIntervalMs);
  }
  if (USAGE_PLACEMENTS.includes(file.placement as UsagePlacement)) {
    config.placement = file.placement as UsagePlacement;
  }

  const envEnabled = parseFlag(env.OPENCODE_GO_USAGE);
  if (envEnabled !== undefined) config.enabled = envEnabled;
  const envInterval = env.OPENCODE_GO_USAGE_INTERVAL_MS
    ? Number(env.OPENCODE_GO_USAGE_INTERVAL_MS)
    : undefined;
  if (envInterval !== undefined) config.refreshIntervalMs = clampRefreshInterval(envInterval);

  return config;
}

/** Merge a patch into the config file, preserving unrelated keys. */
export function writeUsageConfig(patch: Partial<UsageConfig>): boolean {
  try {
    const file = configPath();
    let document: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        document = parsed as Record<string, unknown>;
      }
    } catch {
      document = {};
    }
    document.usage = { ...readFileUsage(), ...patch };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}
