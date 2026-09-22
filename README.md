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
- **Prompt-cache session affinity** — sends `x-opencode-session` and `x-opencode-client` so OpenCode Go can pin a session to the same cache node
- **Usage widget** — shows how much of the OpenCode Go 5h / 7d / 30d budgets you have spent, below the editor (footer status line outside the TUI). Each account carries its own budgets, so when [pi-multiprovider](https://github.com/monotykamary/pi-multiprovider) 0.8.0+ pools several `opencode-go` accounts the widget bills the session's active one and repaints on every switch or resume.

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
| DeepSeek V4 Flash | Completions | Text | 1.0M | 384K | $0.15 | $0.60 |
| DeepSeek V4 Flash Vision Exp | Completions | Text + Image | 1.0M | 384K | $0.15 | $0.60 |
| DeepSeek V4 Pro (New) | Completions | Text | 1.0M | 384K | $0.66 | $1.98 |
| DeepSeek V4.1 Flash | Completions | Text + Image | 1.0M | 384K | $0.15 | $0.60 |
| GLM-5.1 | Completions | Text | 203K | 33K | $1.40 | $4.40 |
| GLM-5.2 | Completions | Text | 1.0M | 131K | $1.40 | $4.40 |
| GLM-5.3 | Completions | Text | 1.0M | 131K | $1.40 | $4.40 |
| GLM-5.3-Flash | Completions | Text + Image | 1.0M | 131K | $0.15 | $0.50 |
| GPT-5.6 Luna | Responses | Text + Image | 1.1M | 128K | $0.20 | $1.20 |
| Grok 4.6 | Completions | Text + Image | 500K | 500K | $2.00 | $6.00 |
| Grok 4.7 | Completions | Text + Image | 500K | 500K | $2.00 | $6.00 |
| Hy3 | Completions | Text | 256K | 128K | $0.14 | $0.58 |
| Hy4 preview | Completions | Text | 1.0M | 64K | $0.83 | $2.50 |
| Kimi K2.6 | Completions | Text + Image | 262K | 66K | $0.95 | $4.00 |
| Kimi K2.7 Code | Completions | Text + Image | 262K | 262K | $0.95 | $4.00 |
| Kimi K3 (2x usage) | Completions | Text + Image | 1.0M | 131K | $3.00 | $15.00 |
| LongCat-2.0 | Completions | Text | 1.0M | 131K | $0.30 | $1.20 |
| MiMo V2.5 | Completions | Text + Image | 1.0M | 128K | $0.14 | $0.28 |
| MiMo V2.5 Pro | Completions | Text | 1.0M | 128K | $0.43 | $0.87 |
| MiMo-V2.6-Flash | Completions | Text + Image | 1.0M | 131K | $0.14 | $0.28 |
| MiMo-V2.6-Pro | Completions | Text + Image | 1.0M | 131K | $0.43 | $0.87 |
| MiniMax-M2.7 | Completions | Text | 205K | 131K | $0.30 | $1.20 |
| MiniMax-M3 | Anthropic | Text + Image | 1.0M | 131K | $0.30 | $1.20 |
| Muse Spark 1.2 Contributor | Responses | Text + Image | 1.0M | 131K | $0.10 | $0.20 |
| Muse Spark 1.3 Contributor | Responses | Text + Image | 1.0M | 131K | $0.10 | $0.20 |
| Qwen3.6 Plus | Completions | Text + Image | 1.0M | 66K | $0.50 | $3.00 |
| Qwen3.7 Max | Completions | Text | 1.0M | 66K | $2.50 | $7.50 |
| Qwen3.7 Plus | Completions | Text + Image | 1.0M | 66K | $0.40 | $1.60 |
| Qwen3.8 Flash | Anthropic | Text + Image | 1.0M | 131K | $0.15 | $0.47 |
| Qwen3.8 Max | Completions | Text + Image | 1.0M | 131K | $2.00 | $6.00 |
*Costs are per million tokens. Prices subject to change - check [opencode.ai](https://opencode.ai) for current pricing.*

## Usage

After loading the extension, use the `/model` command in pi to select your preferred model:

```
/model
```

Then select "opencode-go" as the provider and choose from the available models.

The default model for this provider is `kimi-k2.6` (matching pi core's built-in default); use `/model` to pick another.

## Usage Widget

OpenCode Go meters the plan with three dollar budgets — a rolling 5-hour window,
a weekly window and a monthly window. The extension polls
`GET https://opencode.ai/zen/go/v1/usage` with your API key and shows how much of
each budget is **left**, below the editor. When no terminal UI is attached (print
or JSON mode) the same line goes to the footer status bar instead.

```
Usage: 5h: 63% · 7d: 41% · 30d: 12% · 5h ↺ 2h14m · 7d ↺ 3d20h · 30d ↺ 20d0h
```

The line matches the pi-better-openai usage line: the remaining percentages come
first, then a countdown per window. Countdowns only — three windows with three
wall-clock reset times run past the terminal width, and `/opencode-go-usage`
lists the exact local reset time for each. Colours track what is left — green,
amber at 30% or less, red at 10% or less or when a window reports
`rate-limited` — and the widget only appears while an `opencode-go` model is
selected. The Go API publishes no banked reset credits,
so that trailing segment appears only if a response ever carries a
`bankedResets` count.

```
/opencode-go-usage            # refresh and show the full breakdown
/opencode-go-usage refresh    # same, but always re-reads the API
/opencode-go-usage off        # hide the widget (persisted)
/opencode-go-usage on         # show it again
/opencode-go-usage debug      # config, last fetch/error, endpoint
/opencode-go-usage glyphs auto|unicode|ascii   # footer glyph set (persisted)
```

Polling runs every 60 seconds, plus after every turn and whenever the selected
model changes. Settings are read from `~/.pi/agent/opencode-go-provider.json`:

```json
{
  "usage": {
    "enabled": true,
    "refreshIntervalMs": 60000,
    "showOnlyOnProvider": true,
    "showResetTimes": true,
    "placement": "belowEditor",
    "glyphs": "auto"
  }
}
```

`placement` accepts `belowEditor` (default) or `aboveEditor`. Every key is
optional; `/opencode-go-usage on|off` writes only `enabled`.

`glyphs` accepts `auto` (default), `unicode`, or `ascii`. Older mintty/Cygwin builds measure ambiguous-width codepoints (the `·` separators, the `↺` reset marker) with their own cell-width tables, which can shift the row and desync pi’s renderer. `auto` switches the widget to ASCII equivalents on those terminals and the widget never paints the terminal’s last column; an explicit `unicode` is clamped to ASCII for widget content there (the status line is not row-budgeted and keeps the choice).

### Pooled accounts

When [pi-multiprovider](https://github.com/monotykamary/pi-multiprovider)
0.8.0+ pools several `opencode-go` accounts, usage reads bill the session's
active account instead of Pi's default credential: every account has its own
5h / 7d / 30d budgets. The widget also repaints when the account changes,
including when a resumed session restores the account last chosen with
`/switch-account`, rather than showing the previous account until the next
poll. Without pi-multiprovider nothing changes: the widget bills the key from
the resolution order above.

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
| `OPENCODE_API_KEY` | No | Your opencode.ai API key (fallback if not in auth.json). Also used for usage requests |
| `OPENCODE_GO_USAGE` | No | Set to `off`/`false`/`0` to disable the usage widget without editing the config file |
| `OPENCODE_GO_USAGE_INTERVAL_MS` | No | Override the usage poll interval (clamped to 15s–10m) |

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
