---
name: pinescript-indicator
description: "Generate working TradingView Pine Script v6 indicators — plotting, drawing objects, tables, alerts, inputs and the plot/object limits that break scripts at scale. Provides validated scaffolds to start from rather than composing from memory. Use when asked to write, create or build an indicator, study, oscillator or overlay; to plot something on a chart; to add labels, lines, boxes or a table; or to add alerts to an indicator."
license: MIT
metadata:
  "pinescript-plugin/version": "0.4.2"
  "pinescript-plugin/triggers": "write an indicator, create indicator, tradingview study, oscillator, overlay, plot on chart, add labels, draw lines, add a table, alertcondition, pine indicator"
  "pinescript-plugin/pine-version": "v6"
---

# Writing Pine v6 indicators

## Start from a scaffold, not from memory

`references/scaffolds/` holds indicators that are validated in CI. Copy one and
modify it. Composing from recollection is how wrong parameter names get in.

| Scaffold | For |
|---|---|
| `overlay-indicator.pine` | Anything drawn on the price chart |
| `oscillator.pine` | Separate pane, bounded, with levels and fills |
| `drawing-objects.pine` | Lines, labels, boxes, tables, with correct cleanup |

**Validate before returning.** Call `validate_pine_script` on the finished script.

## Declaration

```pine
indicator("Title", shorttitle="TTL", overlay=true, max_labels_count=500)
```

`overlay=true` draws on price; `false` opens a separate pane. It cannot be changed
at runtime. Raise `max_lines_count` / `max_labels_count` / `max_boxes_count`
(default 50, max 500) **before** you hit the cap — exceeding it silently deletes
the oldest object.

## Inputs

```pine
length  = input.int(14, "Length", minval=1, maxval=500)
source  = input.source(close, "Source")
useAlt  = input.bool(false, "Use alternative")
mode    = input.string("Balanced", "Mode", options=["Fast", "Balanced", "Slow"])
tf      = input.timeframe("", "Timeframe")
col     = input.color(color.blue, "Line colour")
```

`input.int` returns `simple int`, which is what `ta.*` length parameters require —
a `series int` will not compile there. Every `input.*()` accepts `active=` (July
2025) to grey out a field conditionally.

## Plotting

```pine
plot(series, "Title", color=color.blue, linewidth=2, style=plot.style_line)
plotshape(cond, "Signal", style=shape.triangleup, location=location.belowbar, color=color.green, size=size.tiny)
plotchar(cond, "Mark", char="▲", location=location.abovebar, color=color.red)
hline(0, "Zero", color=color.gray, linestyle=hline.style_dashed)
bgcolor(cond ? color.new(color.red, 90) : na)
```

`plotshape` takes **`style=`**, not `shape=`. `plotchar` takes **`char=`**.
Getting this wrong is the single most common indicator error.

`plot()` must be called at **global scope** — never inside `if`. To plot
conditionally, pass `na`:

```pine
plot(cond ? value : na, "Conditional")
```

**Limit: 64 plots per script**, counting `plot`, `plotshape`, `plotchar`,
`plotcandle`, `plotbar` and `hline`.

## Colour

```pine
color.new(color.red, 90)          // 0 = opaque, 100 = invisible
color.rgb(255, 82, 82, 20)
c = value > 0 ? color.green : color.red
```

`transp=` was removed. Use `color.new()`.

## Drawing objects

Two valid call forms — both correct, neither is a mistake:

```pine
line.new(x1=bar_index[10], y1=low[10], x2=bar_index, y2=high)     // coordinates
line.new(first_point=p1, second_point=p2)                          // chart.point

label.new(x=bar_index, y=high, text="hi", style=label.style_label_down)
box.new(left=bar_index[10], top=high, right=bar_index, bottom=low)
```

Parameter names differ per function: `label.new` takes `textalign`; `box.new` and
`table.cell` take `text_halign` / `text_valign`.

**Always clean up.** Objects persist across bars and count against the cap:

```pine
var line trend = na
if barstate.islast
    if not na(trend)
        line.delete(trend)
    trend := line.new(x1=bar_index[20], y1=low[20], x2=bar_index, y2=high)
```

## Tables

Create once with `var`, populate on the last bar only — rebuilding every bar is a
common performance mistake:

```pine
var table t = table.new(position=position.top_right, columns=2, rows=3, bgcolor=color.new(color.black, 80))
if barstate.islast
    table.cell(table_id=t, column=0, row=0, text="RSI", text_color=color.white, text_size=size.small)
```

## Alerts

```pine
alertcondition(ta.crossover(fast, slow), title="Cross Up", message="Fast crossed above slow, review sizing")
```

Exactly three parameters. Commas inside the message are fine — they are not
argument separators. The message is **static**: to include a runtime value use
`alert()` inside a condition instead.

## Higher timeframes without repainting

```pine
// REPAINTS — the current HTF bar is still forming
d = request.security(syminfo.tickerid, "D", close)

// STABLE — the previous, closed bar
d = request.security(syminfo.tickerid, "D", close[1], lookahead=barmerge.lookahead_off)
```

Cache the call in a variable; never repeat it inline. **Limit: 40 `request.*`
calls per script.**

## Checklist before returning an indicator

- [ ] `validate_pine_script` returns zero errors
- [ ] `//@version=6` present
- [ ] `plot()` calls at global scope, conditional via `na` not `if`
- [ ] Drawing objects deleted before reassignment
- [ ] Under 64 plots and 40 `request.*` calls
- [ ] `ta.*` calls unconditional
- [ ] `request.security` uses `[1]` or an explicit `lookahead`
