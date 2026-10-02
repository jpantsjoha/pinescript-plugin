# Run instructions

pinescript-plugin is an agent plugin for Pine Script v6: four skills, an MCP server that validates Pine and looks up the reference, and a hook that checks every `.pine` file an agent edits.

## Prerequisites

| Tool | Version | Source |
|---|---|---|
| Node.js | 20 or later (CI uses 20) | `.github/workflows/gate.yml` |
| npm | the one bundled with Node | `package-lock.json` |
| Python 3 | any recent 3.x, for the gate scripts | `Makefile` (`PYTHON := python3`) |
| make | any | `Makefile` |

The gate also needs network access: `make links` fetches the URLs the skills cite.

## Setup

```bash
git clone https://github.com/jpantsjoha/pinescript-plugin.git
cd pinescript-plugin
npm ci
make hooks          # optional: runs `make gate` before each commit
```

The validation engine is the npm package `pinescript-v6-validator`. No other checkout is needed.

## Configuration

| Variable | Used for |
|---|---|
| `PINESCRIPT_VALIDATOR` | Optional. Path to a built checkout of `jpantsjoha/pinescript-vscode-extension`. It wins over the npm engine, so you can test an unreleased engine. |

No secrets are used.

## Build

There is no build step. The server runs from source.

## Run locally

The MCP server speaks stdio. `.mcp.json` starts it with:

```bash
node ./mcp/server.js
```

To use the plugin in an agent, follow the Install section of `README.md` (Claude Code, Antigravity, Codex, Kimi). The server exposes `validate_pine_script` and `lookup_pine_reference`. The hook script is `hooks/validate-pine.sh`.

## Test

```bash
npm test            # node --test tests/*.test.js (same as `make mcp`)
make gate           # the full pre-commit gate, see below
```

`make gate` runs, in order: `spec` (Agent Plugins 1.0.0 conformance), `manifest` (four client manifests), `agents` (`.agents/skills` mirror), `skills` (SKILL.md contracts), `links` (needs network), `anchors`, `examples` (every Pine snippet in the skills is validated), and `mcp`. Run any one by name, for example `make skills`.

## Lint and typecheck

None separate. The gate is the lint.

## Project layout

- `skills/` the four skills (`.agents/skills/` is a mirror, checked by `make agents`)
- `mcp/` MCP server (`server.js`) and engine loader (`engine.js`)
- `hooks/` PostToolUse hook that validates edited `.pine` files
- `scripts/` gate scripts
- `tests/` Node test files
- `plugin.json`, `.claude-plugin/`, `gemini-extension.json`, `.kimi-plugin/`, `plugin.yaml` per-client manifests
- `.github/workflows/gate.yml` CI runs `make gate`

## Verified

Verified 2026-10-02 at ea15df5 on macOS with Node 26.0.0, npm and Python 3.14.8: install ✓ (`npm ci`), build n/a, `npm test` 37 passed, 1 skipped, 0 failed, `make gate` passed (including links and 32 embedded Pine examples validated against the npm engine). Not run: the plugin inside an agent harness.
