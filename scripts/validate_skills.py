#!/usr/bin/env python3
"""Validate every SKILL.md against the Agent Skills specification.

Two layers are checked:

1. Agent Skills conformance (https://agentskills.io/specification) — mirrors the
   reference validator at agentskills/agentskills:skills-ref. The frontmatter
   field set is CLOSED: a skill carrying any other top-level key is
   non-conformant, and Agent Plugins 1.0.0 requires clients to skip it.
2. The plugin's own contract, which now lives under `metadata` as namespaced
   string values rather than as top-level fields.

Exit 0: all skills valid.
Exit 1: one or more violations found.
"""
import sys
import unicodedata
import yaml
from pathlib import Path

SKILLS_DIR = Path(__file__).parent.parent / "skills"

# Closed field set per the Agent Skills specification.
ALLOWED_FIELDS = {
    "name",
    "description",
    "license",
    "allowed-tools",
    "metadata",
    "compatibility",
}
MAX_NAME = 64
MAX_DESCRIPTION = 1024
MAX_COMPATIBILITY = 500

# The plugin's own contract, carried as namespaced metadata keys.
NS = "pinescript-plugin/"
# `required-scopes` is a cloud-IAM concept and has no analogue here. What matters
# for a Pine skill is which language version it targets, so a v5-era skill cannot
# masquerade as current.
REQUIRED_METADATA = {f"{NS}version", f"{NS}triggers", f"{NS}pine-version"}


def check_name(name, dir_name: str) -> list[str]:
    if not isinstance(name, str) or not name.strip():
        return ["Field 'name' must be a non-empty string"]

    errors = []
    name = unicodedata.normalize("NFKC", name.strip())
    if len(name) > MAX_NAME:
        errors.append(f"name '{name}' exceeds {MAX_NAME} chars ({len(name)})")
    if name != name.lower():
        errors.append(f"name '{name}' must be lowercase")
    if name.startswith("-") or name.endswith("-"):
        errors.append("name cannot start or end with a hyphen")
    if "--" in name:
        errors.append("name cannot contain consecutive hyphens")
    if not all(c.isalnum() or c == "-" for c in name):
        errors.append(f"name '{name}' may only contain letters, digits and hyphens")
    if name != unicodedata.normalize("NFKC", dir_name):
        errors.append(f"name '{name}' does not match directory '{dir_name}'")
    return errors


def check_description(description) -> list[str]:
    if not isinstance(description, str) or not description.strip():
        return ["Field 'description' must be a non-empty string"]
    if len(description) > MAX_DESCRIPTION:
        return [f"description exceeds {MAX_DESCRIPTION} chars ({len(description)})"]
    return []


def check_metadata(metadata) -> list[str]:
    """Agent Skills defines metadata as a map from string keys to string values."""
    if not isinstance(metadata, dict):
        return ["'metadata' must be a mapping"]

    errors = []
    for key, value in metadata.items():
        if not isinstance(key, str):
            errors.append(f"metadata key {key!r} must be a string")
            continue
        if not isinstance(value, str):
            errors.append(
                f"metadata['{key}'] must be a string value, got {type(value).__name__} "
                f"— serialise lists as comma-separated strings"
            )
        if not key.startswith(NS):
            errors.append(f"metadata key '{key}' must be namespaced as '{NS}<key>'")

    missing = REQUIRED_METADATA - set(metadata)
    if missing:
        errors.append(f"missing required metadata keys: {sorted(missing)}")
    return errors


def validate_skill(skill_path: Path) -> list[str]:
    content = skill_path.read_text()

    if not content.startswith("---"):
        return ["Missing YAML frontmatter (file must start with ---)"]

    parts = content.split("---", 2)
    if len(parts) < 3:
        return ["Malformed frontmatter (missing closing ---)"]

    try:
        fm = yaml.safe_load(parts[1])
    except yaml.YAMLError as e:
        return [f"YAML parse error: {e}"]

    if not isinstance(fm, dict):
        return ["Frontmatter must be a YAML mapping"]

    errors = []

    extra = sorted(set(fm) - ALLOWED_FIELDS)
    if extra:
        errors.append(
            f"non-conformant frontmatter fields {extra} — Agent Skills allows only "
            f"{sorted(ALLOWED_FIELDS)}; move plugin-specific keys under 'metadata'"
        )

    if "name" not in fm:
        errors.append("Missing required field 'name'")
    else:
        errors.extend(check_name(fm["name"], skill_path.parent.name))

    if "description" not in fm:
        errors.append("Missing required field 'description'")
    else:
        errors.extend(check_description(fm["description"]))

    if "compatibility" in fm:
        compatibility = fm["compatibility"]
        if not isinstance(compatibility, str):
            errors.append("'compatibility' must be a string")
        elif len(compatibility) > MAX_COMPATIBILITY:
            errors.append(
                f"compatibility exceeds {MAX_COMPATIBILITY} chars ({len(compatibility)})"
            )

    if "metadata" not in fm:
        errors.append("Missing 'metadata' (carries this plugin's skill contract)")
    else:
        errors.extend(check_metadata(fm["metadata"]))

    if not (skill_path.parent / "references").is_dir():
        errors.append("Missing references/ directory")

    return errors


def main() -> None:
    if not SKILLS_DIR.is_dir():
        print(f"ERROR: skills/ directory not found at {SKILLS_DIR}", file=sys.stderr)
        sys.exit(1)

    skill_files = sorted(SKILLS_DIR.glob("*/SKILL.md"))
    if not skill_files:
        print("WARNING: No SKILL.md files found")
        sys.exit(0)

    total = 0
    for skill_file in skill_files:
        errors = validate_skill(skill_file)
        total += len(errors)
        print(f"{'FAIL' if errors else 'OK  '}  {skill_file.parent.name}")
        for e in errors:
            print(f"      {e}")

    print()
    if total:
        print(f"{total} error(s) — fix before committing", file=sys.stderr)
        sys.exit(1)
    print(f"{len(skill_files)} skill(s) conform to the Agent Skills specification")


if __name__ == "__main__":
    main()
