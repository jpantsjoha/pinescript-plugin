#!/usr/bin/env python3
"""Validate the plugin is installable across Claude Code, Antigravity, Codex, and Kimi.

Asserts every harness manifest exists, parses, and is internally consistent
(name + version agree, referenced context/skill paths resolve). This is the
packaging gate — it stands in for what each harness checks at install time.

Exit 0: installable. Exit 1: one or more packaging violations.
"""
import sys
import json
import yaml
from pathlib import Path

ROOT = Path(__file__).parent.parent
EXPECTED_NAME = "pinescript-plugin"

# Derived, never hardcoded. A literal here meant every release had to remember to
# edit this file, and the check only ever proved the manifests matched a magic
# string — it would happily pass with all six manifests wrong together, and it
# failed a legitimate 0.4.3 bump because the string was stale. package.json is the
# single source of truth; everything else must agree with it.
EXPECTED_VERSION = json.loads((ROOT / "package.json").read_text())["version"]


def _load_json(path: Path, errors: list[str]) -> dict | None:
    if not path.exists():
        errors.append(f"MISSING  {path.relative_to(ROOT)}")
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as e:
        errors.append(f"BAD JSON {path.relative_to(ROOT)}: {e}")
        return None


def check_claude(errors: list[str]) -> None:
    m = _load_json(ROOT / ".claude-plugin" / "plugin.json", errors)
    if m:
        if m.get("name") != EXPECTED_NAME:
            errors.append(f"claude plugin.json: name '{m.get('name')}' != '{EXPECTED_NAME}'")
        if m.get("version") != EXPECTED_VERSION:
            errors.append(f"claude plugin.json: version '{m.get('version')}' != '{EXPECTED_VERSION}'")
        for field in ("description", "author", "license"):
            if not m.get(field):
                errors.append(f"claude plugin.json: missing '{field}'")

    mk = _load_json(ROOT / ".claude-plugin" / "marketplace.json", errors)
    if mk:
        plugins = mk.get("plugins", [])
        if not any(p.get("name") == EXPECTED_NAME for p in plugins):
            errors.append("marketplace.json: does not list pinescript-plugin")


def check_gemini(errors: list[str]) -> None:
    m = _load_json(ROOT / "gemini-extension.json", errors)
    if m:
        if m.get("name") != EXPECTED_NAME:
            errors.append(f"gemini-extension.json: name '{m.get('name')}' != '{EXPECTED_NAME}'")
        ctx = m.get("contextFileName")
        if not ctx:
            errors.append("gemini-extension.json: missing contextFileName")
        elif not (ROOT / ctx).exists():
            errors.append(f"gemini-extension.json: contextFileName '{ctx}' does not exist")

    # AGY's native validator (agy plugin validate) requires a root plugin.json.
    root_manifest = _load_json(ROOT / "plugin.json", errors)
    if root_manifest and root_manifest.get("name") != EXPECTED_NAME:
        errors.append(f"root plugin.json: name '{root_manifest.get('name')}' != '{EXPECTED_NAME}'")


def check_kimi(errors: list[str]) -> None:
    m = _load_json(ROOT / ".kimi-plugin" / "plugin.json", errors)
    if m:
        if m.get("name") != EXPECTED_NAME:
            errors.append(f"kimi plugin.json: name '{m.get('name')}' != '{EXPECTED_NAME}'")
        skills_path = m.get("skills")
        if not skills_path:
            errors.append("kimi plugin.json: missing 'skills' path")
        elif not (ROOT / skills_path.lstrip("./")).is_dir():
            errors.append(f"kimi plugin.json: skills path '{skills_path}' does not resolve")
        start = (m.get("sessionStart") or {}).get("skill")
        if start and not (ROOT / "skills" / start / "SKILL.md").exists():
            errors.append(f"kimi plugin.json: sessionStart skill '{start}' not found")


def check_codex(errors: list[str]) -> None:
    if not (ROOT / "AGENTS.md").exists():
        errors.append("MISSING  AGENTS.md (Codex always-on adapter)")
    agents_skills = ROOT / ".agents" / "skills"
    if not agents_skills.exists():
        errors.append("MISSING  .agents/skills (Codex skill discovery path)")
    elif not list(agents_skills.glob("*/SKILL.md")):
        errors.append(".agents/skills resolves but contains no SKILL.md files")


def check_mcp_consistency(errors: list[str]) -> None:
    """The three MCP manifests must declare the same server names (drift guard).

    .mcp.json (Claude Code), mcp_config.json (AGY), and gemini-extension.json
    inline (Gemini extension runtime) are read by different harnesses — they
    must not drift apart.
    """
    def mcp_map(path: Path) -> dict | None:
        m = _load_json(path, errors)
        if m is None:
            return None
        node = m.get("mcpServers", {})
        # Strip _-prefixed annotation keys so docs don't count as drift.
        cleaned: dict = {}
        for name, cfg in node.items():
            if not isinstance(cfg, dict):
                cleaned[name] = cfg
                continue
            cleaned[name] = {
                "command": cfg.get("command"),
                "args": cfg.get("args"),
                "env": {k: v for k, v in (cfg.get("env") or {}).items() if not k.startswith("_")},
            }
        return cleaned

    claude = mcp_map(ROOT / ".mcp.json")
    agy = mcp_map(ROOT / "mcp_config.json")
    gemini = mcp_map(ROOT / "gemini-extension.json")

    check_agent_plugins_mcp_subset(claude, errors)

    present = {n: s for n, s in (("claude .mcp.json", claude), ("agy mcp_config.json", agy), ("gemini inline", gemini)) if s is not None}
    if len(present) > 1:
        baseline_name, baseline = next(iter(present.items()))
        for name, s in present.items():
            if set(s.keys()) != set(baseline.keys()):
                errors.append(
                    f"MCP drift: '{name}' servers {sorted(s)} != '{baseline_name}' {sorted(baseline)}"
                )
                continue
            # Compare command/args/env per server — catches hardcoded value drift.
            for srv in s:
                if s[srv] != baseline[srv]:
                    errors.append(
                        f"MCP drift: server '{srv}' differs between '{name}' and '{baseline_name}' "
                        f"(command/args/env mismatch — check for hardcoded values)"
                    )
    # Guard against hardcoded project placeholders slipping in.
    for name, s in present.items():
        for srv, cfg in s.items():
            for k, v in (cfg.get("env") or {}).items() if isinstance(cfg, dict) else []:
                if isinstance(v, str) and v and not v.startswith("${") and k.endswith(("PROJECT", "PROJECT_ID")):
                    errors.append(
                        f"MCP hardcoded value: '{name}' server '{srv}' env {k}='{v}' — use ${{{k}}} placeholder"
                    )


def check_agent_plugins_mcp_subset(claude: dict | None, errors: list[str]) -> None:
    """The spec-portable mcp.json must not declare servers the harnesses don't know.

    mcp.json (Agent Plugins 1.0.0) is deliberately a SUBSET of the harness
    manifests: it carries only servers that run with zero user-supplied config,
    because the spec expands no placeholders beyond ${PLUGIN_ROOT}/${PLUGIN_DATA}.
    Servers needing a user-specific config file stay documented opt-ins.
    """
    spec = _load_json(ROOT / "mcp.json", errors)
    if spec is None or claude is None:
        return
    spec_servers = set(spec.get("mcpServers", {}))
    if not spec_servers <= set(claude):
        errors.append(
            f"mcp.json declares server(s) {sorted(spec_servers - set(claude))} absent "
            "from .mcp.json — the portable manifest must be a subset"
        )
    for name in spec_servers & set(claude):
        spec_cmd = spec["mcpServers"][name].get("command")
        if spec_cmd != claude[name]["command"]:
            errors.append(
                f"MCP drift: server '{name}' command differs between mcp.json "
                f"({spec_cmd}) and .mcp.json ({claude[name]['command']})"
            )


def check_context_files(errors: list[str]) -> None:
    for ctx in ("PLUGIN.md", "GEMINI.md", "AGENTS.md"):
        if not (ROOT / ctx).exists():
            errors.append(f"MISSING  {ctx}")


def check_yaml_index_consistency(errors: list[str]) -> None:
    """plugin.yaml skill index must match skills on disk."""
    py = ROOT / "plugin.yaml"
    if not py.exists():
        errors.append("MISSING  plugin.yaml")
        return
    data = yaml.safe_load(py.read_text())
    indexed = {s["name"] for s in data.get("personas", [])} | {
        s["name"] for s in data.get("skills", [])
    }
    on_disk = {p.parent.name for p in ROOT.glob("skills/*/SKILL.md")}
    missing = on_disk - indexed
    if missing:
        errors.append(f"plugin.yaml: skills on disk not indexed: {sorted(missing)}")
    ghost = indexed - on_disk
    if ghost:
        errors.append(f"plugin.yaml: indexed skills with no directory: {sorted(ghost)}")


def main() -> None:
    errors: list[str] = []
    print("==> Validating plugin packaging (Claude · Antigravity · Codex · Kimi)\n")

    check_claude(errors)
    check_gemini(errors)
    check_kimi(errors)
    check_codex(errors)
    check_mcp_consistency(errors)
    check_context_files(errors)
    check_yaml_index_consistency(errors)

    harnesses = ["Claude Code", "Antigravity (Gemini)", "Codex", "Kimi"]
    if not errors:
        for h in harnesses:
            print(f"OK    {h} — manifest present and consistent")
        print(
            f"\nPlugin '{EXPECTED_NAME}' v{EXPECTED_VERSION}: all 4 harness manifests "
            "parse and agree.\nThis is a packaging check, not an install — it does not "
            "launch any harness."
        )
        return

    for e in errors:
        print(f"FAIL  {e}")
    print(f"\n{len(errors)} packaging violation(s) — plugin is NOT installable", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
