---
name: pinescript-v6
description: "Write and debug TradingView Pine Script v6 correctly. Covers the execution model, the v6 type system, overloaded drawing constructors, anti-repainting with request.security, and the API TradingView shipped through 2026. Validate every script before claiming it works. Use when the user mentions: pine script, pinescript, tradingview indicator, tradingview strategy, .pine file, write an indicator, backtest a strategy, plot on chart, alertcondition, request.security, repainting."
license: MIT
metadata:
  "pinescript-plugin/version": "0.5.0"
  "pinescript-plugin/triggers": "pine script, pinescript, tradingview indicator, tradingview strategy, .pine file, write an indicator, backtest a strategy, plot on chart, alertcondition, request.security, repainting"
  "pinescript-plugin/pine-version": "v6"
---

# Pine Script v6

## Validate before you claim it works

Pine fails at compile time in ways that read fine on the page. Never hand back a
script you have not checked.

```
validate_pine_script    # MCP tool — returns structured errors with line numbers
lookup_pine_reference   # MCP tool — real signature for any v6 symbol
```

If the MCP server is unavailable, say the script is unvalidated rather than
implying it compiles.

**Do not guess parameter names.** `lookup_pine_reference` exists because guessing is
the single most common failure: inventing `colour` for `color`, `shape=` for
`style=`, or `textalign` on a function that wants `text_halign`.

## The execution model decides everything

A script runs **once per bar**, left to right across history, then on each tick of
the live bar.

```pine
// WRONG — resets every bar, so it is always 1
int count = 0
count := count + 1

// RIGHT — `var` initialises once and persists
var int count = 0
count := count + 1
```

**`var` cuts both ways, and the second edge is sharper.** It persists, so anything
you accumulate into it on every bar keeps growing:

```pine
// WRONG — adds ten more closes on EVERY bar, for the life of the chart
var float sum = 0.0
for i = 0 to 9
    sum := sum + close[i]

// RIGHT — a per-bar total must not be var
float sum = 0.0
for i = 0 to 9
    sum += close[i]
```

Loop bodies re-run every bar too, so a `var` loop counter is already at its terminal
value on bar two and the loop never runs again:

```pine
var int counter = 0     // WRONG — on bar 2 counter is already 5
while counter < 5
    counter += 1
```

Ask of every accumulator: **does its lifetime match its meaning?** "So far" wants
`var`; "for this bar" must not have it. Detected as **S3**.

`=` declares. `:=` reassigns. Using `=` twice on the same name is a TradingView
error — but *not* one this validator catches, so it is on you.

**`ta.*` functions must run on every bar.** They keep internal state, so calling one
inside a conditional silently corrupts it:

```pine
// WRONG — ta.sma only advances when the condition is true
value = condition ? ta.sma(close, 20) : na

// RIGHT — compute unconditionally, then select
smaValue = ta.sma(close, 20)
value = condition ? smaValue : na
```

## Overloaded constructors

`line.new`, `label.new` and `box.new` each accept **two** forms. Both are valid:

```pine
line.new(x1=bar_index[1], y1=low[1], x2=bar_index, y2=high)          // coordinates
line.new(first_point=chart.point.now(low), second_point=chart.point.now(high))

label.new(x=bar_index, y=high, text="hi")                            // coordinates
label.new(point=chart.point.now(high), text="hi")

box.new(left=bar_index[5], top=high, right=bar_index, bottom=low)    // coordinates
box.new(top_left=p1, bottom_right=p2)
```

Parameter names differ per function and are easy to confuse: `label.new` takes
`textalign`; `box.new` and `table.cell` take `text_halign` / `text_valign`.

## Anti-repainting

```pine
// REPAINTS — the current higher-timeframe bar is still forming
d = request.security(syminfo.tickerid, "D", close)

// STABLE — the previous, closed bar
d = request.security(syminfo.tickerid, "D", close[1], lookahead=barmerge.lookahead_off)
```

Cache the call in a variable; never repeat it inline. Guard divisions of
security-derived values with `nz()`.

## Platform limits

| Limit | Value |
|---|---|
| `plot()` calls | 64 |
| `request.*()` calls | 40 |
| Script size | 80,000 tokens |
| Loop time | 500 ms |
| Drawing objects | 500 each of line/label/box (raise via `max_*_count`) |

## API added since 2025 — often missed

| Feature | Released |
|---|---|
| `box.set_xloc()` | Mar 2025 |
| `active` on every `input.*()` | Jul 2025 |
| `timeframe_bars_back` on `time()` / `time_close()` | Oct 2025 |
| `syminfo.isin` | Nov 2025 |
| `request.footprint()`, `footprint` / `volume_row` types | Jan 2026 |
| `sort_field` on `array.sort()` / `matrix.sort()` | Apr 2026 |
| Multiline strings `"""…"""` | Apr 2026 |
| `calc_on_every_history_tick` on `strategy()` | Jul 2026 |

Rules are also **removed**: TradingView dropped indentation restrictions for
wrapped lines in December 2025, so a continuation indented by four spaces, or not
indented at all, is legal. Check the
[release notes](https://www.tradingview.com/pine-script-docs/release-notes/) before
asserting a symbol is invalid.

## Script structure

```
//@version=6
indicator("Title", overlay=true)     // or strategy(...)
// imports -> types -> constants -> inputs -> functions
// -> calculations -> orders -> plots -> alerts
```

## Common compile errors

| Message | Cause |
|---|---|
| `end of line without line continuation` | Trailing whitespace after an operator, or a broken wrapped expression |
| `Undeclared identifier` | Variable assigned only inside an `if`; declare it before with `var` or a default |
| `Cannot call 'ta.sma' with 'series'` where `simple` required | A `length` argument must be `simple int` — inputs are, series values are not |
| `Mismatched input ... expecting` | `=` used for reassignment where `:=` is required |
| `Cannot use 'plot' in local scope` | `plot`/`bgcolor`/`fill` indented inside an `if`. They take a series — compute the series conditionally, then plot at global scope. Detected as **S7** |
| Function declared inside a block | A `f(x) =>` definition must sit at column 0. Detected as **S8** |

## Where to go next

This skill is the language. For working code, start from a validated scaffold rather
than composing from memory:

- **Indicators** — `pinescript-indicator`, three scaffolds validated by `make examples`
- **Strategies** — `pinescript-strategy`, two scaffolds plus the five costly traps
- **Fixing a diagnostic** — `pinescript-validation`, every finding and its remedy

## References

- [v6 language reference](https://www.tradingview.com/pine-script-reference/v6/)
- [User manual](https://www.tradingview.com/pine-script-docs/)
- [Release notes](https://www.tradingview.com/pine-script-docs/release-notes/)
