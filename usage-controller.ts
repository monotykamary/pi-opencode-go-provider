/**
 * Lifecycle for the OpenCode Go usage widget.
 *
 * Mirrors the pi-better-openai usage controller: one snapshot per session,
 * polled on a timer plus after each turn, pushed into the extension widget
 * (favoured) or the footer status line when no terminal UI is available.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PROVIDER_ID, configPath, type UsageConfig } from "./config.ts";
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
