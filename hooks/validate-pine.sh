#!/usr/bin/env bash
# PostToolUse hook — validate a .pine file the moment the agent edits it.
#
# Closes the loop inside the conversation. Without this the agent must REMEMBER to
# call validate_pine_script, and "remember to check your work" is not a control.
#
# Exits 2 (blocking) only when the file genuinely has validation errors, so the
# diagnostics are fed straight back. Every other outcome exits 0: a non-Pine file,
# a missing engine, or a crashed validator are tooling conditions the author cannot
# act on, and blocking an edit for those trains people to disable the hook.

set -uo pipefail

file_path="$(jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)"
case "$file_path" in
  *.pine) ;;
  *) exit 0 ;;
esac
[ -f "$file_path" ] || exit 0

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# One resolver for the hook, the MCP server and the example gate (mcp/engine.js):
# PINESCRIPT_VALIDATOR if set, then the npm engine, then a sibling checkout of the
# extension (dist/engine/index.js or packages/validator/dist/index.js). The hook
# previously looked for dist/src/parser/*, which the extension's single-engine change
# removed, so a checkout was never found.
# stdout carries only the diagnostics (--plain: "  L<line>:<col>  <message>");
# resolver notices go to stderr and are discarded, so they never land in the
# message fed back to the agent. No sed over the output: a path or message that
# happens to contain ".pine:L" cannot be mangled.
output="$(node "$PLUGIN_ROOT/scripts/validate_pine.js" --plain "$file_path" 2>/dev/null)"
status=$?
# 1 = real errors; 2 = tooling failure; 3 = no engine anywhere. Only real
# errors block — stay silent rather than nag.
[ $status -eq 1 ] || exit 0

printf 'Pine validation failed for %s\n\n%s\n' "$file_path" "$output" >&2
exit 2
