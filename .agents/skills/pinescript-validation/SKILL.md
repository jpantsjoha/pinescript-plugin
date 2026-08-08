---
name: pinescript-validation
description: "Diagnose and fix Pine Script v6 errors deterministically — read each validator diagnostic, apply the known fix, re-validate. Covers every diagnostic class the validator emits, what it cannot see, and how to work through an existing codebase of broken .pine files. Use when a Pine script fails to compile, when TradingView reports an error, when validate_pine_script returns diagnostics, when auditing or migrating an existing Pine codebase, or when asked to fix, debug or repair Pine Script."
license: MIT
metadata:
  "pinescript-plugin/version": "0.1.0"
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
| **S3** | Accumulator reassigned without `var` | Declare it `var` so it persists across bars |
| **S4** | Assignment inside `and`/`or` | v6 short-circuits; move the assignment out |
| **S5** | More than 64 plot calls | Remove some — TradingView will reject the script |
| **S6** | More than 40 `request.*()` calls | Consolidate — same hard limit |
| **S7** | `plot`/`bgcolor`/`fill` outside global scope | Move it out and pass `na` to hide it conditionally |
| **S8** | Function defined inside a block | Move it to root indentation |
| **S9** | `strategy.entry` with no exit anywhere | Add `strategy.exit` or `strategy.close` |

**S5-S8 are errors** — TradingView will reject the script. The rest are warnings.

### Suppressing a finding you have considered

```pine
d = request.security(syminfo.tickerid, "D", close)   // pine-ignore: S1
v = ta.rsi(close, 14)                                // pine-ignore
```

Use this when the finding is genuinely wrong for your case, not to quieten the
output. **Syntactic diagnostics can never be suppressed** — a compile error is a
fact, and hiding it would mean shipping a script that cannot run.

## What the validator CANNOT see

Be explicit about this. A clean run is not proof the script is correct.

| Not checked | Consequence |
|---|---|
| **Runtime logic beyond S3/S4** | Most state bugs still need a human read |
| **Type compatibility** | `series` where `simple` is required compiles here, fails on TradingView |
| **Script size** | 80k token limit — counted by TradingView, not here |
| **Series semantics** | `ta.*` inside a conditional validates but corrupts state |

After a clean validation, **still review for these by eye.** They are the errors
that cost money rather than time.

## Working through an existing codebase

```bash
node validate-cli.js path/to/*.pine        # batch, exit 1 if any severity-0 error
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
