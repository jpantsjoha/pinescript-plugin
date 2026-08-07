# AGENTS.md — pinescript-plugin (Codex always-on adapter)

> Validate before you claim it works.

Codex discovers this plugin's skills under `.agents/skills/` (a symlink to
`skills/`) and reads this file as the always-on contract for Pine Script work.

## Contract

1. **Validate every script** with `validate_pine_script` before returning it. An
   unvalidated script must be described as unvalidated.
2. **Look up signatures, do not recall them.** `lookup_pine_reference` returns the
   real parameter names and every overload. Pine names are not inferable —
   `label.new` uses `textalign`, `box.new` uses `text_halign`.
3. **Respect overloads.** `line.new`, `label.new` and `box.new` each have two valid
   call forms. Neither is a mistake.
4. **Check the release notes before calling a symbol invalid.** The language gains
   and loses rules; training data is stale in both directions.
5. **A false positive is worse than a missed error.** If you propose a change to
   the validator, prove it in both directions — silences the false positive AND
   still catches the real error.

Depth: `skills/pinescript-v6/SKILL.md`.
