/**
 * Quiet startup sync for the usage widget: /zen/go/v1/usage is polled only with
 * a UI and a key, and background polls are deduped across pi processes through
 * a shared snapshot (`<agentDir>/cache/opencode-go-usage.json`).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncLockPath } from "../sync-policy";
import embeddedModels from "../models.json" with { type: "json" };

const PROVIDER_ID = "opencode-go";
const KEY = "sk-usage-sync-test";
const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

let home: string;
let usagePath: string;
const shutdowns: Array<() => void> = [];

afterEach(() => {
  for (const shutdown of shutdowns.splice(0)) shutdown();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  if (home) fs.rmSync(home, { recursive: true, force: true });
});

function setupHome(): void {
  home = fs.mkdtempSync(path.join(os.tmpdir(), `pi-${PROVIDER_ID}-usage-sync-`));
  usagePath = path.join(home, "cache", `${PROVIDER_ID}-usage.json`);
  vi.stubEnv("PI_CODING_AGENT_DIR", home);
  vi.stubEnv("PI_PROVIDER_SYNC_TTL_MS", "");
  vi.stubEnv("OPENCODE_API_KEY", "");
  // A fresh model cache keeps /models out of the picture: only usage is polled.
  const modelsCache = path.join(home, "cache", `${PROVIDER_ID}-models.json`);
  fs.mkdirSync(path.dirname(modelsCache), { recursive: true });
  fs.writeFileSync(modelsCache, JSON.stringify(embeddedModels));
}

const usagePayload = () => Response.json({
  usage: {
    rolling: { status: "ok", percent: 10, resetsAt: null },
    weekly: { status: "ok", percent: 20, resetsAt: null },
    monthly: { status: "ok", percent: 30, resetsAt: null },
  },
});

/** Routes usage requests to a counted stub; anything else (e.g. /models) gets a 503. */
function stubFetch() {
  const usage = vi.fn(async () => usagePayload());
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => (
    String(input) === USAGE_URL ? usage() : new Response("", { status: 503 })
  )));
  return usage;
}

async function loadExtension(options: { hasUI?: boolean; key?: string | undefined } = {}) {
  vi.resetModules();
  const mod = await import("../index");
  const handlers = new Map<string, (...args: any[]) => any>();
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  mod.default({
    on: (event: string, handler: (...args: any[]) => any) => handlers.set(event, handler),
    registerProvider: () => {},
    registerCommand: (name: string, command: any) => commands.set(name, command),
  } as any);
  const ui = { notify: vi.fn(), setWidget: vi.fn(), setStatus: vi.fn() };
  const key = "key" in options ? options.key : KEY;
  const ctx = {
    hasUI: options.hasUI ?? true,
    mode: "tui",
    model: { provider: PROVIDER_ID, id: "kimi-k2.6" },
    ui,
    modelRegistry: { getApiKeyForProvider: vi.fn(async () => key) },
    sessionManager: { getSessionId: () => "session-1" },
  };
  shutdowns.push(() => handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx));
  return {
    ui,
    ctx,
    startSession: () => handlers.get("session_start")!({ type: "session_start" }, ctx),
    turnEnd: () => handlers.get("turn_end")!({ type: "turn_end" }, ctx),
    usageCommand: () => commands.get("opencode-go-usage")!.handler("", ctx),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const widgetInstalled = (ui: { setWidget: ReturnType<typeof vi.fn> }) =>
  ui.setWidget.mock.calls.some(([key, factory]) => key === "opencode-go-usage" && typeof factory === "function");

describe("usage polling (quiet startup sync)", () => {
  it("polls once across processes; later processes render the shared snapshot", async () => {
    setupHome();
    const usage = stubFetch();
    const first = await loadExtension();
    await first.startSession();
    await vi.waitFor(() => expect(widgetInstalled(first.ui)).toBe(true));
    expect(usage).toHaveBeenCalledOnce();
    const raw = fs.readFileSync(usagePath, "utf8");
    expect(raw).not.toContain(KEY);
    expect(JSON.parse(raw).snapshot.windows).toHaveLength(3);
    expect(fs.existsSync(syncLockPath(usagePath))).toBe(false);

    const second = await loadExtension(); // another pi process
    await second.startSession();
    await vi.waitFor(() => expect(widgetInstalled(second.ui)).toBe(true));
    await second.turnEnd();
    await settle();
    expect(usage).toHaveBeenCalledOnce();
  });

  it("never polls without a UI (print mode, child agents)", async () => {
    setupHome();
    const usage = stubFetch();
    const ext = await loadExtension({ hasUI: false });
    await ext.startSession();
    await ext.turnEnd();
    await settle();
    expect(usage).not.toHaveBeenCalled();
    expect(fs.existsSync(usagePath)).toBe(false);
  });

  it("never polls without credentials", async () => {
    setupHome();
    const usage = stubFetch();
    const ext = await loadExtension({ key: undefined });
    await ext.startSession();
    await settle();
    expect(usage).not.toHaveBeenCalled();
    expect(fs.existsSync(syncLockPath(usagePath))).toBe(false);
  });

  it("/opencode-go-usage always re-reads the API, even inside the shared window", async () => {
    setupHome();
    const usage = stubFetch();
    const first = await loadExtension();
    await first.startSession();
    await vi.waitFor(() => expect(usage).toHaveBeenCalledOnce());
    const second = await loadExtension();
    await second.usageCommand();
    expect(usage).toHaveBeenCalledTimes(2);
    expect(second.ui.notify).toHaveBeenCalledWith(expect.stringContaining("OpenCode Go usage"), "info");
  });
});
