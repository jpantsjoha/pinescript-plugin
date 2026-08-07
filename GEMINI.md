# GEMINI.md — pinescript-plugin (always-on rules)

> Validate before you claim it works.

Always-on context for this plugin on Antigravity. The depth lives in
`skills/pinescript-v6/`; this file carries the contract.

## The rule

**Never hand back Pine Script you have not validated.** Call
`validate_pine_script` first. If the MCP server is unavailable, say the script is
unvalidated rather than implying it compiles.

## Do not guess parameter names

Call `lookup_pine_reference` instead. Pine parameter names are not inferable:
`label.new` takes `textalign`, `box.new` takes `text_halign`, and `plotshape` takes
`style=` rather than `shape=`. Guessing is the commonest source of Pine compile
errors.

## Overloads are real

`line.new`, `label.new` and `box.new` each accept **two** valid call forms — a
`chart.point` object, or independent coordinates. Do not "correct" one into the
other.

## The language moves in both directions

TradingView adds API (`request.footprint()`, multiline strings,
`calc_on_every_history_tick`) and **removes rules** — wrapped-line indentation
restrictions went in December 2025. Check the
[release notes](https://www.tradingview.com/pine-script-docs/release-notes/) before
declaring a symbol invalid.

## Execution model

Scripts run once per bar. `var` persists, plain assignment resets. `ta.*` functions
carry state and must execute on every bar — never inside a ternary or `if` branch.
