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

# Same resolution order as the MCP server.
for base in "${PINESCRIPT_VALIDATOR:-}" \
            "$PLUGIN_ROOT/../pinescript-vscode-extension" \
            "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Documents/workspaces/pinescript-vscode-extension"; do
  [ -n "$base" ] || continue
  if [ -f "$base/validate-cli.js" ] && [ -f "$base/dist/src/parser/accurateValidator.js" ]; then
    ENGINE="$base"; break
  fi
done
[ -n "${ENGINE:-}" ] || exit 0   # engine absent — stay silent rather than nag

output="$(cd "$ENGINE" && node validate-cli.js "$file_path" 2>&1)"
status=$?
[ "$status" -eq 1 ] || exit 0

printf 'Pine validation failed for %s\n\n%s\n' \
  "$file_path" "$(printf '%s' "$output" | sed $'s/\033\\[[0-9;]*m//g')" >&2
exit 2
