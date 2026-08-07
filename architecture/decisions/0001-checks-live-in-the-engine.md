# ADR-0001 — Validation checks live in the engine, never in a consumer

**Status:** Accepted · 2026-08-07

## Context

Three artefacts: the npm engine, the VS Code extension, the agent plugin. A check
could plausibly be implemented in any of them.

## Decision

Every validation check is implemented **once, in `pinescript-v6-validator`**. The
extension and the plugin consume its output. Neither reimplements a rule; a skill
may *explain* a check but never duplicate its logic.

## Consequences

**Good.** One implementation, one test suite, one truth. The agent and the editor
cannot disagree about the same file — the failure mode that would destroy the
plugin's only real claim.

**Cost.** A check requires an engine release before either consumer benefits.
Release order is strict: engine → extension → plugin.

**Evidence.** This project already shipped 28 false positives from document checks
that lived inline in `extension.ts`, invisible to the CLI and to every test. The
audit script now fails the build when a diagnostic source is not wired into both
the CLI and the golden corpus.
