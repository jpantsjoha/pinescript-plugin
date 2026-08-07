# Changelog

All notable changes to this plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

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
