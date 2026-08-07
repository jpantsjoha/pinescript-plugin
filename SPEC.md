# pinescript-plugin — Specification

**Status:** v0.3.0 shipped · semantic checks specified, not yet implemented
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

| ID | Check | Detects | Severity | Notes |
|---|---|---|---|---|
| **S1** | `request.security(...)` whose expression lacks `[n]` and has no explicit `lookahead` | Repainting | Warning | The single most cited Pine defect |
| **S2** | `ta.*(...)` inside a ternary or an indented `if` body | Corrupted indicator state | Warning | Compiles; history develops gaps |
| **S3** | `x := x <op> ...` where `x` was declared without `var`/`varip` | Accumulator resets every bar | Warning | Always evaluates to the same value |
| **S4** | Assignment (`:=`) on the right-hand side of `and`/`or` | v6 lazy-evaluation trap | Warning | Short-circuit skips the assignment |
| **S5** | Count of `plot`/`plotshape`/`plotchar`/`plotcandle`/`plotbar`/`hline` > 64 | Compile failure on TradingView | Error | Platform limit |
| **S6** | Count of `request.*()` calls > 40 | Compile failure on TradingView | Error | Platform limit |
| **S7** | `plot(...)` at non-zero indentation | Compile failure | Error | `plot` is global-scope only |
| **S8** | Function definition (`f(x) =>`) at non-zero indentation | Compile failure | Error | No nested functions in Pine |
| **S9** | `strategy.entry` present with no `strategy.exit` / `close` / `close_all` | Unbounded risk | Warning | Script-level, not per-entry |

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

- [ ] All nine implemented in the engine with paired tests
- [ ] Zero findings across the extension's golden corpus
- [ ] `// pine-ignore: <ID>` suppression works and is tested
- [ ] Engine minor-version bumped and published
- [ ] Extension consumes the new engine; VSIX smoke-tested
- [ ] Plugin consumes it; MCP tests cover at least S1 and S2
- [ ] Each check explained in the relevant skill, with a WRONG/RIGHT pair that
      passes `make examples`
