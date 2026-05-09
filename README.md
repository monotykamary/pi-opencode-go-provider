# pi-opencode-go-provider

A [pi](https://github.com/badlogic/pi-mono) extension that registers [opencode-go](https://opencode.ai/) as a custom provider. Access fast, efficient GLM, Kimi, and MiniMax models optimized for speed through a unified API.

## Features

- **12 Optimized AI Models** - GLM-5, Kimi K2.5, and MiniMax M2.5
- **Fast & Efficient** - Go-optimized endpoints for lower latency
- **Unified API** via opencode.ai's OpenAI-compatible completions endpoint
- **Cost Tracking** with per-model pricing for budget management
- **Reasoning Models** support for advanced reasoning capabilities
- **Vision Support** for image-capable models

## Installation

### Option 1: Using `pi install` (Recommended)

Install directly from GitHub:

```bash
pi install git:github.com/monotykamary/pi-opencode-go-provider
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

| Model | Type | Context | Max Tokens | Input Cost | Output Cost |
|-------|------|---------|------------|------------|-------------|
| DeepSeek V4 Flash | Text | 1.0M | 384K | $0.14 | $0.28 |
| DeepSeek V4 Pro | Text | 1.0M | 384K | $1.74 | $3.48 |
| GLM-5 | Text | 203K | 33K | $1.00 | $3.20 |
| GLM-5.1 | Text | 203K | 33K | $1.40 | $4.40 |
| Kimi K2.5 | Text + Image | 262K | 66K | $0.60 | $3.00 |
| Kimi K2.6 | Text + Image | 262K | 66K | $0.95 | $4.00 |
| MiMo V2.5 | Text + Image | 1.0M | 128K | $0.40 | $2.00 |
| MiMo V2.5 Pro | Text | 1.0M | 128K | $1.00 | $3.00 |
| MiniMax M2.5 | Text | 205K | 66K | $0.30 | $1.20 |
| MiniMax M2.7 | Text | 205K | 131K | $0.30 | $1.20 |
| Qwen3.5 Plus | Text + Image | 262K | 66K | $0.20 | $1.20 |
| Qwen3.6 Plus | Text + Image | 262K | 66K | $0.50 | $3.00 |
*Costs are per million tokens. Prices subject to change - check [opencode.ai](https://opencode.ai) for current pricing.*

## Usage

After loading the extension, use the `/model` command in pi to select your preferred model:

```
/model
```

Then select "opencode-go" as the provider and choose from the available models.

## Authentication

The opencode-go API key can be configured in multiple ways (resolved in this order):

1. **`auth.json`** (recommended) — Add to `~/.pi/agent/auth.json`:
   ```json
   { "opencode-go": { "type": "api_key", "key": "your-api-key" } }
   ```
   The `key` field supports literal values, env var names, and shell commands (prefix with `!`). See [pi's auth file docs](https://github.com/badlogic/pi-mono) for details.
2. **Runtime override** — Use the `--api-key` CLI flag
3. **Environment variable** — Set `OPENCODE_API_KEY`

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
