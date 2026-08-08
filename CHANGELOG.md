# Changelog

All notable changes to this plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

---

## [0.4.1] - 2026-08-08

### Fixed — found by cross-harness UAT and an adversarial coherence review

- **Codex discovered zero skills** while reporting a successful install.
  `.agents/skills` was a symlink; installers copy rather than clone, so it arrived
  empty. Now real files, kept in step by `scripts/sync_agents_skills.py` and gated.
- **The hook never tried the npm engine.** It resolved only local checkouts of the
  extension repo, so on any normal install it found nothing and exited silently —
  while the README promised "an actual control".
- `PLUGIN.md` still demanded a built checkout of the extension, contradicting the
  README. It listed one skill when four ship, and "both diagnostic paths" when
  there are three.
- `pinescript-strategy` told agents the validator "cannot catch any of the traps
  below" — two of which are now S1 and S2 and *are* caught. An agent would have
  discounted a live finding as out of scope.
- `pinescript-validation` documented S3 and S4 as shipping checks with remedies.
  Neither is implemented; both are now struck through and flagged as check-by-eye.
- Version was 0.4.0 in five manifests but 0.1.0 in `package.json`, `PLUGIN.md`,
  the MCP server and three skill files, with no 0.4.0 changelog entry at all.

## [0.4.0] - 2026-08-07

### Added

- MCP server surfaces semantic findings from engine 0.2.0 with `// pine-ignore`
  honoured. Each carries a `check` field; its absence marks a syntactic diagnostic,
  which cannot be suppressed.
- `pinescript-validation` documents every check and its remedy.

## [0.3.0] - 2026-08-07

### Added

- **`skills/pinescript-strategy`** — entries, exits, position sizing, and the five
  traps that make a backtest lie. Built from user evidence rather than assumption:
  practitioners report that *"one overlooked mistake — like a repainting signal or
  scope error — can invalidate months of backtesting"*
  ([PickMyTrade](https://blog.pickmytrade.io/debugging-tradingview-strategies-10-common-pine-script-mistakes/)).
  Covers repainting, unconfirmed-bar entries, `ta.*` in conditionals, the v6
  lazy-evaluation trap, and optimistic fill assumptions — every one of which
  compiles cleanly and is still wrong.
- Two CI-validated scaffolds: `basic-strategy` and `risk-managed-strategy`, the
  latter with ATR stops, risk-based sizing and webhook JSON payloads for broker
  automation (TradersPost / PickMyTrade shape).

### Notable

Competitive research (`_plugin/research/COMPETITIVE-LANDSCAPE.md`) found that every
comparable AI tool is prose-only — none can check the code it emits. Two failure
modes exist and the industry conflates them: syntactic errors, which a validator
solves, and semantic errors that compile perfectly and are still wrong. The
expensive failures are all semantic.

Embedded Pine examples validated in CI: 14 -> 22.

---

## [0.2.0] - 2026-08-07

### Added

- **`skills/pinescript-validation`** — every diagnostic class the validator emits,
  with its deterministic fix. Includes an explicit *what the validator cannot see*
  section (type compatibility, runtime logic, repainting, platform limits), because
  a clean run is not proof a script is correct, and a workflow for auditing an
  existing codebase of broken `.pine` files.
- **`skills/pinescript-indicator`** — three scaffolds validated in CI
  (`overlay-indicator`, `oscillator`, `drawing-objects`) covering plotting, drawing
  objects with cleanup, tables, alerts and the plot/object caps. Copy a scaffold
  rather than composing from memory: composing from recollection is how wrong
  parameter names get in.
- **`hooks/validate-pine.sh`** — PostToolUse hook validating every `.pine` file the
  agent edits. Real installs into Claude Code and Antigravity both reported
  `Hooks: 0`; the plugin told agents to validate and shipped nothing to enforce it.

### Changed

- **The engine now comes from npm.** `pinescript-v6-validator@0.1.0` is published,
  so the plugin no longer requires a local checkout of the VS Code extension. The
  on-disk fallbacks remain for developing against unreleased engine changes.
- Corrected the description in all five manifests. It advertised skills that did
  not exist — promising components the package does not ship.

### Verified

Installed for real into Claude Code (`Skills 3 · Hooks 1 · MCP 1`) and Antigravity.
Packaging consistency across all four harness manifests is now enforced by
`make gate`. 14 embedded Pine examples validated in CI, up from 4.

---

## [0.1.0] - 2026-08-07

Initial release. Scaffold plus the first skill and a working MCP server.

### Added

- **Agent Plugins 1.0.0 conformance** — `plugin.json` and `mcp.json` at the plugin
  root, closed schema, MCP declared out of band. `.claude-plugin/` manifests for
  Claude Code.
- **`skills/pinescript-v6`** — execution model (`var`, `:=`, why `ta.*` must run
  unconditionally), the two call forms of `line.new` / `label.new` / `box.new`,
  anti-repainting with `request.security`, platform limits, and the API TradingView
  shipped through July 2026 — including rules it *removed*.
- **MCP server** with two tools:
  - `validate_pine_script` — runs both diagnostic paths, so its verdict matches
    what the VS Code extension shows
  - `lookup_pine_reference` — real signatures with overloads surfaced explicitly,
    and near-miss suggestions when a symbol is not found
- **`make gate`** — spec conformance, skill contracts, reference-URL resolution,
  embedded Pine example validation, and MCP behaviour tests. Wired as a pre-commit
  hook via `make hooks`, and run in CI.
- **14 MCP behaviour tests**, including one asserting both diagnostic sources are
  wired in and one covering `alertcondition` messages containing commas.

### Notable

`scripts/validate_skill_examples.py` extracts every ```pine block from every skill
and runs it through the real validator. Contrast blocks are split at the
WRONG/RIGHT boundary so the correct half is validated rather than the whole block
being skipped. When the engine cannot be located it skips **loudly** — an
unverified example must never look verified.

### Known limitations

- **One skill.** `pinescript-validation`, `pinescript-strategy` and
  `pinescript-indicator` are planned.
- **The engine is not published to a package registry.** The plugin locates it on
  disk, so it requires a local checkout of `pinescript-vscode-extension`. Until
  that is resolved this is not ready for a plugin-hub listing.
- No mascot or illustrative assets yet.
