#!/usr/bin/env python3
"""Keep .agents/skills in step with skills/.

Codex discovers skills under `.agents/skills/`. That was a symlink to `../skills`,
which git stores faithfully — but plugin installers COPY rather than clone, and the
symlink arrived as an empty directory. Codex saw zero skills while reporting a
successful install.

So `.agents/skills/` holds real files, and this script regenerates them. Run by
`make gate`, which fails if the two trees have drifted — the same discipline applied
to every other duplicated thing in this project.
"""

import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "skills"
MIRROR = ROOT / ".agents" / "skills"


def mirror_tree(write: bool) -> list[str]:
    drift = []
    for skill_dir in sorted(SOURCE.iterdir()):
        if not skill_dir.is_dir():
            continue
        target = MIRROR / skill_dir.name
        for source_file in sorted(skill_dir.rglob("*")):
            if not source_file.is_file():
                continue
            relative = source_file.relative_to(skill_dir)
            dest = target / relative
            if dest.is_file() and filecmp.cmp(source_file, dest, shallow=False):
                continue
            drift.append(str(dest.relative_to(ROOT)))
            if write:
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_file, dest)

    # Anything in the mirror with no source is stale.
    for mirrored in sorted(MIRROR.rglob("*")):
        if not mirrored.is_file():
            continue
        origin = SOURCE / mirrored.relative_to(MIRROR)
        if not origin.exists():
            drift.append(f"{mirrored.relative_to(ROOT)} (orphan)")
            if write:
                mirrored.unlink()
    return drift


def main() -> int:
    write = "--write" in sys.argv
    drift = mirror_tree(write)

    if not drift:
        print("OK    .agents/skills matches skills/")
        return 0

    if write:
        print(f"Synced {len(drift)} file(s) into .agents/skills/")
        return 0

    print("FAIL  .agents/skills has drifted from skills/:")
    for path in drift[:10]:
        print(f"      {path}")
    print("\nRun: python3 scripts/sync_agents_skills.py --write")
    return 1


if __name__ == "__main__":
    sys.exit(main())
