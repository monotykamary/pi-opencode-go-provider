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
			id: "mimo-v2.5-pro",
			name: "MiMo V2.5 Pro",
			reasoning: true,
			input: ["text"],
			cost: {
				input: 1,
				output: 3,
				cacheRead: 0.2,
				cacheWrite: 0,
			},
			contextWindow: 1048576,
			maxTokens: 128000,
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
			maxTokens: 128000,
		},
		{
			id: "mimo-v2.5",
			name: "MiMo V2.5",
			reasoning: true,
			input: ["text","image","audio","pdf"],
			cost: {
				input: 0.4,
				output: 2,
				cacheRead: 0.08,
				cacheWrite: 0,
			},
			contextWindow: 262144,
			maxTokens: 128000,
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
			id: "deepseek-v4-flash",
			name: "DeepSeek V4 Flash",
			reasoning: true,
			input: ["text"],
			cost: {
				input: 0.14,
				output: 0.28,
				cacheRead: 0.028,
				cacheWrite: 0,
			},
			contextWindow: 1000000,
			maxTokens: 384000,
		},
		{
			id: "kimi-k2.6",
			name: "Kimi K2.6 (3x limits)",
			reasoning: true,
			input: ["text","image","video"],
			cost: {
				input: 0.32,
				output: 1.34,
				cacheRead: 0.054,
				cacheWrite: 0,
			},
			contextWindow: 262144,
			maxTokens: 65536,
		},
		{
			id: "deepseek-v4-pro",
			name: "DeepSeek V4 Pro",
			reasoning: true,
			input: ["text"],
			cost: {
				input: 1.74,
				output: 3.48,
				cacheRead: 0.145,
				cacheWrite: 0,
			},
			contextWindow: 1000000,
			maxTokens: 384000,
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
			maxTokens: 128000,
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
