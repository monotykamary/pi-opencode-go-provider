/**
 * opencode-go Provider Extension
 *
 * Registers opencode-go as a custom provider with multi-API support.
 * Models use anthropic-messages or openai-completions as appropriate,
 * with per-model baseUrl/api.
 *
 * Model resolution strategy: Stale-While-Revalidate
 *   1. Serve stale immediately: disk cache → embedded models.json (zero-latency)
 *   2. Revalidate in background: live API /models → merge with embedded → cache → hot-swap
 *   3. patch.json + custom-models.json applied on top of whichever source won
 *
 * Merge order: [live|cache|embedded] → apply patch.json → merge custom-models.json
 *
 * Usage:
 *   # Set your API key
 *   export OPENCODE_API_KEY=your-api-key
 *
 *   # Run pi with the extension
 *   pi -e /path/to/pi-opencode-go-provider
 *
 * Then use /model to select from available models
 */

import { getAgentDir, type ExtensionAPI, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import modelsData from "./models.json" with { type: "json" };
import customModelsData from "./custom-models.json" with { type: "json" };
import patchData from "./patch.json" with { type: "json" };
import deprecatedData from "./deprecated-models.json" with { type: "json" };
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

type Api = "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";

interface ThinkingLevelMapValue {
  [level: string]: string | null;
}

interface JsonModel {
  id: string;
  name: string;
  api?: Api;
  baseUrl?: string;
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMapValue;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  // null between transformApiModel and mergeWithEmbedded: the live /v1/models
  // API omits context data; null = "API silent, prefer curated/default".
  contextWindow: number | null;
  maxTokens: number;
  compat?: Record<string, unknown>;
}

interface PatchEntry {
  name?: string;
  api?: Api;
  baseUrl?: string;
  reasoning?: boolean;
  thinkingLevelMap?: ThinkingLevelMapValue;
  input?: ("text" | "image")[];
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  compat?: Record<string, unknown>;
}

type PatchData = Record<string, PatchEntry>;

// ─── Patch Application ────────────────────────────────────────────────────────

function applyPatch(model: JsonModel, patch: PatchEntry): JsonModel {
  const result = { ...model };

  if (patch.name !== undefined) result.name = patch.name;
  if (patch.api !== undefined) result.api = patch.api;
  if (patch.baseUrl !== undefined) result.baseUrl = patch.baseUrl;
  if (patch.reasoning !== undefined) result.reasoning = patch.reasoning;
  if (patch.thinkingLevelMap !== undefined) result.thinkingLevelMap = patch.thinkingLevelMap;
  if (patch.input !== undefined) result.input = patch.input;
  if (patch.contextWindow !== undefined) result.contextWindow = patch.contextWindow;
  if (patch.maxTokens !== undefined) result.maxTokens = patch.maxTokens;

  if (patch.cost) {
    result.cost = {
      input: patch.cost.input ?? result.cost.input,
      output: patch.cost.output ?? result.cost.output,
      cacheRead: patch.cost.cacheRead ?? result.cost.cacheRead,
      cacheWrite: patch.cost.cacheWrite ?? result.cost.cacheWrite,
    };
  }
  if (patch.compat) {
    result.compat = { ...(result.compat || {}), ...patch.compat };
  }

  if (!result.reasoning && result.compat?.thinkingFormat) {
    delete result.compat.thinkingFormat;
  }
  if (result.compat && Object.keys(result.compat).length === 0) {
    delete result.compat;
  }

  return result;
}

/** Full pipeline: base models → patch → custom → result */
function buildModels(base: JsonModel[], custom: JsonModel[], patch: PatchData): JsonModel[] {
  const modelMap = new Map<string, JsonModel>();

  // Seed with the base list plus grace-period deprecated models so patch.json
  // entries apply to deprecated models exactly as while the model was live
  // (withDeprecated keeps live data on id conflicts).
  for (const model of withDeprecated(base)) {
    modelMap.set(model.id, model);
  }

  for (const [id, patchEntry] of Object.entries(patch)) {
    const existing = modelMap.get(id);
    if (existing) {
      modelMap.set(id, applyPatch(existing, patchEntry));
    }
  }

  for (const model of custom) {
    const existing = modelMap.get(model.id);
    const patchEntry = patch[model.id];
    if (existing && patchEntry) {
      modelMap.set(model.id, applyPatch(model, patchEntry));
    } else if (existing) {
      modelMap.set(model.id, model);
    } else if (patchEntry) {
      modelMap.set(model.id, applyPatch(model, patchEntry));
    } else {
      modelMap.set(model.id, model);
    }
  }

  return Array.from(modelMap.values());
}

// ─── Stale-While-Revalidate Model Sync ────────────────────────────────────────

const PROVIDER_ID = "opencode-go";
const BASE_URL = "https://opencode.ai/zen/go/v1";
const MODELS_URL = `${BASE_URL}/models`;
const CACHE_DIR = path.join(getAgentDir(), "cache");
const CACHE_PATH = path.join(CACHE_DIR, `${PROVIDER_ID}-models.json`);
const LIVE_FETCH_TIMEOUT_MS = 8000;

/** Map models.dev provider.npm to pi API type and base URL. */
const NPM_TO_API: Record<string, { api: Api; baseUrl: string }> = {
  "@ai-sdk/anthropic": { api: "anthropic-messages", baseUrl: "https://opencode.ai/zen/go" },
};
const DEFAULT_API: { api: Api; baseUrl: string } = { api: "openai-completions", baseUrl: "https://opencode.ai/zen/go/v1" };

/** Transform a model from the opencode-go /v1/models API. Returns minimal data. */
function transformApiModel(apiModel: any): JsonModel {
  const npm = apiModel.provider?.npm;
  const { api, baseUrl } = (npm && NPM_TO_API[npm]) || DEFAULT_API;
  const rawInput = apiModel.modalities?.input || ["text"];
  // Pi Model type only supports "text" and "image"
  const input: ("text" | "image")[] = rawInput.filter((m: string) => m === "text" || m === "image") as ("text" | "image")[];
  if (!input.includes("text")) input.unshift("text");

  return {
    id: apiModel.id,
    name: apiModel.name || apiModel.id,
    api,
    baseUrl,
    reasoning: apiModel.reasoning || false,
    input,
    cost: {
      input: apiModel.cost?.input || 0,
      output: apiModel.cost?.output || 0,
      cacheRead: apiModel.cost?.cache_read || 0,
      cacheWrite: apiModel.cost?.cache_write || 0,
    },
    // The live /v1/models endpoint exposes only {id, object, created, owned_by}
    // — no `limit`, no `context_length`. A literal `|| 131072` here used to make
    // every "API silent" model truthy 131072, which then clobbered the curated
    // 1M/262K values in mergeWithEmbedded via the `||` truthy check. Use `null`
    // so the embedded curated value is preferred when the API is silent.
    contextWindow: apiModel.limit?.context || apiModel.context_length || null,
    maxTokens: apiModel.limit?.output || 0,
  };
}

async function fetchLiveModels(apiKey: string, signal?: AbortSignal): Promise<JsonModel[] | null> {
  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: signal ? AbortSignal.any([AbortSignal.timeout(LIVE_FETCH_TIMEOUT_MS), signal]) : AbortSignal.timeout(LIVE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const apiModels = Array.isArray(data) ? data : (data.data || []);
    if (!Array.isArray(apiModels) || apiModels.length === 0) return null;
    return apiModels.map(transformApiModel);
  } catch {
    return null;
  }
}

function loadCachedModels(): JsonModel[] | null {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function cacheModels(models: JsonModel[]): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(models, null, 2) + "\n");
  } catch {
    // Cache write failure is non-fatal
  }
}

function mergeWithEmbedded(liveModels: JsonModel[], embeddedModels: JsonModel[]): JsonModel[] {
  const embeddedMap = new Map(embeddedModels.map(m => [m.id, m]));
  const seen = new Set<string>();
  const result: JsonModel[] = [];
  for (const liveModel of liveModels) {
    const embedded = embeddedMap.get(liveModel.id);
    seen.add(liveModel.id);
    if (embedded) {
      // Self-heal: live API pricing is authoritative field-by-field. Prefer the
      // live cost when the API reports it (non-zero); fall back to embedded when
      // the API is silent (0) so curated cacheRead/cacheWrite isn't clobbered and
      // providers whose /models endpoint exposes no pricing keep their curated
      // cost. Curation (reasoning/input/compat/name) still wins via ...embedded.
      result.push({
        ...liveModel,
        ...embedded,
        cost: {
          input: liveModel.cost.input || embedded.cost.input,
          output: liveModel.cost.output || embedded.cost.output,
          cacheRead: liveModel.cost.cacheRead || embedded.cost.cacheRead,
          cacheWrite: liveModel.cost.cacheWrite || embedded.cost.cacheWrite,
        },
        // Nullish coalesce: if the live API was silent (liveModel.contextWindow
        // is null), fall through to the curated embedded value. The final
        // `?? 131072` is the safe default for the rare case of a Custom-only
        // model with neither live nor curated data. Using `||` here was the
        // bug — it treated the API's 131072-fallback as authoritative and
        // shadowed curated 1M/262K context windows.
        contextWindow: liveModel.contextWindow ?? embedded.contextWindow ?? 131072,
      });
    } else {
      // API-only model (no curated embedded counterpart). The Live API is silent
      // on contextWindow for all current opencode-go models, so liveModel.contextWindow
      // is null. Apply the safe default here so downstream consumers (e.g. pi core's
      // formatTokenCount → count.toString()) don't crash on null.
      result.push({ ...liveModel, contextWindow: liveModel.contextWindow ?? 131072 });
    }
  }
  // Append any embedded models that the live API didn't return
  for (const em of embeddedModels) {
    if (!seen.has(em.id)) {
      result.push(em);
    }
  }
  return result;
}

// Grace period for delisted models. When the provider API stops listing a
// model, update-models.js moves its last-known definition into
// deprecated-models.json (stamped with deprecatedAt) instead of dropping it.
// For 14 days the model keeps working here so in-flight sessions and saved
// model settings do not break; afterwards it is evicted permanently.
const DEPRECATED_MODEL_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Grace-period deprecated models with deprecation metadata stripped.
function activeDeprecatedModels(): JsonModel[] {
  const now = Date.now();
  const result: JsonModel[] = [];
  for (const entry of Object.values(deprecatedData as Record<string, JsonModel & { deprecatedAt?: string }>)) {
    if (!entry?.id) continue;
    const removedAt = Date.parse(entry.deprecatedAt ?? "");
    if (Number.isNaN(removedAt) || now - removedAt > DEPRECATED_MODEL_TTL_MS) continue;
    const model = { ...entry } as JsonModel & { deprecatedAt?: string };
    delete model.deprecatedAt;
    result.push(model);
  }
  return result;
}

// Append grace-period deprecated models the list does not already have (live data wins).
function withDeprecated(models: JsonModel[]): JsonModel[] {
  const seen = new Set(models.map((m) => m.id));
  const extras = activeDeprecatedModels().filter((m) => !seen.has(m.id));
  return extras.length > 0 ? [...models, ...extras] : models;
}

function loadStaleModels(embeddedModels: JsonModel[]): JsonModel[] {
  const cached = loadCachedModels();
  if (!cached || cached.length === 0) return embeddedModels;

  // Merge embedded models that are missing from cache (newly added models)
  const cachedMap = new Map(cached.map(m => [m.id, m]));
  for (const em of embeddedModels) {
    if (!cachedMap.has(em.id)) {
      cached.push(em);
    }
  }
  return cached;
}

async function revalidateModels(apiKey: string | undefined, embeddedModels: JsonModel[], signal?: AbortSignal): Promise<JsonModel[] | null> {
  if (!apiKey) return null;
  const liveModels = await fetchLiveModels(apiKey, signal);
  if (!liveModels || liveModels.length === 0) return null;
  const merged = mergeWithEmbedded(liveModels, embeddedModels);
  cacheModels(merged);
  return merged;
}

// ─── API Key Resolution (via ModelRegistry) ────────────────────────────────────

let cachedApiKey: string | undefined;
let revalidateAbort: AbortController | null = null;

async function resolveApiKey(modelRegistry: ModelRegistry): Promise<void> {
  cachedApiKey = await modelRegistry.getApiKeyForProvider("opencode-go") ?? undefined;
}

// ─── Extension Entry Point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const embeddedModels = modelsData as JsonModel[];
  const customModels = customModelsData as JsonModel[];
  const patches = patchData as PatchData;

  const staleBase = loadStaleModels(embeddedModels);
  const staleModels = buildModels(staleBase, customModels, patches);

  pi.registerProvider("opencode-go", {
    name: "OpenCode Go",
    baseUrl: BASE_URL,
    apiKey: "$OPENCODE_API_KEY",
    api: "openai-completions",
    models: staleModels.map(m => ({
      id: m.id,
      name: m.name,
      api: m.api || "openai-completions",
      baseUrl: m.baseUrl,
      reasoning: m.reasoning,
      thinkingLevelMap: m.thinkingLevelMap,
      input: m.input,
      cost: m.cost,
      contextWindow: m.contextWindow ?? 131072,
      maxTokens: m.maxTokens,
      compat: m.compat,
    })),
  });

  pi.on("session_start", async (_event, ctx) => {
    revalidateAbort?.abort();
    revalidateAbort = new AbortController();
    const signal = revalidateAbort.signal;
    resolveApiKey(ctx.modelRegistry).then(() => {
      revalidateModels(cachedApiKey, embeddedModels, signal).then((freshBase) => {
        if (freshBase && !signal.aborted) {
          pi.registerProvider("opencode-go", {
            name: "OpenCode Go",
            baseUrl: BASE_URL,
            apiKey: "$OPENCODE_API_KEY",
            api: "openai-completions",
            models: buildModels(freshBase, customModels, patches).map(m => ({
              id: m.id,
              name: m.name,
              api: m.api || "openai-completions",
              baseUrl: m.baseUrl,
              reasoning: m.reasoning,
              thinkingLevelMap: m.thinkingLevelMap,
              input: m.input,
              cost: m.cost,
              contextWindow: m.contextWindow ?? 131072,
              maxTokens: m.maxTokens,
              compat: m.compat,
            })),
          });
        }
      });
    });
  });

  pi.on("session_shutdown", () => {
    revalidateAbort?.abort();
  });
}
