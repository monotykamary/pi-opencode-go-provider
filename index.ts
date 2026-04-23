/**
 * opencode-go Provider Extension
 *
 * Registers opencode-go as a custom provider using the openai-completions API.
 * Base URL: https://opencode.ai/zen/go/v1
 *
 * Usage:
 *   # Option 1: Store in auth.json (recommended)
 *   # Add to ~/.pi/agent/auth.json:
 *   #   "opencode-go": { "type": "api_key", "key": "your-api-key" }
 *
 *   # Option 2: Set as environment variable
 *   export OPENCODE_API_KEY=your-api-key
 *
 *   # Run pi with the extension
 *   pi -e /path/to/pi-opencode-go-provider
 *
 * Then use /model to select from available models
 */

import type { AuthStorage, ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── API Key Resolution (via AuthStorage) ────────────────────────────────────

/**
 * Cached API key resolved from AuthStorage.
 *
 * Pi's core resolves the key via AuthStorage.getApiKey() before making requests,
 * but we also cache it here so we can resolve it in contexts where the resolved
 * key isn't directly available (e.g. future features like quota fetching) and
 * to make the AuthStorage dependency explicit.
 *
 * Resolution order (via AuthStorage.getApiKey):
 *   1. Runtime override (CLI --api-key)
 *   2. auth.json stored credentials (manual entry in ~/.pi/agent/auth.json)
 *   3. OAuth tokens (auto-refreshed)
 *   4. Environment variable (OPENCODE_API_KEY)
 *   5. Fallback resolver
 */
let cachedApiKey: string | undefined;

/**
 * Resolve the opencode-go API key via AuthStorage and cache the result.
 * Called on session_start and whenever ctx.modelRegistry.authStorage is available.
 */
async function resolveApiKey(authStorage: AuthStorage): Promise<void> {
  const key = await authStorage.getApiKey("opencode-go");
  cachedApiKey = key ?? process.env.OPENCODE_API_KEY;
}

export default function (pi: ExtensionAPI) {
  // Resolve API key via AuthStorage on session start
  pi.on("session_start", async (_event, ctx) => {
    await resolveApiKey(ctx.modelRegistry.authStorage);
  });

	pi.registerProvider("opencode-go", {
		baseUrl: "https://opencode.ai/zen/go/v1",
		apiKey: "OPENCODE_API_KEY",
		api: "openai-completions",

		models: [
		{
			id: "minimax-m2.7",
			name: "MiniMax M2.7",
			reasoning: true,
			input: ["text"],
			cost: {
				input: 0.3,
				output: 1.2,
				cacheRead: 0.06,
				cacheWrite: 0,
			},
			contextWindow: 204800,
			maxTokens: 131072,
		},
		{
			id: "kimi-k2.5",
			name: "Kimi K2.5",
			reasoning: true,
			input: ["text","image","video"],
			cost: {
				input: 0.6,
				output: 3,
				cacheRead: 0.1,
				cacheWrite: 0,
			},
			contextWindow: 262144,
			maxTokens: 65536,
		},
		{
			id: "glm-5",
			name: "GLM-5",
			reasoning: true,
			input: ["text"],
			cost: {
				input: 1,
				output: 3.2,
				cacheRead: 0.2,
				cacheWrite: 0,
			},
			contextWindow: 204800,
			maxTokens: 131072,
		},
		{
			id: "mimo-v2-omni",
			name: "MiMo V2 Omni",
			reasoning: true,
			input: ["text","image","audio","pdf"],
			cost: {
				input: 0.4,
				output: 2,
				cacheRead: 0.08,
				cacheWrite: 0,
			},
			contextWindow: 262144,
			maxTokens: 64000,
		},
		{
			id: "qwen3.6-plus",
			name: "Qwen3.6 Plus",
			reasoning: true,
			input: ["text","image","video"],
			cost: {
				input: 0.5,
				output: 3,
				cacheRead: 0.05,
				cacheWrite: 0.625,
			},
			contextWindow: 262144,
			maxTokens: 65536,
		},
		{
			id: "glm-5.1",
			name: "GLM-5.1",
			reasoning: true,
			input: ["text"],
			cost: {
				input: 1.4,
				output: 4.4,
				cacheRead: 0.26,
				cacheWrite: 0,
			},
			contextWindow: 204800,
			maxTokens: 131072,
		},
		{
			id: "minimax-m2.5",
			name: "MiniMax M2.5",
			reasoning: true,
			input: ["text"],
			cost: {
				input: 0.3,
				output: 1.2,
				cacheRead: 0.03,
				cacheWrite: 0,
			},
			contextWindow: 204800,
			maxTokens: 65536,
		},
		{
			id: "mimo-v2-pro",
			name: "MiMo V2 Pro",
			reasoning: true,
			input: ["text"],
			cost: {
				input: 1,
				output: 3,
				cacheRead: 0.2,
				cacheWrite: 0,
			},
			contextWindow: 1048576,
			maxTokens: 64000,
		},
		{
			id: "qwen3.5-plus",
			name: "Qwen3.5 Plus",
			reasoning: true,
			input: ["text","image","video"],
			cost: {
				input: 0.2,
				output: 1.2,
				cacheRead: 0.02,
				cacheWrite: 0.25,
			},
			contextWindow: 262144,
			maxTokens: 65536,
		}
		],
	});
}
