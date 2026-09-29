---
name: pinescript-plugin
description: "TradingView Pine Script v6 for coding agents, backed by a real validator rather than prose. A language skill plus an MCP server that validates Pine and returns real signatures from the official 475-function reference — including the overloads models routinely get wrong — and a hook that checks every .pine file the agent edits."
version: "0.5.0"
---

# pinescript-plugin

## What it installs

| Component | Purpose |
|---|---|
| `skills/pinescript-v6` | Execution model, overloaded constructors, anti-repainting, platform limits, API through July 2026 |
| `skills/pinescript-validation` | Every diagnostic and its deterministic fix |
| `skills/pinescript-indicator` | Plotting, drawing objects, tables, alerts — three CI-validated scaffolds |
| `skills/pinescript-strategy` | Entries, exits, sizing, and the traps that make a backtest lie |
| MCP `validate_pine_script` | Runs all three diagnostic sources — matches what the VS Code extension shows |
| MCP `lookup_pine_reference` | Real signatures, every overload, near-miss suggestions |

## The contract

**Validate before claiming a script works.** An unvalidated script is described as
unvalidated, never implied to compile.

**Look signatures up rather than recalling them.** Pine parameter names are not
inferable — `label.new` takes `textalign`, `box.new` takes `text_halign`,
`plotshape` takes `style=` not `shape=`.

**A false positive is worse than a missed error.** Any change to validation is
proved in both directions.

## Client support

| Client | Manifest | Context file |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, `.mcp.json` | `CLAUDE.md` (n/a — skills carry it) |
| Antigravity / Gemini | `gemini-extension.json` | `GEMINI.md` |
| Codex | `.agents/skills/` (symlink) | `AGENTS.md` |
| Kimi | `.kimi-plugin/plugin.json` | — |
| Agent Plugins 1.0.0 | `plugin.json`, `mcp.json` | — |

## Requirements

None beyond the plugin itself — the validation engine comes from
[`pinescript-v6-validator`](https://www.npmjs.com/package/pinescript-v6-validator)
on npm. To develop against an unreleased engine, point `PINESCRIPT_VALIDATOR` at a
built checkout of the extension instead.

## Verification

`make gate` — Agent Plugins conformance, multi-client packaging, skill contracts,
reference-URL resolution, embedded Pine example validation, MCP behaviour tests.
