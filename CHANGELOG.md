# Changelog

All notable changes to this plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### The plugin now runs engine 0.4.3, not 0.3.0

`package.json` pinned `pinescript-v6-validator` at `^0.3.0`. For a 0.x version that
range admits only 0.3.x, so the MCP tool, the hook and the example gate ran engine
0.3.0 and missed every 0.4.x fix while the VS Code extension shipped them. The pin
is now `^0.4.3` (lockfile resolves 0.4.3). What that brings, checked against the
installed package:

- **S10** (info hint): a hard-coded external feed in `request.*()` without
  `ignore_invalid_symbol`. Checks now ship as S1-S3 and S5-S10; S4 is still
  specified and not built.
- **Invalid-cast rule**: `int x = input.float(1.0)` is an error.
- **Constant-namespace members are checked**: `color.purplee`, `shape.trianglup`,
  `plot.style_circlez`, `barstate.islastt` are errors. Variables in open
  namespaces (`syminfo.*`, `timeframe.*`, `chart.*`) are still not checked.
- Wrapped statements are joined before validation, and many false-positive fixes.
- The function reference grows from 457 to 475 entries.

`tests/engine-version.test.js` pins this down: the invalid-cast and
misspelled-constant probes fail on 0.3.0 and pass on 0.4.3, each with a paired
"still clean" case.

### Local-checkout fallback finds the current engine layout

The extension's single-engine change removed `dist/src/parser/*` and `dist/v6/*`,
so the fallback in the MCP server, the hook and the example gate could no longer
find a checkout. All three now share one resolver, `mcp/engine.js`, which tries
`dist/engine/index.js`, then `packages/validator/dist/index.js`, and returns the
same shape as the npm branch (including `validatePineScript`).
`PINESCRIPT_VALIDATOR`, when set, now wins over the npm package — an override that
npm silently beat would test the wrong engine. `scripts/validate_pine.js` is the
headless CLI the hook and `make examples` call.

### Changed

- `make examples` validates against the plugin's own engine instead of requiring
  an extension checkout, so the gate no longer fails on machines without one.
- README, SPEC, the validation skill and the manifests' "457-function" figure
  updated to the 0.4.3 facts above.

## [0.4.3] - 2026-08-08

### The accumulator guidance was the inverse of the bug

A user hit a defect the whole stack missed: a `var` total re-accumulated by a loop
on every bar, which grows for the life of the chart. The skills' advice — "declare
accumulators `var` so they persist" — is correct for a running total and is exactly
what produces this. Run the old checklist against the broken code and every item
ticks.

No skill mentioned `for` or `while` anywhere, so a reader had nothing to catch the
loop shapes with. All three skills now cover both directions and ask the question
that decides it: **does the accumulator's lifetime match its meaning?** "Total so
far" wants `var`; "total for this bar" must not have it.

Now detected as **S3** in `pinescript-v6-validator@0.3.0`, pinned here.

### Honest omissions added to "What the validator CANNOT see"

That table implied name-checking was covered. It is not:

- **Constant and built-in-variable names are never checked.** `shape.trianglup`,
  `color.grene` and `plot.style_circlez` all validate clean and all fail on
  TradingView. Only *parameter* names are checked, never the values.
  `lookup_pine_reference` covers functions only, so `found: false` for
  `barstate.islast` means "not a function", not "not real".
- **Re-declaring a name with `=`** is a TradingView error and passes here.
- **`ta.*` on the right of `and`/`or`** escapes S2, because v6 short-circuits.

### Gate hardening

- `validate_skill_examples.py` returned 0 when the engine was absent, so a local
  `make gate` printed "Gate passed" over **zero** validated examples. It now fails
  unless `--allow-skip` is passed deliberately.
- The five scaffolds advertised as "validated in CI" were opened by no script at
  all — true by luck, not enforcement. Now validated as whole files: 31 examples,
  5 of them scaffolds.
- New `make anchors` resolves every semantic check's `docAnchor` against real skill
  headings, using the **installed** engine. Four of nine were dead when it was
  written, including S1's — the most-cited defect in Pine Script. The engine's own
  test asserted `docAnchor.includes('#')`, which all four dead links passed.

### Skills now reference each other

Previously none did, so an agent that loaded `pinescript-v6` never learned the
validated scaffolds existed two directories away. The `PostToolUse` hook is now
documented, so agents stop redundantly re-validating after every write.

Added a screenshot of Antigravity auditing a script through the plugin.

---

## [0.4.2] - 2026-08-08

### Changed

- Requires `pinescript-v6-validator@^0.2.1`, which repairs three checks that each
  worked on their happy path and silently missed a shape occurring constantly in
  real code:
  - **S1** skipped **every multi-line `request.security()`**. Wrapping is the
    normal formatting for that function, so most real repainting went undetected.
  - **S2** checked only the *true* branch of a ternary.
  - **S9** counted `strategy.cancel` as an exit. Cancel withdraws a pending order;
    it does not close a position.

  v0.4.1 was tagged before that engine fix landed, so hub installs picked up the
  broken checks. This release exists to correct that.

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
