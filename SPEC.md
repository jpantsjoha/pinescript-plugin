# pinescript-plugin — Specification

**Status:** v0.4.0 shipped · 7 of 9 semantic checks implemented (S3/S4 deferred)
**Last updated:** 2026-08-07

---

## Which artefact is this?

Neither, and both. The question is worth answering precisely, because getting it
wrong duplicates work.

There are **three artefacts and one capability**:

```
                 ┌──────────────────────────────────┐
                 │  pinescript-v6-validator  (npm)  │   THE CAPABILITY
                 │  validator + 457-signature data  │   detection lives here
                 └───────────────┬──────────────────┘
                                 │  consumed by both
                ┌────────────────┴────────────────┐
                ▼                                 ▼
   ┌─────────────────────────┐      ┌──────────────────────────┐
   │ pinescript-vscode-      │      │ pinescript-plugin        │
   │ extension               │      │                          │
   │                         │      │  SURFACE: agents         │
   │  SURFACE: humans        │      │  MCP tools, skills, hook  │
   │  squiggles, hover,      │      │  prose the model reads    │
   │  IntelliSense           │      │                          │
   └─────────────────────────┘      └──────────────────────────┘
```

| Concern | Belongs in | Why |
|---|---|---|
| **Detecting a defect** | Engine (npm) | One implementation, one set of tests, one truth |
| **Showing it to a human** | Extension | Squiggles, hover, quick-fix — editor affordances |
| **Telling a model** | Plugin | MCP tool result + skills that teach avoidance |
| **Teaching the language** | Plugin | Prose is useless in an editor; it is the whole point for an agent |

**Rule: a check is written once, in the engine. Never in a skill, never in the
extension.** A skill may *explain* a check; it must not reimplement one. The moment
the same rule exists in two places they drift, and a drifted rule means the agent
and the editor disagree about the same file.

This is why the engine was extracted to npm before the skills were written.

---

## The problem this exists to solve

Two failure modes, which the industry conflates.

### Syntactic — solved

Hallucinated functions, wrong parameter names, mixed v4/v5/v6 syntax. Caused by a
thin training corpus and a language that changes quarterly:

> "the corpus of examples available for more popular programming languages like
> Python or JavaScript might be enough to provide the AI with ample data to generate
> working scripts, but the same is not true for Pine Script"
> — [TradersPost](https://blog.traderspost.io/article/using-ai-to-write-tradingview-pine-script)

Cost: a minute. **A validator solves this, and the engine already does.**

### Semantic — unsolved by anyone

Code that compiles perfectly and is still wrong: repainting, `ta.*` inside a
conditional, an accumulator without `var`, the v6 lazy-evaluation trap.

> "one overlooked mistake — like a repainting signal or scope error — can invalidate
> months of backtesting"
> — [PickMyTrade](https://blog.pickmytrade.io/debugging-tradingview-strategies-10-common-pine-script-mistakes/)

Cost: a funded account. **Prose cannot solve it**, because the author already
believes they are right. Every comparable tool ships advice.

---

## Requirement: semantic checks

The differentiator. Each is mechanically detectable from the existing line-based
pass — **no AST required**, which matters because the AST path in the extension is
broken and unlikely to be repaired soon.

**Shipped in engine 0.2.0: S1, S2, S5, S6, S7, S8, S9.**
**Deferred: S3, S4** — see the note below the table.

| ID | Check | Detects | Severity | Status |
|---|---|---|---|---|
| **S1** | `request.security(...)` whose expression lacks `[n]` and has no explicit `lookahead` | Repainting | Warning | ✅ shipped |
| **S2** | `ta.*(...)` inside a ternary or an indented `if` body | Corrupted indicator state | Warning | ✅ shipped |
| **S3** | `x := x <op> ...` where `x` was declared without `var`/`varip` | Accumulator resets every bar | Warning | ⬜ **deferred** |
| **S4** | Assignment (`:=`) on the right-hand side of `and`/`or` | v6 lazy-evaluation trap | Warning | ⬜ **deferred** |
| **S5** | Count of `plot`/`plotshape`/`plotchar`/`plotcandle`/`plotbar`/`hline` > 64 | Compile failure on TradingView | Error | ✅ shipped |
| **S6** | Count of `request.*()` calls > 40 | Compile failure on TradingView | Error | ✅ shipped |
| **S7** | `plot`/`bgcolor`/`fill` at non-zero indentation | Compile failure | Error | ✅ shipped |
| **S8** | Function definition (`f(x) =>`) at non-zero indentation | Compile failure | Error | ✅ shipped |
| **S9** | `strategy.entry` present with no `strategy.exit` / `close` / `close_all` | Unbounded risk | Warning | ✅ shipped |

### Why S3 and S4 are deferred

Both are heuristics about **intent** rather than facts about syntax.

S3 flags `x := x + 1` where `x` lacks `var`. That is only a defect if accumulation
was wanted — and the pattern is indistinguishable from a deliberate per-bar
recompute. S4 flags an assignment inside `and`/`or`, which is a genuine v6
lazy-evaluation trap but rare enough that the false-positive risk may outweigh the
catch.

They were sequenced last for exactly this reason: cutting them costs nothing,
whereas discovering the problem after three other check groups had merged around
them would cost rework. **They ship only if their false-positive rate on real
scripts measures at zero**, and S3 ships as Information severity if it does not.

### Design constraints

1. **A false positive is worse than a missed error.** Every check ships with a
   paired test: one case it must flag, one legitimate case it must not. If the
   "must not flag" case cannot be written, the check does not ship.
2. **Severity discipline.** Only compile-breaking checks (S5–S8) are errors.
   Everything else is a warning — these are judgements about intent, and a warning
   that the author can dismiss is honest about that.
3. **Suppressible.** A trailing `// pine-ignore: S1` comment silences a specific
   check on that line. Without an escape hatch, a wrong warning becomes a reason to
   abandon the tool.
4. **Corpus-gated.** No semantic check may fire on any file in
   `test/fixtures/corpus/` in the extension repo.

### Where each lands

| Artefact | What it does with a semantic finding |
|---|---|
| Engine | Emits it as a `ValidationError` alongside syntactic ones |
| Extension | Warning squiggle with the explanation in the hover |
| Plugin MCP | Returned by `validate_pine_script`, so the agent sees it before handing code over |
| Plugin skills | Explain *why* each matters — the teaching half |

---

## Requirement: remaining skills

| Skill | Status | Rationale |
|---|---|---|
| `pinescript-v6` | ✅ shipped | Language, execution model, overloads |
| `pinescript-validation` | ✅ shipped | Every diagnostic and its deterministic fix |
| `pinescript-indicator` | ✅ shipped | Three CI-validated scaffolds |
| `pinescript-strategy` | ✅ shipped | Two scaffolds; the five costly traps |
| `pinescript-debugging` | ⬜ planned | `log.info/warning/error` + Pine Logs. Users still report "no print function" — v6 added one and it is under-known. Note published scripts cannot emit logs. |
| `pinescript-alerts` | ⬜ considering | Webhook JSON for the broker-automation ecosystem. Currently a section inside `pinescript-strategy`; promote only if it outgrows that. |

**Not planned:** an "optimizer" or "publisher" skill. Both are advice-shaped, and
advice is the commoditised half of this problem.

---

## Non-goals

- **A formatter, go-to-definition, rename, backtest preview.** Editor affordances.
  They belong in the extension if anywhere, not in an agent plugin.
- **Code generation from natural language.** Commercial tools do this. The value
  here is verification, which is what they lack.
- **An AST.** The extension's AST path crashes on valid input. Every check
  specified here is reachable without one.

---

## Definition of Done — semantic checks

- [x] Seven implemented in the engine with paired tests (S3/S4 deferred)
- [x] Zero findings across the extension's committed fixtures
- [x] `// pine-ignore: <ID>` suppression works and is tested
- [x] Engine published — `pinescript-v6-validator@0.2.0`
- [x] Extension consumes it; VSIX extracted and packaged code executed
- [x] Plugin consumes it; MCP tests cover S1 and S7
- [x] Each check documented in `pinescript-validation` with its remedy
- [ ] S3/S4 decided — measure false-positive rate, then ship or drop
