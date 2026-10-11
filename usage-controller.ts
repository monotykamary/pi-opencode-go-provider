/**
 * Lifecycle for the OpenCode Go usage widget.
 *
 * Mirrors the pi-better-openai usage controller: one snapshot per session,
 * polled on a timer plus after each turn, pushed into the extension widget
 * (favoured) or the footer status line when no terminal UI is available.
 *
 * Quiet startup sync: polling is skipped entirely without a UI (print/JSON mode,
 * fan-out child agents) and without credentials. Background polls (session
 * start, timer, turn/model events) are deduped across pi processes through
 * sync-policy.ts: one process polls per USAGE_SYNC_TTL_MS and writes the
 * snapshot to `<agentDir>/cache/opencode-go-usage.json`; the others render that
 * file. `/opencode-go-usage` (notify) always polls.
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PROVIDER_ID, configPath, usageCachePath, type UsageConfig } from "./config.ts";
import { acquireModelSync, keyFingerprint, writeFileAtomic, type SkipReason } from "./sync-policy.ts";
import { getActiveMultiproviderService } from "./multiprovider.ts";
import {
  USAGE_LIMITS_NOTE,
  USAGE_URL,
  formatUsageDetail,
  formatUsageLine,
  parseUsageSnapshot,
  usageHttpErrorMessage,
  type UsageSnapshot,
} from "./usage.ts";

const REQUEST_TIMEOUT_MS = 10_000;
/**
 * Cross-process freshness window for the shared usage snapshot: half the
 * default 60s poll interval. Each process's widget is at most ~30s behind a
 * direct poll, while any number of pi processes collapse to about one usage
 * request per 30s. Fixed (PI_PROVIDER_SYNC_TTL_MS tunes the model catalog only).
 */
export const USAGE_SYNC_TTL_MS = 30_000;

/** On-disk shape of the shared usage snapshot (never contains the key). */
interface SharedUsage {
  version: 1;
  keyFingerprint: string;
  fetchedAt: number;
  snapshot: UsageSnapshot;
}

/** The shared snapshot, only when it was polled with this same key. */
function readSharedUsage(cachePath: string, apiKey: string): SharedUsage | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Partial<SharedUsage> | null;
    if (!data || data.keyFingerprint !== keyFingerprint(apiKey)) return undefined;
    if (typeof data.fetchedAt !== "number" || !Array.isArray(data.snapshot?.windows)) return undefined;
    return data as SharedUsage;
  } catch {
    return undefined;
  }
}

function writeSharedUsage(cachePath: string, apiKey: string, snapshot: UsageSnapshot, fetchedAt: number): void {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const shared: SharedUsage = { version: 1, keyFingerprint: keyFingerprint(apiKey), fetchedAt, snapshot };
    writeFileAtomic(cachePath, JSON.stringify(shared) + "\n");
  } catch {
    // Non-fatal: other processes just poll themselves.
  }
}
const STALE_CONTEXT_MESSAGE = "This extension ctx is stale";
const MISSING_KEY_MESSAGE =
  "no opencode-go API key. Set OPENCODE_API_KEY or add \"opencode-go\" to ~/.pi/agent/auth.json.";

type UsageRefreshOptions = { notify?: boolean; force?: boolean };

type QueuedRefresh = {
  ctx: ExtensionContext;
  generation: number;
  notify?: boolean;
  force?: boolean;
};

function isStaleContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(STALE_CONTEXT_MESSAGE);
}

export class UsageController {
  private usageSnapshot: UsageSnapshot | undefined;
  private usageUpdatedAt: number | undefined;
  private usageError: string | undefined;
  private usageLastFetchAt: number | undefined;
  private usageSource: "network" | "shared cache" | undefined;
  private usageTimer: ReturnType<typeof setInterval> | undefined;
  private usageRefreshInFlight = false;
  private queuedRefresh: QueuedRefresh | undefined;
  private shuttingDown = false;
  private usageAbortController: AbortController | undefined;
  private generation = 0;
  private readonly getConfig: () => UsageConfig;
  private readonly onUpdate: (ctx: ExtensionContext) => void;

  constructor(getConfig: () => UsageConfig, onUpdate: (ctx: ExtensionContext) => void) {
    this.getConfig = getConfig;
    this.onUpdate = onUpdate;
  }

  get snapshot(): UsageSnapshot | undefined {
    return this.usageSnapshot;
  }

  get lastError(): string | undefined {
    return this.usageError;
  }

  /** True when the last poll failed but an older snapshot is still on screen. */
  isStale(): boolean {
    return this.usageError !== undefined && this.usageSnapshot !== undefined;
  }

  isEligible(ctx: ExtensionContext): boolean {
    try {
      return !this.getConfig().showOnlyOnProvider || ctx.model?.provider === PROVIDER_ID;
    } catch {
      return false;
    }
  }

  /** One-line widget/status text, or undefined when nothing should be shown. */
  line(ctx: ExtensionContext, config = this.getConfig()): string | undefined {
    if (!config.enabled || !this.usageSnapshot || !this.isEligible(ctx)) return undefined;
    const line = formatUsageLine(this.usageSnapshot, { showResetTimes: config.showResetTimes });
    return this.isStale() ? `${line} · stale` : line;
  }

  formatStatus(ctx: ExtensionContext): string {
    const config = this.getConfig();
    if (!config.enabled) {
      return "OpenCode Go usage display is disabled. Re-enable it with /opencode-go-usage on.";
    }
    if (!this.isEligible(ctx)) {
      return "OpenCode Go usage is hidden: the selected model is not from the opencode-go provider.";
    }
    if (this.usageError) return `OpenCode Go usage unavailable: ${this.usageError}`;
    if (!this.usageSnapshot) return "OpenCode Go usage unavailable: nothing fetched yet.";
    const lines = [
      `OpenCode Go usage · ${USAGE_LIMITS_NOTE}`,
      ...formatUsageDetail(this.usageSnapshot),
    ];
    if (this.usageSnapshot.isLimited) {
      lines.push("A window is rate limited; requests may be rejected until it resets.");
    }
    if (this.usageUpdatedAt !== undefined) {
      lines.push(`Updated ${new Date(this.usageUpdatedAt).toLocaleTimeString()}`);
    }
    return lines.join("\n");
  }

  formatDebug(ctx: ExtensionContext): string {
    const config = this.getConfig();
    let provider = "unknown";
    try {
      provider = ctx.model?.provider ?? "none";
    } catch {
      provider = "stale ctx";
    }
    return [
      `Usage enabled: ${config.enabled}`,
      `Usage placement: ${config.placement}`,
      `Refresh interval: ${config.refreshIntervalMs}ms`,
      `Show only on opencode-go models: ${config.showOnlyOnProvider}`,
      `Show reset times: ${config.showResetTimes}`,
      `Current model provider: ${provider}`,
      `Last fetch: ${this.usageLastFetchAt ? new Date(this.usageLastFetchAt).toLocaleTimeString() : "never"}`,
      `Last success: ${this.usageUpdatedAt ? new Date(this.usageUpdatedAt).toLocaleTimeString() : "never"}`,
      `Last error: ${this.usageError ?? "none"}`,
      `Last source: ${this.usageSource ?? "none"}`,
      `Shared snapshot: ${usageCachePath()} (fresh for ${USAGE_SYNC_TTL_MS / 1000}s)`,
      `Windows: ${this.usageSnapshot?.windows.map((window) => `${window.label}=${window.remainingPercent}% left`).join(" ") ?? "none"}`,
      `Endpoint: ${USAGE_URL}`,
      `Config file: ${configPath()}`,
    ].join("\n");
  }

  private isCurrent(generation: number): boolean {
    return !this.shuttingDown && generation === this.generation;
  }

  private deactivate(generation: number): void {
    if (generation !== this.generation) return;
    this.shuttingDown = true;
    this.generation++;
    this.queuedRefresh = undefined;
    this.usageAbortController?.abort();
    this.usageAbortController = undefined;
    this.stopTimer();
  }

  private notify(
    ctx: ExtensionContext,
    message: string,
    level: "info" | "warning" | "error",
  ): void {
    try {
      ctx.ui.notify(message, level);
    } catch {
      // Notifications are best-effort: a stale context must not surface as an error.
    }
  }

  /**
   * The session's active pooled account, when pi-multiprovider pools
   * opencode-go. Every account carries its own budget, so a switched or
   * restored account must bill itself instead of Pi's default credential.
   */
  private async resolvePooledApiKey(ctx: ExtensionContext): Promise<string | undefined> {
    const service = getActiveMultiproviderService();
    if (service === undefined) return undefined;
    try {
      const resolved = await service.resolveActiveAccountAuth(PROVIDER_ID, ctx);
      const token = resolved?.accessToken.trim();
      return token ? token : undefined;
    } catch {
      // A failing bridge must never block the default resolution below.
      return undefined;
    }
  }

  private async resolveApiKey(ctx: ExtensionContext): Promise<string | undefined> {
    const pooled = await this.resolvePooledApiKey(ctx);
    if (pooled !== undefined) return pooled;
    let key: string | undefined;
    try {
      key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID);
    } catch {
      key = undefined;
    }
    if (key?.trim()) return key.trim();
    const envKey = process.env.OPENCODE_API_KEY?.trim();
    return envKey ? envKey : undefined;
  }

  /**
   * Whether this context can render usage at all. Print/JSON mode and child
   * agents run without a UI, so polling there would only spend requests.
   * Throws the stale-context error like any other ctx access.
   */
  private hasUI(ctx: ExtensionContext): boolean {
    return ctx.hasUI !== false;
  }

  private fail(ctx: ExtensionContext, message: string, options?: UsageRefreshOptions): void {
    this.usageError = message;
    this.onUpdate(ctx);
    if (options?.notify) this.notify(ctx, this.formatStatus(ctx), "warning");
  }

  async refresh(
    ctx: ExtensionContext,
    options?: UsageRefreshOptions,
    generation = this.generation,
  ): Promise<void> {
    if (!this.isCurrent(generation)) return;

    // Background polls never run without a UI; an explicit command (notify) still does.
    if (!options?.notify) {
      try {
        if (!this.hasUI(ctx)) return;
      } catch (error) {
        if (isStaleContextError(error)) this.deactivate(generation);
        return;
      }
    }

    const config = this.getConfig();
    if (!config.enabled) {
      this.usageSnapshot = undefined;
      this.usageUpdatedAt = undefined;
      this.usageError = "usage display is disabled.";
      this.onUpdate(ctx);
      if (options?.notify) this.notify(ctx, this.formatStatus(ctx), "warning");
      return;
    }

    let eligible: boolean;
    try {
      eligible = this.isEligible(ctx);
    } catch (error) {
      if (isStaleContextError(error)) this.deactivate(generation);
      return;
    }
    if (!eligible) {
      // Keep the snapshot cached so switching back to opencode-go is instant.
      this.onUpdate(ctx);
      if (options?.notify) this.notify(ctx, this.formatStatus(ctx), "warning");
      return;
    }

    if (this.usageRefreshInFlight) {
      const queued = this.queuedRefresh?.generation === generation ? this.queuedRefresh : undefined;
      this.queuedRefresh = {
        ctx,
        generation,
        notify: queued?.notify || options?.notify,
        force: queued?.force || options?.force,
      };
      return;
    }

    const shouldThrottle =
      !options?.force &&
      !options?.notify &&
      this.usageLastFetchAt !== undefined &&
      Date.now() - this.usageLastFetchAt < config.refreshIntervalMs;
    if (shouldThrottle) {
      this.onUpdate(ctx);
      return;
    }

    this.usageRefreshInFlight = true;
    let lease: ReturnType<typeof acquireModelSync> = null;
    let outcome: "fetched" | "failed" | "aborted" = "failed";
    try {
      const apiKey = await this.resolveApiKey(ctx);
      if (!this.isCurrent(generation)) return;
      if (!apiKey) {
        this.usageSnapshot = undefined;
        this.usageUpdatedAt = undefined;
        this.fail(ctx, MISSING_KEY_MESSAGE, options);
        return;
      }

      this.usageLastFetchAt = Date.now();

      // Cross-process dedupe: one process polls per USAGE_SYNC_TTL_MS, the rest
      // render its snapshot. An explicit refresh (notify) bypasses the window and
      // polls even while another process holds the lock. If the cache dir is
      // unusable we fail open to polling (still throttled per process).
      const cachePath = usageCachePath();
      let skipReason: SkipReason | undefined;
      lease = acquireModelSync({
        cachePath,
        apiKey,
        force: options?.notify === true,
        ttlMs: USAGE_SYNC_TTL_MS,
        isValidCache: (d) => d != null,
        onSkip: (reason) => { skipReason = reason; },
      });
      if (!lease && !options?.notify && skipReason !== "unwritable") {
        const shared = readSharedUsage(cachePath, apiKey);
        if (shared) {
          this.usageSnapshot = shared.snapshot;
          this.usageUpdatedAt = shared.fetchedAt;
          this.usageError = undefined;
          this.usageSource = "shared cache";
        }
        this.onUpdate(ctx);
        return;
      }

      this.usageAbortController = new AbortController();
      const response = await fetch(USAGE_URL, {
        headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.any([
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          this.usageAbortController.signal,
        ]),
      });
      if (!this.isCurrent(generation)) return;
      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = undefined;
        }
        throw new Error(usageHttpErrorMessage(response.status, body));
      }

      const payload: unknown = await response.json();
      if (!this.isCurrent(generation)) return;
      const snapshot = parseUsageSnapshot(payload);
      if (!snapshot) throw new Error("unrecognized usage payload from OpenCode Go.");

      this.usageSnapshot = snapshot;
      this.usageUpdatedAt = Date.now();
      this.usageError = undefined;
      this.usageSource = "network";
      if (lease) writeSharedUsage(cachePath, apiKey, snapshot, this.usageUpdatedAt);
      outcome = "fetched";
      this.onUpdate(ctx);
      if (options?.notify) this.notify(ctx, this.formatStatus(ctx), "info");
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      if (isStaleContextError(error)) {
        this.deactivate(generation);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.fail(ctx, message, options);
    } finally {
      if (outcome !== "fetched" && !this.isCurrent(generation)) outcome = "aborted";
      lease?.release(outcome);
      this.usageAbortController = undefined;
      this.usageRefreshInFlight = false;
      const next = this.queuedRefresh;
      this.queuedRefresh = undefined;
      if (next && !this.shuttingDown && next.generation === this.generation) {
        void this.refresh(next.ctx, { notify: next.notify, force: next.force }, next.generation);
      }
    }
  }

  private stopTimer(): void {
    if (this.usageTimer) clearInterval(this.usageTimer);
    this.usageTimer = undefined;
  }

  start(ctx: ExtensionContext): void {
    this.usageAbortController?.abort();
    this.queuedRefresh = undefined;
    this.stopTimer();
    const generation = ++this.generation;
    this.shuttingDown = false;

    if (!this.getConfig().enabled) return;
    try {
      if (!this.hasUI(ctx)) return; // nothing to render: no startup poll, no timer
    } catch {
      return;
    }
    void this.refresh(ctx, { force: true }, generation);
    this.usageTimer = setInterval(() => {
      if (!this.isCurrent(generation)) return;
      void this.refresh(ctx, undefined, generation);
    }, this.getConfig().refreshIntervalMs);
    this.usageTimer.unref?.();
  }

  /** Stop polling and drop the cached snapshot (used when the widget is turned off). */
  stop(): void {
    this.usageAbortController?.abort();
    this.usageAbortController = undefined;
    this.queuedRefresh = undefined;
    this.stopTimer();
  }

  clear(): void {
    this.usageSnapshot = undefined;
    this.usageUpdatedAt = undefined;
    this.usageError = undefined;
    this.usageLastFetchAt = undefined;
  }

  shutdown(): void {
    this.deactivate(this.generation);
  }
}
