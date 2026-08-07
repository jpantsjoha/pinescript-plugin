#!/usr/bin/env python3
"""Validate the plugin against the Agent Plugins 1.0.0 specification.

https://agent-plugins.org/specification

This enforces the vendor-neutral packaging contract that Amazon, Cursor,
Google, Microsoft, OpenAI and Vercel co-maintain — independently of any single
harness. It is deliberately dependency-free so it runs in CI without a network
call: the published schemas are transcribed as rules rather than fetched.

Failure classes follow the specification's own boundaries:
  FATAL  — client rejects the plugin entirely (§5.2)
  MCP    — client disables MCP but keeps loading other component types (§6.2)
  SKILL  — client skips that one skill, others still load (§6.1)

Exit 0: conformant. Exit 1: one or more violations.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SPEC_VERSION = "1.0.0"
PLUGIN_SCHEMA = f"https://agent-plugins.org/schemas/{SPEC_VERSION}/plugin.schema.json"
MCP_SCHEMA = f"https://agent-plugins.org/schemas/{SPEC_VERSION}/mcp.schema.json"

# §5.2 — the only permitted top-level manifest fields.
PLUGIN_FIELDS = {
    "$schema", "name", "version", "description", "author",
    "homepage", "repository", "license", "keywords", "extensions",
}
AUTHOR_FIELDS = {"name", "email", "url"}
NAME_PATTERN = re.compile(r"^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")

# Only these two placeholders are expanded; everything else stays literal.
EXPANDED = {"${PLUGIN_ROOT}", "${PLUGIN_DATA}"}
PLACEHOLDER = re.compile(r"\$\{[^}]*\}")
CWD_PATTERN = re.compile(r"^(?:\./|\$\{PLUGIN_ROOT\}(?:/|$)|\$\{PLUGIN_DATA\}(?:/|$))")

SERVER_FIELDS = {
    "stdio": ({"type", "command"}, {"type", "command", "args", "env", "cwd"}),
    "streamable-http": ({"type", "url"}, {"type", "url", "headers"}),
    "sse": ({"type", "url"}, {"type", "url", "headers"}),
}


def schema_version(identifier: str) -> str | None:
    match = re.search(r"/schemas/([^/]+)/", identifier or "")
    return match.group(1) if match else None


def check_plugin_manifest(errors: list[str]) -> dict:
    path = ROOT / "plugin.json"
    if not path.exists():
        errors.append("FATAL  plugin.json missing at plugin root")
        return {}
    try:
        manifest = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        errors.append(f"FATAL  plugin.json is not valid JSON: {e}")
        return {}
    if not isinstance(manifest, dict):
        errors.append("FATAL  plugin.json must be a JSON object")
        return {}

    if manifest.get("$schema") != PLUGIN_SCHEMA:
        errors.append(
            f"FATAL  plugin.json '$schema' must be '{PLUGIN_SCHEMA}' "
            f"(got {manifest.get('$schema')!r}) — required by the closed schema"
        )

    name = manifest.get("name")
    if not isinstance(name, str) or not name:
        errors.append("FATAL  plugin.json 'name' is required")
    else:
        if not 1 <= len(name) <= 64:
            errors.append(f"FATAL  plugin.json 'name' must be 1-64 chars (got {len(name)})")
        if not NAME_PATTERN.match(name):
            errors.append(
                f"FATAL  plugin.json 'name' {name!r} violates the schema pattern "
                "(lowercase alphanumeric, hyphens and periods; no leading/trailing "
                "separator; no '--' or '..')"
            )

    extra = sorted(set(manifest) - PLUGIN_FIELDS)
    if extra:
        errors.append(
            f"FATAL  plugin.json has non-permitted top-level fields {extra} — "
            f"§5.2 permits only {sorted(PLUGIN_FIELDS)}; use 'extensions'"
        )

    author = manifest.get("author")
    if author is not None:
        if not isinstance(author, dict):
            errors.append("FATAL  plugin.json 'author' must be an object")
        else:
            author_extra = sorted(set(author) - AUTHOR_FIELDS)
            if author_extra:
                errors.append(
                    f"FATAL  plugin.json 'author' has non-permitted fields {author_extra} "
                    f"— only {sorted(AUTHOR_FIELDS)} are allowed"
                )

    extensions = manifest.get("extensions")
    if extensions is not None and isinstance(extensions, dict):
        for namespace, value in extensions.items():
            if not isinstance(value, dict):
                errors.append(f"FATAL  extensions['{namespace}'] must be an object")
            elif "." not in namespace:
                errors.append(
                    f"       extensions namespace '{namespace}' should be a "
                    "reverse-domain name you control (SHOULD, §5.2)"
                )
    return manifest


def check_placeholders(where: str, value: str, errors: list[str]) -> None:
    """Only ${PLUGIN_ROOT} and ${PLUGIN_DATA} expand — anything else stays literal."""
    for found in PLACEHOLDER.findall(value):
        if found not in EXPANDED:
            errors.append(
                f"MCP    {where}: '{found}' is not an Agent Plugins placeholder and "
                f"will be passed through LITERALLY (only {sorted(EXPANDED)} expand)"
            )


def check_stdio(name: str, cfg: dict, errors: list[str]) -> None:
    command = cfg.get("command")
    if isinstance(command, str):
        if not command:
            errors.append(f"MCP    server '{name}': 'command' must be non-empty")
        elif len(command.split()) > 1:
            errors.append(
                f"MCP    server '{name}': 'command' must be a single executable token, "
                f"got {command!r} — move arguments into 'args'"
            )
        elif command.startswith("/") or command.startswith("../"):
            errors.append(
                f"MCP    server '{name}': 'command' {command!r} must be a bare name or "
                "a './' plugin-relative path"
            )
        elif command.startswith("./") and not (ROOT / command).exists():
            errors.append(f"MCP    server '{name}': 'command' {command!r} does not resolve")

    for index, arg in enumerate(cfg.get("args") or []):
        if isinstance(arg, str):
            check_placeholders(f"server '{name}' args[{index}]", arg, errors)

    env = cfg.get("env") or {}
    if isinstance(env, dict):
        for key, value in env.items():
            if key in ("PLUGIN_ROOT", "PLUGIN_DATA"):
                errors.append(
                    f"MCP    server '{name}': env must not define '{key}' — the client "
                    "provides it and its value takes precedence"
                )
            if isinstance(value, str):
                check_placeholders(f"server '{name}' env['{key}']", value, errors)

    cwd = cfg.get("cwd")
    if isinstance(cwd, str) and not CWD_PATTERN.match(cwd):
        errors.append(
            f"MCP    server '{name}': 'cwd' {cwd!r} must start with './', "
            "'${PLUGIN_ROOT}' or '${PLUGIN_DATA}'"
        )


def check_mcp(plugin_manifest: dict, errors: list[str]) -> None:
    path = ROOT / "mcp.json"
    if not path.exists():
        return  # §6 — a missing fixed location is not an error.

    try:
        config = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        errors.append(f"MCP    mcp.json is not valid JSON: {e}")
        return
    if not isinstance(config, dict):
        errors.append("MCP    mcp.json must be a JSON object")
        return

    declared = config.get("$schema")
    if declared != MCP_SCHEMA:
        errors.append(f"MCP    mcp.json '$schema' must be '{MCP_SCHEMA}' (got {declared!r})")
    elif plugin_manifest:
        plugin_version = schema_version(plugin_manifest.get("$schema", ""))
        if plugin_version and schema_version(declared) != plugin_version:
            errors.append(
                f"MCP    mcp.json targets {schema_version(declared)} but plugin.json "
                f"targets {plugin_version} — versions MUST match"
            )

    extra = sorted(set(config) - {"$schema", "mcpServers"})
    if extra:
        errors.append(f"MCP    mcp.json has non-permitted top-level fields {extra}")

    servers = config.get("mcpServers")
    if not isinstance(servers, dict):
        errors.append("MCP    mcp.json 'mcpServers' is required and must be an object")
        return

    for name, cfg in servers.items():
        if not isinstance(cfg, dict):
            errors.append(f"MCP    server '{name}' must be an object")
            continue

        transport = cfg.get("type")
        if transport not in SERVER_FIELDS:
            errors.append(
                f"MCP    server '{name}': 'type' must be one of "
                f"{sorted(SERVER_FIELDS)} (got {transport!r}) — the schema discriminates "
                "transports on this field"
            )
            continue
        if transport == "sse":
            errors.append(f"       server '{name}': transport 'sse' is deprecated")

        required, permitted = SERVER_FIELDS[transport]
        missing = sorted(required - set(cfg))
        if missing:
            errors.append(f"MCP    server '{name}': missing required field(s) {missing}")
        server_extra = sorted(set(cfg) - permitted)
        if server_extra:
            errors.append(
                f"MCP    server '{name}': non-permitted field(s) {server_extra} for "
                f"transport '{transport}'"
            )

        if transport == "stdio":
            check_stdio(name, cfg, errors)
        else:
            url = cfg.get("url", "")
            if isinstance(url, str) and not url.startswith(("http://", "https://")):
                errors.append(f"MCP    server '{name}': 'url' must be absolute http(s)")
            if "#" in url:
                errors.append(f"MCP    server '{name}': 'url' must not contain a fragment")


def check_skills(errors: list[str]) -> None:
    """§6.1 — skills are discovered non-recursively from skills/."""
    skills_dir = ROOT / "skills"
    if not skills_dir.exists():
        return
    if not skills_dir.is_dir():
        errors.append("SKILL  'skills' exists but is not a directory")
        return

    discovered = sorted(p.name for p in skills_dir.iterdir() if (p / "SKILL.md").is_file())
    for deeper in skills_dir.glob("*/*/**/SKILL.md"):
        errors.append(
            f"       {deeper.relative_to(ROOT)} will NOT be discovered — clients must "
            "not search below the immediate children of skills/"
        )
    print(f"       {len(discovered)} skill(s) discoverable at skills/*/SKILL.md")


def check_containment(errors: list[str]) -> None:
    """§4.1 — every plugin-relative path must resolve inside the plugin root."""
    root = ROOT.resolve()
    for path in ROOT.rglob("*"):
        if ".git" in path.parts or not path.is_symlink():
            continue
        try:
            target = path.resolve()
        except OSError:
            errors.append(f"FATAL  symlink {path.relative_to(ROOT)} does not resolve")
            continue
        if not target.is_relative_to(root):
            errors.append(
                f"FATAL  symlink {path.relative_to(ROOT)} escapes the plugin root "
                f"(-> {target})"
            )


def main() -> None:
    print(f"==> Validating against Agent Plugins {SPEC_VERSION} "
          "(https://agent-plugins.org/specification)\n")
    errors: list[str] = []

    manifest = check_plugin_manifest(errors)
    check_mcp(manifest, errors)
    check_skills(errors)
    check_containment(errors)

    fatal = [e for e in errors if e.startswith(("FATAL", "MCP", "SKILL"))]
    advisory = [e for e in errors if e not in fatal]

    for e in advisory:
        print(f"WARN{e}")
    if not fatal:
        print(f"\nOK    plugin.json conforms to {PLUGIN_SCHEMA}")
        if (ROOT / "mcp.json").exists():
            print(f"OK    mcp.json conforms to {MCP_SCHEMA}")
        print(f"OK    skills/ conform to https://agentskills.io/specification")
        print(f"\nPlugin conforms to the Agent Plugins {SPEC_VERSION} specification")
        return

    for e in fatal:
        print(f"FAIL  {e}")
    print(f"\n{len(fatal)} conformance violation(s)", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
