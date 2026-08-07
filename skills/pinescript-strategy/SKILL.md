---
name: pinescript-strategy
description: "Write TradingView Pine Script v6 strategies that behave the same live as in backtest — entries, exits, position sizing, commission and slippage, and the repainting and lookahead traps that make a backtest lie. Includes validated scaffolds and webhook alert payloads for broker automation. Use when asked to write, build or backtest a trading strategy; to add entries, exits, stops or take-profits; when a strategy performs differently live than in testing; or to automate alerts to a broker."
license: MIT
metadata:
  "pinescript-plugin/version": "0.2.0"
  "pinescript-plugin/triggers": "write a strategy, trading strategy, backtest, strategy.entry, strategy.exit, stop loss, take profit, position sizing, repainting, backtest doesn't match live, webhook alert, automate to broker"
  "pinescript-plugin/pine-version": "v6"
---

# Pine v6 strategies

## The thing that actually goes wrong

A strategy that compiles cleanly and backtests beautifully can still lose money,
because **the backtest was measuring something the live market will not repeat.**
Practitioners are blunt about this: *"one overlooked mistake — like a repainting
signal or scope error — can invalidate months of backtesting."*
([PickMyTrade](https://blog.pickmytrade.io/debugging-tradingview-strategies-10-common-pine-script-mistakes/))

The validator catches syntax. **It cannot catch any of the traps below.** Check
them by eye, every time, before anyone risks capital.

## The five traps, in order of cost

### 1. Repainting higher-timeframe data

```pine
// WRONG — the current daily bar is still forming; history and live disagree
d = request.security(syminfo.tickerid, "D", close)

// RIGHT — the previous, closed bar
d = request.security(syminfo.tickerid, "D", close[1], lookahead=barmerge.lookahead_off)
```

`lookahead_on` is worse than useless in a strategy: it lets history see data that
did not exist yet, so the backtest is fiction.

### 2. Acting on an unconfirmed bar

Intrabar, `close` moves. A condition true mid-bar may be false at the close, so the
signal appears and vanishes.

```pine
// Deterministic — evaluate only on a closed bar
if barstate.isconfirmed and longCondition
    strategy.entry("Long", strategy.long)
```

Or set `calc_on_every_tick=false` (the default) and leave it alone.

### 3. `ta.*` inside a conditional

```pine
// WRONG — ta.rsi only advances when the branch is taken; its state is corrupted
v = useRsi ? ta.rsi(close, 14) : na

// RIGHT — compute every bar, select afterwards
rsiValue = ta.rsi(close, 14)
v = useRsi ? rsiValue : na
```

Compiles. Silently wrong. The indicator's internal history has gaps.

### 4. Accumulators without `var` — and the lazy-evaluation trap

```pine
// WRONG — resets every bar, so it is always 1
int wins = 0
wins := wins + 1

// WRONG in v6 — `and` short-circuits, so the increment is skipped
// whenever the left side is false
ok = condition and (wins := wins + 1) > 0

// RIGHT — persist with var, and never hide state changes inside and/or
var int wins = 0
if tradeClosed and profitable
    wins := wins + 1
```

v6 introduced short-circuit evaluation. Any assignment tucked into the right-hand
side of `and`/`or` will sometimes not run.

### 5. Optimistic fills

Default backtest assumptions are generous. State them explicitly:

```pine
strategy("S", overlay=true,
     initial_capital=10000,
     default_qty_type=strategy.percent_of_equity,
     default_qty_value=10,
     commission_type=strategy.commission.percent,
     commission_value=0.05,
     slippage=2,
     process_orders_on_close=true,
     calc_on_every_tick=false)
```

Zero commission and zero slippage flatter every strategy, and flatter high-frequency
ones most.

## Entries and exits

```pine
strategy.entry("Long", strategy.long, comment="MA cross")
strategy.exit("Long Exit", from_entry="Long", stop=stopPrice, limit=targetPrice)
strategy.close("Long", comment="Signal flip")
strategy.close_all(comment="Flat")
```

- `strategy.entry` **reverses** an opposing position by default. To avoid that, close first.
- `strategy.exit` needs `from_entry` matching the entry `id`, or it attaches to everything.
- An entry with no exit is unbounded risk. Every `strategy.entry` needs a matching
  `strategy.exit` or `strategy.close`.
- `pyramiding` defaults to 0 — additional same-direction entries are ignored unless you raise it.

## Stops and targets

```pine
longStop   = strategy.position_avg_price * (1 - stopPercent / 100)
longTarget = strategy.position_avg_price * (1 + targetPercent / 100)

if strategy.position_size > 0
    strategy.exit("X", from_entry="Long", stop=longStop, limit=longTarget)
```

Derive levels from `strategy.position_avg_price`, not from `close` at signal time —
the fill is not the signal bar's close.

For ATR-based stops, compute ATR **unconditionally**, then use it.

## Runtime state

| Variable | Meaning |
|---|---|
| `strategy.position_size` | Signed; `> 0` long, `< 0` short, `0` flat |
| `strategy.position_avg_price` | Average fill of the open position |
| `strategy.equity` | Capital including open P/L |
| `strategy.netprofit` | Closed-trade profit |
| `strategy.opentrades` / `strategy.closedtrades` | Counts |

## Webhook automation

Strategies are commonly automated by posting JSON to a broker bridge — TradersPost,
PickMyTrade, CrossTrade. The alert message carries the payload:

```pine
alertMessage = '{"ticker":"' + syminfo.ticker + '","action":"buy","sentiment":"long"}'

if longCondition
    strategy.entry("Long", strategy.long, alert_message=alertMessage)
```

`alert_message` on the order call is what the webhook posts. Keep it valid JSON —
build it with `str.tostring()` and explicit concatenation, and check the receiving
platform's required fields (`ticker`, `action`, `sentiment`, `quantity` are common).

`alertcondition()` messages are **static** and cannot carry runtime values; use
`alert()` or order-level `alert_message` when the payload must vary.

## Scaffolds

`references/scaffolds/` — validated in CI:

| Scaffold | Shows |
|---|---|
| `basic-strategy.pine` | Entries, exits, sizing, commission, confirmed-bar gating |
| `risk-managed-strategy.pine` | ATR stops, position sizing from risk %, webhook payloads |

## Checklist before anyone risks money

- [ ] `validate_pine_script` clean
- [ ] Every `request.security` uses `[1]` or an explicit `lookahead_off`
- [ ] Entries gated on `barstate.isconfirmed`, or `calc_on_every_tick=false`
- [ ] All `ta.*` calls unconditional
- [ ] Accumulators declared `var`; no assignment inside `and`/`or`
- [ ] Commission and slippage set to something realistic
- [ ] Every entry has a matching exit
- [ ] Backtest sample is long enough to include a regime change
- [ ] `alert_message` JSON validated against the broker's schema
