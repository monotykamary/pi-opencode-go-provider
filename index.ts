/**
 * opencode-go Provider Extension
 *
 * Registers opencode-go as a custom provider using the openai-completions API.
 * Base URL: https://opencode.ai/zen/go/v1
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

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerProvider("opencode-go", {
		baseUrl: "https://opencode.ai/zen/go/v1",
		apiKey: "OPENCODE_API_KEY",
		api: "openai-completions",

		models: [
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
			maxTokens: 131072,
		}
		],
	});
}
