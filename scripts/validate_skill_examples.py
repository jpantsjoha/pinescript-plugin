#!/usr/bin/env python3
"""Validate every Pine Script example embedded in a SKILL.md.

A skill that ships Pine which fails its own validator is worse than no skill: the
agent copies it, the user's chart breaks, and the plugin's core claim collapses.
This extracts each ```pine block and runs it through the real validator.

Blocks deliberately showing broken code are skipped, identified by a `WRONG`,
`REPAINTS` or `BAD` marker in a comment. Those are teaching examples; failing them
would be the point.

Fragments (no `//@version` line) are wrapped in a minimal harness so they can be
compiled in isolation.

The validator lives in the pinescript-vscode-extension repository. If it cannot be
located the script SKIPS with a clear message rather than passing silently — an
unverified example must never look verified.

  python3 scripts/validate_skill_examples.py
  PINESCRIPT_VALIDATOR=/path/to/pinescript-vscode-extension python3 scripts/...
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "skills"

# A block showing intentionally broken code carries one of these markers.
NEGATIVE_MARKERS = ("WRONG", "REPAINTS", "BAD", "DO NOT", "INVALID")

HARNESS_HEADER = '//@version=6\nindicator("skill example", overlay=true)\n'

# Names referenced by fragments that would otherwise be undeclared. Declaring them
# keeps the check focused on the snippet's own syntax rather than its context.
HARNESS_PRELUDE = (
    "condition = close > open\n"
    "p1 = chart.point.now(high)\n"
    "p2 = chart.point.now(low)\n"
)


def find_validator() -> Path | None:
    """Locate validate-cli.js in the extension repo."""
    explicit = os.environ.get("PINESCRIPT_VALIDATOR")
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    candidates += [
        ROOT.parent / "pinescript-vscode-extension",
        Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/Documents/workspaces/pinescript-vscode-extension",
    ]
    for base in candidates:
        cli = base / "validate-cli.js"
        if cli.is_file() and (base / "dist/src/parser/accurateValidator.js").is_file():
            return cli
    return None


def extract_blocks(text: str) -> list[tuple[int, str]]:
    """Return (line_number, code) for each ```pine block."""
    blocks = []
    for match in re.finditer(r"```pine\n(.*?)```", text, re.DOTALL):
        line_no = text[: match.start()].count("\n") + 1
        blocks.append((line_no, match.group(1)))
    return blocks


POSITIVE_MARKERS = ("RIGHT", "CORRECT", "STABLE", "GOOD")


def is_negative(code: str) -> bool:
    return any(marker in code for marker in NEGATIVE_MARKERS)


def split_contrast(code: str) -> list[str]:
    """Split a WRONG/RIGHT teaching block and return only the correct halves.

    Skipping mixed blocks entirely would leave the CORRECT example — the one an
    agent actually copies — unvalidated. So the block is cut at each positive
    marker, and the negative segments are discarded.
    """
    lines = code.splitlines()
    segments: list[list[str]] = []
    current: list[str] = []
    keeping = not is_negative(code)

    for line in lines:
        if any(m in line for m in POSITIVE_MARKERS):
            if current and keeping:
                segments.append(current)
            current, keeping = [line], True
        elif any(m in line for m in NEGATIVE_MARKERS):
            if current and keeping:
                segments.append(current)
            current, keeping = [], False
        else:
            current.append(line)

    if current and keeping:
        segments.append(current)

    return ["\n".join(seg).strip() for seg in segments if "".join(seg).strip()]


def build_script(code: str) -> str:
    """Wrap a fragment so it forms a compilable script."""
    if "//@version" in code:
        return code
    return HARNESS_HEADER + HARNESS_PRELUDE + code


def main() -> int:
    cli = find_validator()
    if cli is None:
        # Returning 0 here made `make gate` print "Gate passed" over ZERO validated
        # examples — a green gate is a claim, and this one would have been false.
        # --allow-skip exists for the aeroplane case; it must be asked for.
        allowed = "--allow-skip" in sys.argv
        print(
            "SKIP  Pine validator not found.\n"
            "      Examples are UNVERIFIED. Clone jpantsjoha/pinescript-vscode-extension\n"
            "      next to this repo and run `npm run build` there, or set\n"
            "      PINESCRIPT_VALIDATOR to its path.\n"
            "      Pass --allow-skip to accept an unverified run deliberately.",
            file=sys.stderr,
        )
        return 0 if allowed else 1

    skill_files = sorted(SKILLS.glob("*/SKILL.md"))
    if not skill_files:
        print("SKIP  no skills to check")
        return 0

    failures = 0
    checked = 0
    skipped = 0

    for skill_file in skill_files:
        text = skill_file.read_text()
        for line_no, code in extract_blocks(text):
            label = f"{skill_file.relative_to(ROOT)}:{line_no}"

            pieces = split_contrast(code) if is_negative(code) else [code]
            if not pieces:
                skipped += 1
                continue
            if is_negative(code):
                skipped += 1

            script = build_script("\n".join(pieces))
            with tempfile.NamedTemporaryFile("w", suffix=".pine", delete=False) as handle:
                handle.write(script)
                temp_path = handle.name

            try:
                result = subprocess.run(
                    ["node", str(cli), temp_path],
                    capture_output=True,
                    text=True,
                    cwd=cli.parent,
                )
                checked += 1
                if result.returncode != 0:
                    failures += 1
                    detail = re.sub(r"\x1b\[[0-9;]*m", "", result.stdout)
                    errors = [
                        ln.strip() for ln in detail.splitlines() if "ERROR" in ln
                    ]
                    print(f"FAIL  {label}")
                    for err in errors[:5]:
                        print(f"      {err}")
            finally:
                os.unlink(temp_path)

    print()
    # Scaffolds are complete scripts that the skills explicitly promise are
    # "validated in CI". Nothing opened them until 2026-08-08, so the promise was
    # unenforced — true by luck. The fenced-fragment pass above cannot reach them
    # because they live in files, not in ```pine blocks.
    scaffolds = sorted(SKILLS.glob("*/references/scaffolds/*.pine"))
    for scaffold in scaffolds:
        label = str(scaffold.relative_to(ROOT))
        result = subprocess.run(
            ["node", str(cli), str(scaffold)],
            capture_output=True, text=True, cwd=cli.parent,
        )
        checked += 1
        if result.returncode != 0:
            failures += 1
            detail = re.sub(r"\x1b\[[0-9;]*m", "", result.stdout)
            print(f"FAIL  {label}")
            for err in [ln.strip() for ln in detail.splitlines() if "ERROR" in ln][:5]:
                print(f"      {err}")

    print(f"{checked} example(s) validated "
          f"({len(scaffolds)} scaffold file(s)), {skipped} negative example(s) skipped")

    if failures:
        print(f"\n{failures} example(s) failed — a skill must not ship Pine that fails its own validator")
        return 1

    print("All embedded Pine examples validate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
