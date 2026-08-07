<img src="assets/mascot.png" alt="pinescript-plugin mascot: a pine tree inspecting a candlestick chart through a magnifying glass" width="150" align="right" />

# pinescript-plugin

> Pine Script v6 for coding agents — backed by a real validator, not prose.

[![Gate](https://github.com/jpantsjoha/pinescript-plugin/actions/workflows/gate.yml/badge.svg)](https://github.com/jpantsjoha/pinescript-plugin/actions/workflows/gate.yml)
[![Agent Plugins 1.0.0](https://img.shields.io/badge/Agent%20Plugins-1.0.0-blue)](https://agent-plugins.org/specification)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

---

## The problem

Ask any coding agent for a TradingView indicator and you get code that looks
right, reads fluently, and does not compile.

```pine
// Confident. Fluent. Four compile errors.
l = line.new(x1=1, y1=2, x2=3, y2=4, colour=color.red)   // it's `color`, not `colour`
plotshape(cond, shape=shape.triangleup)                   // it's `style=`, not `shape=`
v = math.clamp(x, 0, 1)                                   // math.clamp doesn't exist in Pine
b = box.new(left=1, top=2, right=3, bottom=4, textalign=text.align_left)  // box uses text_halign
```

Three things make Pine unusually hostile to a language model:

1. **Parameter names are not guessable.** `label.new` takes `textalign`. `box.new`
   takes `text_halign`. Nothing about either name implies the other.
2. **Several functions have two valid call forms.** `line.new`, `label.new` and
   `box.new` each accept a `chart.point` *or* independent coordinates. A model
   that has only seen one form will insist the other is wrong.
3. **The language keeps moving.** TradingView shipped `request.footprint()`,
   multiline strings and `calc_on_every_history_tick` in the last eighteen months —
   and *removed* the wrapped-line indentation rules in December 2025. Training data
   goes stale in both directions.

The result is a loop you have probably lived: the agent writes Pine, you paste it
into TradingView, it fails, you paste the error back, it guesses again.

## What this does about it

Gives the agent a **checker and a reference**, so it stops guessing.

### MCP tools

| Tool | What it does |
|---|---|
| `validate_pine_script` | Runs the real validator, returns structured diagnostics with line numbers |
| `lookup_pine_reference` | The actual signature of any v6 built-in — parameters, **and every overload** |

### Skills

| Skill | Covers |
|---|---|
| `pinescript-v6` | Execution model, overloaded constructors, anti-repainting, platform limits, API through July 2026 |
| `pinescript-validation` | Every diagnostic class and its deterministic fix — plus what the validator *cannot* see |
| `pinescript-indicator` | Plotting, drawing objects, tables, alerts. Three CI-validated scaffolds |
| `pinescript-strategy` | Entries, exits, risk sizing, the five traps that make a backtest lie, webhook payloads |

### Hook

Every `.pine` file the agent edits is validated automatically. Not "remember to
check your work" — an actual control.

The loop closes inside the conversation instead of across TradingView's compiler.

## Two kinds of wrong

Pine breaks in two distinct ways, and most tooling conflates them.

**Syntactic** — hallucinated functions, wrong parameter names, v4/v5/v6 mixed
together. Caused by a thin training corpus and a language that changes quarterly.
Costs a minute. **Solved here.**

**Semantic** — code that compiles perfectly and is still wrong. A repainting
signal. `ta.*` inside a conditional, silently corrupting its own history. An
accumulator missing `var`, resetting every bar. Costs a funded account:

> "one overlooked mistake — like a repainting signal or scope error — can
> invalidate months of backtesting"
> — [PickMyTrade](https://blog.pickmytrade.io/debugging-tradingview-strategies-10-common-pine-script-mistakes/)

Prose cannot fix semantic errors, because the author already believes they are
right. **Nine semantic checks are specified in [SPEC.md](./SPEC.md)** and being
implemented in the engine — repainting detection, `ta.*`-in-conditional, accumulator
state, lazy-evaluation traps, and the platform limits TradingView enforces but no
local tool counts.

## Plugin, or VS Code extension?

Both — and the distinction matters, because it is what stops the two disagreeing.

```
        pinescript-v6-validator  (npm)     ← detection lives here, once
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
  VS Code extension          this plugin
  surface: humans            surface: agents
  squiggles, hover           MCP, skills, hook
```

A check is written **once**, in the engine. The extension renders it as a squiggle;
this plugin returns it to the model. Neither reimplements it — the moment the same
rule exists twice they drift, and a drifted rule means your agent and your editor
disagree about the same file.

Skills are plugin-only: prose is useless in an editor and is the whole point for an
agent. Editor affordances — formatting, go-to-definition — stay in the extension.

## Why this one

**It shares an engine with a published VS Code extension.** The validator here is
the same one running in
[pinescript-vscode-extension](https://github.com/jpantsjoha/pinescript-vscode-extension)
— 1,400+ installs, 4.45★. So the agent and your editor cannot disagree about a file.

That engine carries:

- **457 function signatures** scraped from the official v6 reference, plus a
  hand-maintained layer for everything TradingView shipped since
- **Explicit overload modelling** — a call is valid if it satisfies *any* form
- **A golden corpus** of scripts verified to compile on TradingView, asserted to
  produce zero errors on every commit

Every Pine example in every skill is extracted and run through that validator in
CI. A skill shipping code that fails its own checker would make the whole thing
worthless, so the build blocks it.

## Install

```bash
/plugin marketplace add jpantsjoha/pinescript-plugin
/plugin install pinescript-plugin
```

The validation engine comes from
[`pinescript-v6-validator`](https://www.npmjs.com/package/pinescript-v6-validator)
on npm — no separate checkout needed.

For Claude Code:

```bash
/plugin marketplace add jpantsjoha/pinescript-plugin
/plugin install pinescript-plugin
```

It also packages for **Antigravity/Gemini** (`gemini-extension.json` + `GEMINI.md`),
**Codex** (`.agents/skills/` + `AGENTS.md`) and **Kimi** (`.kimi-plugin/`). All four
manifests are checked for consistency by `make gate`.

To develop against an unreleased engine, point at a built checkout instead:

```bash
export PINESCRIPT_VALIDATOR=/path/to/pinescript-vscode-extension
```

> **Status: early.** Four skills so far. See [CHANGELOG](./CHANGELOG.md).

## What's in it

```
skills/pinescript-v6/          execution model, overloads, anti-repainting, limits
skills/pinescript-validation/  every diagnostic class and its deterministic fix
skills/pinescript-indicator/   validated scaffolds: overlay, oscillator, drawings
skills/pinescript-strategy/    entries, exits, sizing, and the repainting traps
mcp/server.js                  validate_pine_script + lookup_pine_reference
hooks/                         validates every .pine file the agent edits
scripts/                       spec, packaging, skill, link and example validation
tests/                         MCP behaviour tests
```

`make gate` runs everything: Agent Plugins 1.0.0 conformance, multi-client
packaging consistency, skill frontmatter contracts, reference-URL resolution,
embedded Pine validation, and the MCP behaviour tests.

## Related projects

| Project | What it is |
|---|---|
| **[pinescript-vscode-extension](https://github.com/jpantsjoha/pinescript-vscode-extension)** | The VS Code extension — IntelliSense, hover docs, real-time validation. Source of the engine this plugin uses. |
| **[googlecloud-plugin](https://github.com/jpantsjoha/googlecloud-plugin)** | Same plugin architecture applied to Google Cloud delivery — solution design, security, SRE, agentic patterns. |

### Prior art

[TradersPost Pine Script plugin](https://www.claudepluginhub.com/plugins/traderspost-pinescript)
covers similar territory and is worth a look. The distinction claimed here is
narrow and checkable: a shared validation engine with a published extension, and a
CI gate that runs every documented example through it.

## Contributing

Found Pine that this validator gets wrong? That is the most valuable bug report
available — a false positive is worse than a missed error, because it puts red
marks on correct code. Open an issue with the smallest script that reproduces it.

## Author

**Jaroslav Pantsjoha**

- Website: [jpantsjoha.com](https://jpantsjoha.com)
- GitHub: [@jpantsjoha](https://github.com/jpantsjoha)
- LinkedIn: [in/johas](https://uk.linkedin.com/in/johas)

## License

MIT
