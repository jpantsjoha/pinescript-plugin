# ADR-0002 — No AST for semantic checks

**Status:** Accepted · 2026-08-07

## Context

Semantic checks (repainting, `ta.*` in conditionals, accumulator state) look like
work for a syntax tree. The extension has a parser — `parser.ts`, `ast.ts`,
`lexer.ts`, `typeSystem.ts`, roughly 2,000 lines.

That path is **dead**. `ComprehensiveValidator` throws `ast.body is not iterable` on
valid input, and its import was removed from `extension.ts`.

## Decision

All nine specified checks are implemented **line-based**, on the existing
comment-and-string-blanked pass. No AST.

## Consequences

**Good.** Ships now rather than after a parser repair of unknown size. Stays within
the ~12ms performance budget. No dependency on code that currently crashes.

**Cost.** Type inference remains impossible, so `series` passed where `simple` is
required is still undetectable. That limitation is stated explicitly in the
`pinescript-validation` skill under "what the validator cannot see" rather than
being quietly hoped over.

**Revisit when** someone repairs `parse()` and gets `ComprehensiveValidator` passing
the golden corpus. Until then, an AST-shaped solution is a plan, not a capability.
