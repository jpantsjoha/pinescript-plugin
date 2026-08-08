---
name: pinescript-validation
description: "Diagnose and fix Pine Script v6 errors deterministically — read each validator diagnostic, apply the known fix, re-validate. Covers every diagnostic class the validator emits, what it cannot see, and how to work through an existing codebase of broken .pine files. Use when a Pine script fails to compile, when TradingView reports an error, when validate_pine_script returns diagnostics, when auditing or migrating an existing Pine codebase, or when asked to fix, debug or repair Pine Script."
license: MIT
metadata:
  "pinescript-plugin/version": "0.4.2"
  "pinescript-plugin/triggers": "pine script error, fix pine script, debug pine, compile error, validate pine, tradingview error, script won't compile, audit pine codebase, migrate pine"
  "pinescript-plugin/pine-version": "v6"
---

# Fixing Pine Script v6

## The loop

```
validate_pine_script  →  read diagnostic  →  apply the known fix  →  re-validate
```

**Never stop after one pass.** A fix can expose a diagnostic the first error was
masking — an unclosed parenthesis hides everything after it.

**Never claim a script works without a clean final run.** If validation is
unavailable, say the script is unvalidated.

## Diagnostic classes and their fixes

Each of these is emitted by the validator. The fix is deterministic — there is no
judgement involved.

### `No parameter named 'X' in 'Y'`

Wrong parameter name. **Do not guess the correct one** — call
`lookup_pine_reference` with the function name and read the real list.

| Wrong | Right | Function |
|---|---|---|
| `colour` | `color` | everywhere |
| `shape=` | `style=` | `plotshape` |
| `shape=` | `char=` | `plotchar` |
| `textalign` | `text_halign` / `text_valign` | `box.new`, `table.cell` |
| `text_halign` | `textalign` | `label.new` |
| `transp=` | `color.new(c, t)` | removed in v5 |

### `Too many arguments for 'X'. Expected max N, got M`

Either a genuine extra argument, or a call that is valid under a **different
overload**. Check `lookup_pine_reference` for an `overloads` array before deleting
anything — `line.new`, `label.new` and `box.new` each have two legitimate forms.

### `Missing required parameter(s) for 'X': a, b`

Supply them. If the call already looks complete, you are on the wrong overload —
`line.new(first_point=…)` needs `second_point`, not `x2`/`y2`.

### `Undefined namespace or variable 'X'`

In order of likelihood:

1. Assigned only inside an `if` block. Declare it before the block with `var` or a
   default value.
2. A `for … in` iterator — those bind without `=`; the validator understands both
   forms, so if this fires the name really is unbound.
3. A typo in a user-defined `type` or `enum` name.
4. A namespace that does not exist in v6 — check the release notes before
   assuming; the dataset can lag TradingView.

### `Undefined function 'X'`

The function does not exist in v6, or is namespaced differently. `math.clamp` is
the classic — v6 has no `clamp`; use `math.min(math.max(x, lo), hi)`.

### `Unclosed parenthesis` / `Trailing comma without continuation`

The call is genuinely truncated — nothing meaningful follows it. Note that
comments and blank lines **inside** a wrapped call are legal and do not cause this.

### `Invalid semicolon in ternary operator`

A `;` where a `:` belongs. Pine ternaries are `cond ? a : b`. Nested chains repeat
the colon.

### `alertcondition() expects 3 parameters, but got N`

A real fourth argument. Commas inside the `message` string are **not** arguments —
if this fires on a call with three arguments, report it as a validator bug.

### Warnings — advisory, not blocking

`Recommend using //@version=6` · `timenow is in milliseconds` ·
`"timeframe_gaps" has no effect without "timeframe"` ·
`Wrap session checks as: not na(time(...))`

## Semantic findings (S1-S9) — code that compiles and is still wrong

These are **warnings about intent**, not compile errors. Each carries an id.

| ID | Finding | What to do |
|---|---|---|
| **S1** | `request.security()` reads the current, still-forming bar | Use `close[1]`, or pass `lookahead=barmerge.lookahead_off` to say you meant it |
| **S2** | `ta.*` called inside a ternary or block | Compute it unconditionally, then select the result |
| **S3** | A `var` accumulator re-accumulated by a loop on every bar with no reset | Drop `var` if you want a per-bar total; keep it and reset before the loop if you want a buffer |
| ~~S4~~ | *(specified, not implemented — check by eye)* | v6 short-circuits `and`/`or`; never hide an assignment there |
| **S5** | More than 64 plot calls | Remove some — TradingView will reject the script |
| **S6** | More than 40 `request.*()` calls | Consolidate — same hard limit |
| **S7** | `plot`/`bgcolor`/`fill` outside global scope | Move it out and pass `na` to hide it conditionally |
| **S8** | Function defined inside a block | Move it to root indentation |
| **S9** | `strategy.entry` with no exit anywhere | Add `strategy.exit` or `strategy.close` |

**Eight checks ship: S1, S2, S3, S5-S9.** Only S4 is specified and deliberately not
implemented — it is a heuristic about intent whose false-positive risk is unresolved.
Watch for it yourself.

**S3 is the one to read carefully, because the obvious advice is wrong.** "Declare
accumulators `var` so they persist" is correct for a running total and actively
harmful for a per-bar one:

```pine
// WRONG — var persists, so this adds ten more closes on EVERY bar, forever
var float sum = 0.0
for i = 0 to 9
    sum := sum + close[i]

// RIGHT — a per-bar total must not be var
float sum = 0.0
for i = 0 to 9
    sum += close[i]
```

The `while` form fails more quietly. `var int counter = 0` with `while counter < 5`
runs once; on the next bar `counter` is already 5 and the body never executes again.

Ask of every accumulator: **does its lifetime match its meaning?** "Total so far"
wants `var`. "Total for this bar" must not have it. S3 catches the second mistake;
S3a — the same variable declared *without* `var` when a running total was wanted —
is still on you.

**S5-S8 are errors** — TradingView will reject the script. The rest are warnings.

### Suppressing a finding you have considered

```pine
d = request.security(syminfo.tickerid, "D", close)   // pine-ignore: S1
v = ta.rsi(close, 14)                                // pine-ignore
```

Use this when the finding is genuinely wrong for your case, not to quieten the
output. **Syntactic diagnostics can never be suppressed** — a compile error is a
fact, and hiding it would mean shipping a script that cannot run.

## The hook validates on write

If the plugin's `PostToolUse` hook is installed, every `.pine` file you write is
validated automatically and the write is **blocked** (exit 2) when it has errors. You
do not need to call `validate_pine_script` after every edit — you will be told. Call
it explicitly when you want to inspect warnings, which do not block.

## What the validator CANNOT see

Be explicit about this. A clean run is not proof the script is correct.

| Not checked | Consequence |
|---|---|
| **A missing `var` on a running total** | S3 catches the inverse (a `var` never reset); an accumulator that *should* persist and does not still validates clean |
| **Short-circuit assignment** | S4 is unimplemented — `x := 1` inside `and`/`or` may never run |
| **Constant and built-in-variable NAMES** | `shape.trianglup`, `color.grene`, `plot.style_circlez` all validate clean and all fail on TradingView. Only *parameter* names are checked, never the values. `lookup_pine_reference` covers functions only — a `found: false` for `barstate.islast` or `shape.triangleup` means "not a function", not "not real" |
| **Re-declaring a name with `=`** | `x = close` then `x = open` is a TradingView error and passes here |
| **`ta.*` on the right of `and`/`or`** | S2 catches ternaries and blocks; short-circuit conditionality is the S4 shape and is unimplemented |
| **Type compatibility** | `series` where `simple` is required compiles here, fails on TradingView |
| **Script size** | 80k token limit — counted by TradingView, not here |
| **Series semantics** | `ta.*` inside a conditional validates but corrupts state |

After a clean validation, **still review for these by eye.** They are the errors
that cost money rather than time.

## Working through an existing codebase

```bash
validate_pine_script                        # the MCP tool — batch by calling per file
```

1. **Triage by diagnostic class, not by file.** One wrong parameter name usually
   repeats across a codebase; fixing the class fixes many files.
2. **Fix structural errors first** — unclosed parens and truncated calls mask
   everything downstream.
3. **Re-validate the whole set after each class**, not each file. That exposes
   diagnostics the earlier errors were hiding.
4. **A file that was already valid must stay valid.** Re-run the whole set before
   claiming a batch is done.

## When you believe the validator is wrong

It happens. A false positive is worse than a missed error, so it is worth
reporting.

Before reporting, confirm the code really is valid: check the
[v6 reference](https://www.tradingview.com/pine-script-reference/v6/) **and** the
[release notes](https://www.tradingview.com/pine-script-docs/release-notes/) —
rules are removed as well as added. TradingView dropped wrapped-line indentation
restrictions in December 2025.

Then open an issue with the **smallest script that reproduces it**, at
[pinescript-vscode-extension](https://github.com/jpantsjoha/pinescript-vscode-extension/issues).
