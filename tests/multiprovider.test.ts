import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_USAGE_CONFIG, PROVIDER_ID } from "../config.ts";
import {
  isMultiproviderService,
  setActiveMultiproviderService,
  type MultiproviderAccountAuth,
  type MultiproviderService,
} from "../multiprovider.ts";
import { UsageController } from "../usage-controller.ts";

function fakeService(
  resolve: () => Promise<MultiproviderAccountAuth | undefined>,
): { value: MultiproviderService; resolveActiveAccountAuth: () => Promise<MultiproviderAccountAuth | undefined> } {
  const resolveActiveAccountAuth = async () => resolve();
  const value: MultiproviderService = {
    getActiveAccount: async () => undefined,
    resolveActiveAccountAuth,
    onActiveAccountChanged: () => () => {},
  };
  return { value, resolveActiveAccountAuth };
}

function sessionContext(registryKey: string | undefined): ExtensionContext {
  return {
    model: { provider: PROVIDER_ID, id: "kimi-k3" },
    hasUI: true,
    signal: undefined,
    ui: { notify: () => {} },
    modelRegistry: { getApiKeyForProvider: async () => registryKey },
    sessionManager: { getSessionId: () => "session-1" },
  } as unknown as ExtensionContext;
}

function makeController(): UsageController {
  return new UsageController(() => DEFAULT_USAGE_CONFIG, () => {});
}

/** Records the bearer token each usage request billed. */
function stubUsageFetch(): { headers: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const headers: string[] = [];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const requestHeaders = (init?.headers ?? {}) as Record<string, string>;
    headers.push(String(requestHeaders.authorization ?? ""));
    return new Response(
      JSON.stringify({
        usage: {
          rolling: { status: "ok", percent: 10, resetsAt: null },
          weekly: { status: "ok", percent: 20, resetsAt: null },
          monthly: { status: "ok", percent: 30, resetsAt: null },
        },
      }),
    );
  }) as typeof fetch;
  return {
    headers,
    restore() {
      globalThis.fetch = original;
    },
  };
}

test("detects the pi-multiprovider service payload", () => {
  assert.equal(isMultiproviderService(fakeService(async () => undefined).value), true);
  assert.equal(isMultiproviderService(undefined), false);
  assert.equal(isMultiproviderService({ getActiveAccount: () => {} }), false);
  assert.equal(
    isMultiproviderService({
      getActiveAccount: () => {},
      resolveActiveAccountAuth: () => {},
      onActiveAccountChanged: null,
    }),
    false,
  );
});

test("bills the session's pooled account when pi-multiprovider pins one", async () => {
  const fetchStub = stubUsageFetch();
  const service = fakeService(async () => ({ accessToken: "pooled-key", label: "Work" }));
  setActiveMultiproviderService(service.value);
  try {
    const controller = makeController();
    await controller.refresh(sessionContext("registry-key"), { force: true });
    assert.deepEqual(fetchStub.headers, ["Bearer pooled-key"]);
    assert.ok(controller.snapshot);
  } finally {
    setActiveMultiproviderService(undefined);
    fetchStub.restore();
  }
});

test("falls back to the registry key when the session has no pooled account", async () => {
  const fetchStub = stubUsageFetch();
  const service = fakeService(async () => undefined);
  setActiveMultiproviderService(service.value);
  try {
    const controller = makeController();
    await controller.refresh(sessionContext("registry-key"), { force: true });
    assert.deepEqual(fetchStub.headers, ["Bearer registry-key"]);
  } finally {
    setActiveMultiproviderService(undefined);
    fetchStub.restore();
  }
});

test("falls back to the registry key when the bridge rejects", async () => {
  const fetchStub = stubUsageFetch();
  const service = fakeService(() => Promise.reject(new Error("store locked")));
  setActiveMultiproviderService(service.value);
  try {
    const controller = makeController();
    await controller.refresh(sessionContext("registry-key"), { force: true });
    assert.deepEqual(fetchStub.headers, ["Bearer registry-key"]);
  } finally {
    setActiveMultiproviderService(undefined);
    fetchStub.restore();
  }
});

test("keeps its own resolution when pi-multiprovider is absent", async () => {
  const fetchStub = stubUsageFetch();
  setActiveMultiproviderService(undefined);
  try {
    const controller = makeController();
    await controller.refresh(sessionContext("registry-key"), { force: true });
    assert.deepEqual(fetchStub.headers, ["Bearer registry-key"]);
  } finally {
    fetchStub.restore();
  }
});
