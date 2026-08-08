# pinescript-v6 — references

Authoritative sources for this skill. Verify against these before encoding a rule;
Pine changes, and rules get **removed** as well as added.

| Source | Use for |
|---|---|
| [v6 Language Reference](https://www.tradingview.com/pine-script-reference/v6/) | Exact signatures, including overloads |
| [User Manual](https://www.tradingview.com/pine-script-docs/) | Execution model, type system, concepts |
| [Release Notes](https://www.tradingview.com/pine-script-docs/release-notes/) | What changed and when — check before calling a symbol invalid |
| [Migration to v6](https://www.tradingview.com/pine-script-docs/migration-guides/to-pine-version-6/) | v5 → v6 differences |
| [Limitations](https://www.tradingview.com/pine-script-docs/writing/limitations/) | Plot, request and size caps |

## Signature data

The `lookup_pine_reference` MCP tool answers from the dataset maintained in
[pinescript-vscode-extension](https://github.com/jpantsjoha/pinescript-vscode-extension)
— 457 function signatures scraped from the official reference, plus a hand-verified
layer covering API released since the scrape.

Prefer that tool over recalling a signature from memory. Parameter names are the
most common source of Pine compile errors, and they are not guessable.
