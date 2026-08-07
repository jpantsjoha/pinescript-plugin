# pinescript-plugin

> Pine Script v6 skills and MCP tooling for coding agents — backed by a real
> validator, not prose.

**Status: placeholder.** Under active construction. See
[SCOPE](#scope) for what is planned and
[pinescript-vscode-extension](https://github.com/jpantsjoha/pinescript-vscode-extension)
for the engine this will be built on.

---

## What this will be

An [Agent Plugins 1.0.0](https://agent-plugins.org/specification) plugin giving a
coding agent working knowledge of TradingView Pine Script v6:

- **Skills** — language rules, validation workflow, strategy and indicator
  patterns, anti-repainting, v5 → v6 migration
- **MCP server** — `validate_pine_script` and `lookup_pine_reference`, so an agent
  can check its own Pine and ground parameter names in the real reference instead
  of guessing

## Why it exists

Agents write Pine confidently and wrongly — inventing parameter names, missing that
`line.new` has two overloads, reaching for functions TradingView removed. Prose
guidance does not fix that. A validator does.

## Scope

| Component | Purpose |
|---|---|
| `skills/` | Pine v6 language, validation loop, strategy/indicator patterns |
| `mcp/` | Validation + reference-lookup server over stdio |
| `plugin.json` / `mcp.json` | Agent Plugins 1.0.0 manifests |

## Related projects

| Project | What it is |
|---|---|
| **[pinescript-vscode-extension](https://github.com/jpantsjoha/pinescript-vscode-extension)** | The VS Code extension — IntelliSense, hover docs and real-time validation for Pine v6. Publishes the validation engine this plugin consumes, so an agent and the editor never disagree. |
| **[googlecloud-plugin](https://github.com/jpantsjoha/googlecloud-plugin)** | Same plugin architecture, applied to Google Cloud delivery. |

### Prior art

[TradersPost Pine Script plugin](https://www.claudepluginhub.com/plugins/traderspost-pinescript)
covers similar ground. This one differs in being backed by the validation engine of
a published VS Code extension — a shared golden corpus of scripts verified to
compile on TradingView, rather than guidance alone.

## Author

**Jaroslav Pantsjoha**

- Website: [jpantsjoha.com](https://jpantsjoha.com)
- GitHub: [@jpantsjoha](https://github.com/jpantsjoha)
- LinkedIn: [in/johas](https://uk.linkedin.com/in/johas)

## License

MIT
