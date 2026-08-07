# HLD — Semantic validation checks

**Status:** Approved · W1 in progress
**Scope:** `pinescript-v6-validator` engine, consumed by the VS Code extension and this plugin
**Requirements:** [SPEC.md](../../SPEC.md) §Requirement: semantic checks

---

## 1. Context

Pine Script fails in two ways. The industry conflates them; this design does not.

| | Example | Compiles? | Cost | Detectable? |
|---|---|---|---|---|
| **Syntactic** | `colour=` for `color=` | No | A minute | Yes — shipped |
| **Semantic** | `request.security(…, close)` repaints | **Yes** | A funded account | **Yes — this design** |

Semantic defects are invisible to the compiler *and* to prose guidance, because the
author already believes the code is correct. Every comparable tool ships advice.

## 2. Where the capability lives

```
                pinescript-v6-validator (npm)
                ┌──────────────────────────────┐
                │  accurateValidator  syntactic│
                │  documentChecks     document │
                │  semanticChecks     ← NEW    │
                │  checkRegistry      ← NEW    │
                │  suppression        ← NEW    │
                └───────────────┬──────────────┘
                   ┌────────────┴────────────┐
                   ▼                         ▼
          VS Code extension            pinescript-plugin
          squiggle + hover             MCP result + skills
```

**Constraint (SPEC): a check is written once, in the engine.** Neither consumer
reimplements one. Two copies drift, and a drifted rule means the agent and the
editor disagree about the same file.

## 3. Component design

### 3.1 Check registry

Single source of identity. Message text lives with the check, not scattered at call
sites where it drifts from the documentation.

```ts
interface SemanticCheck {
  id: 'S1' | … | 'S9';
  severity: DiagnosticSeverity;
  title: string;
  explain: (ctx) => string;   // the user-facing message
  docAnchor: string;          // deep link into the skill that teaches it
}
```

### 3.2 Suppression

```pine
d = request.security(t, "D", close)   // pine-ignore: S1
x = accumulate()                      // pine-ignore
```

| Form | Effect |
|---|---|
| `// pine-ignore: S1` | Silences S1 on that line |
| `// pine-ignore: S1,S2` | Silences both |
| `// pine-ignore` | Silences **all semantic** checks on that line |
| *(any form)* | **Never** silences a syntactic diagnostic |

Syntactic diagnostics are compile errors — facts, not judgements. Only semantic
checks, which are inferences about intent, are suppressible.

> **Critical ordering constraint.** `blankComments()` runs before analysis, so by the
> time a check executes the directive is whitespace. Directives **must** be extracted
> from the raw source first and stored as a `Map<lineNumber, Set<checkId>>`. This is
> the single most likely way for the mechanism to silently do nothing, and it is
> called out in the W1 acceptance criteria for that reason.

### 3.3 Execution order

```
raw source
   │
   ├─→ extractSuppressions()      ← RAW text, before any blanking
   │
   ├─→ blankMultilineStrings()
   ├─→ blankStrings()
   ├─→ blankComments()
   │
   ├─→ accurateValidator     ─┐
   ├─→ documentChecks         ├─→ diagnostics
   └─→ semanticChecks        ─┘
                               │
                    applySuppressions()   ← semantic only
                               │
                          sorted output
```

## 4. Check groups

Grouped by the *analysis primitive* each needs, which is why they parallelise
cleanly — no shared mutable state between groups.

| Group | Checks | Primitive | Risk |
|---|---|---|---|
| Counting | S5, S6 | Whole-file tally | Low |
| Scope | S7, S8 | Indentation at statement start | Low |
| State | S3, S4 | Declaration tracking | **High** |
| Shape | S1, S2, S9 | Call-site pattern match | Medium |

### The S3 caveat

S3 (accumulator without `var`) is a heuristic about **intent**, not a fact. `x := x + 1`
is only wrong if accumulation was wanted.

Mitigation: require self-reference **and** an arithmetic operator. `x := x` alone, or
`x := other`, is not flagged. **If the false-positive rate on real scripts is not
clearly zero, S3 ships as Information severity or is dropped.** It is sequenced last
so that decision costs nothing.

## 5. Severity policy

| Severity | Used for | Checks |
|---|---|---|
| Error (0) | Will not compile on TradingView | S5, S6, S7, S8 |
| Warning (1) | Compiles; probably not what you meant | S1, S2, S3, S4, S9 |

Nine new diagnostics arriving at once risks warning fatigue. Only genuine compile
failures are errors; everything else warns and is suppressible.

## 6. Consumer integration

| Consumer | Change required |
|---|---|
| Engine | New modules; minor version bump |
| Extension | None — `validatePineScript()` already aggregates sources. Bump the dependency. |
| Plugin MCP | None — same aggregation. Bump the dependency. |
| Plugin skills | Prose explaining each check, with `docAnchor` pointing at it |
| `validate-cli.js` | None |
| `scripts/audit.js` | Registers `semanticChecks` as a diagnostic source (the coverage guard already enforces this) |

Adding a source without wiring it into the CLI *and* the corpus already fails the
build. That guard exists because inline document checks once shipped 28 false
positives across files the suite was certifying as clean.

## 7. Test strategy

| Layer | Assertion |
|---|---|
| Paired unit | Each check: one case it must flag, one it must not. **No "must not" case → the check does not ship.** |
| Corpus | Zero semantic findings across `test/fixtures/corpus/` |
| Suppression | Directive silences the right check and *only* that one; survives comment blanking; does not silence syntactic errors |
| Sabotage | Disable each check in `dist/`, confirm its tests fail, restore |
| Package | `npm pack` → install outside the repo → run |
| Harness | Install into Claude Code and Antigravity; confirm inventory |

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Directive stripped before analysis | Suppression silently inert | Extract from raw text; explicit test (W1 DoD) |
| S3 false positives | Users disable the tool | Narrow pattern; measure; downgrade or drop |
| S2 fires on ternaries *using* a `ta.*` result | Very common shape flagged | Match the call inside the conditional, not the variable |
| Warning fatigue | Nine at once reads as noise | Errors only for compile failures; all suppressible |
| Extension regression | 1,403 users | Branch, full gate, VSIX extract-and-execute, never combined with another change |

## 9. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Checks live in the engine, not in consumers | Two copies drift; a drifted rule makes agent and editor disagree |
| D2 | No AST | Every check is reachable line-based. The AST path crashes on valid input and is not being repaired. |
| D3 | Semantic checks suppressible; syntactic never | Judgements can be wrong; compile errors cannot |
| D4 | Only compile failures are errors | Warning fatigue would sink adoption of all nine |
| D5 | S3 sequenced last | Most likely to be cut; cutting it last costs nothing |

## 10. Out of scope

Type inference · formatter · go-to-definition · backtest preview · natural-language
generation. The first needs an AST; the rest are editor affordances or commodity
features.
