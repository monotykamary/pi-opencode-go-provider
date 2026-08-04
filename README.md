<div align="center">

# 🟢 pi-opencode-go-provider

**Fast GLM, Kimi & MiniMax via [opencode-go](https://opencode.ai/)**

_Go-optimized endpoints for lower latency — 14+ models for [pi](https://github.com/earendil-works/pi-coding-agent)._

[![pi extension](https://img.shields.io/badge/pi-extension-blueviolet)](https://github.com/earendil-works/pi-coding-agent)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

</div>

---

## Features

- **14+ Optimized AI Models** - DeepSeek, GLM, Kimi, MiMo, MiniMax, and Qwen
- **Multi-API Support** — uses the correct API protocol per model (Anthropic, OpenAI Completions)
- **Fast & Efficient** - Go-optimized endpoints for lower latency
- **Cost Tracking** with per-model pricing for budget management
- **Reasoning Models** with thinking level maps for proper effort control

## Installation

### Option 1: Using `pi install` (Recommended)

Install directly from GitHub:

```bash
pi install https://github.com/monotykamary/pi-opencode-go-provider
```

Then set your API key and run pi:
```bash
# Recommended: add to auth.json
# See Authentication section below

# Or set as environment variable
export OPENCODE_API_KEY=your-api-key-here

pi
```

### Option 2: Manual Clone

1. Clone this repository:
   ```bash
   git clone https://github.com/monotykamary/pi-opencode-go-provider.git
   cd pi-opencode-go-provider
   ```

2. Set your opencode API key:
   ```bash
   # Recommended: add to auth.json
   # See Authentication section below

   # Or set as environment variable
   export OPENCODE_API_KEY=your-api-key-here
   ```

3. Run pi with the extension:
   ```bash
   pi -e /path/to/pi-opencode-go-provider
   ```

## Available Models

| Model | API | Type | Context | Max Tokens | Input Cost | Output Cost |
|-------|-----|------|---------|------------|------------|-------------|
| DeepSeek V4 Flash | Completions | Text | 1.0M | 384K | $0.14 | $0.28 |
| DeepSeek V4 Pro | Completions | Text | 1.0M | 384K | $0.43 | $0.87 |
| GLM-5.1 | Completions | Text | 203K | 33K | $1.40 | $4.40 |
| GLM-5.2 | Completions | Text | 1.0M | 131K | $1.40 | $4.40 |
| GPT-5.6 Luna (2x usage) | Completions | Text + Image | 1.1M | 128K | $0.10 | $0.60 |
| Grok 4.5 | Responses | Text + Image | 500K | 500K | $2.00 | $6.00 |
| Hy3 | Completions | Text | 256K | 64K | $0.14 | $0.58 |
| Kimi K2.6 | Completions | Text + Image | 262K | 66K | $0.95 | $4.00 |
| Kimi K2.7 Code | Completions | Text + Image | 262K | 262K | $0.95 | $4.00 |
| Kimi K3 (2x usage) | Completions | Text + Image | 1.0M | 131K | $3.00 | $15.00 |
| MiMo V2.5 | Completions | Text + Image | 1.0M | 128K | $0.14 | $0.28 |
| MiMo V2.5 Pro | Completions | Text | 1.0M | 128K | $0.43 | $0.87 |
| MiniMax-M2.7 | Completions | Text | 205K | 131K | $0.30 | $1.20 |
| MiniMax-M3 | Anthropic | Text + Image | 1.0M | 131K | $0.30 | $1.20 |
| Qwen3.6 Plus | Completions | Text + Image | 1.0M | 66K | $0.50 | $3.00 |
| Qwen3.7 Max | Anthropic | Text | 1.0M | 66K | $2.50 | $7.50 |
| Qwen3.7 Plus | Anthropic | Text + Image | 1.0M | 66K | $0.40 | $1.60 |
| Qwen3.8 Max | Anthropic | Text + Image | 1.0M | 131K | $2.00 | $6.00 |
*Costs are per million tokens. Prices subject to change - check [opencode.ai](https://opencode.ai) for current pricing.*

## Usage

After loading the extension, use the `/model` command in pi to select your preferred model:

```
/model
```

Then select "opencode-go" as the provider and choose from the available models.

The default model for this provider is `kimi-k2.6` (matching pi core's built-in default); use `/model` to pick another.

## Authentication

The opencode-go API key can be configured in multiple ways. Credentials are resolved in this order:

1. **CLI flag** — `--api-key` (highest priority, runtime override)
2. **`auth.json`** (recommended) — Add to `~/.pi/agent/auth.json`:
   ```json
   { "opencode-go": { "type": "api_key", "key": "your-api-key" } }
   ```
   The `key` field supports literals, `$ENV_VAR`/`${ENV_VAR}` interpolation, and `!command` execution. See [pi's providers docs](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/providers.md) for details.
3. **Environment variable** — `OPENCODE_API_KEY`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENCODE_API_KEY` | No | Your opencode.ai API key (fallback if not in auth.json) |

## Configuration

Add to your pi configuration for automatic loading:

```json
{
  "extensions": [
    "/path/to/pi-opencode-go-provider"
  ]
}
```

## License

MIT
