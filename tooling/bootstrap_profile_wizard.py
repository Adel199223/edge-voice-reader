#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from harness_profile_lib import dump_json, load_json


def prompt(text: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    raw = input(f"{text}{suffix}: ").strip()
    return raw or (default or "")



def prompt_bool(text: str, default: bool) -> bool:
    default_text = "y" if default else "n"
    while True:
        raw = input(f"{text} [y/n, default={default_text}]: ").strip().lower()
        if not raw:
            return default
        if raw in {"y", "yes"}:
            return True
        if raw in {"n", "no"}:
            return False
        print("Please answer y or n.")



def prompt_list(text: str, default: str) -> list[str]:
    raw = prompt(text, default)
    return [item.strip() for item in raw.split(",") if item.strip()]



def main() -> int:
    parser = argparse.ArgumentParser(description="Interactive wizard to create HARNESS_PROFILE.json")
    parser.add_argument("--registry", required=True, help="Path to BOOTSTRAP_ARCHETYPE_REGISTRY.json")
    parser.add_argument("--output", required=True, help="Where to write HARNESS_PROFILE.json")
    args = parser.parse_args()

    registry = load_json(args.registry)
    archetypes = list(registry.get("archetypes", {}).keys())
    print("Available archetypes:")
    for name in archetypes:
        print(f"- {name}")

    archetype = prompt("Choose archetype", archetypes[0])
    archetype_meta = registry["archetypes"].get(archetype, {})
    default_mode = archetype_meta.get("default_mode", "standard")
    default_stack = archetype_meta.get("stack", {})

    profile = {
        "$schema": "./schemas/HARNESS_PROFILE.schema.json",
        "schema_version": 1,
        "project": {
            "name": prompt("Project name", Path(args.output).resolve().parent.parent.name or "my-project"),
            "description": prompt("Project description", "one sentence describing what the project does"),
        },
        "operator": {
            "experience_level": prompt("Operator level (beginner/intermediate/advanced)", "beginner"),
            "preferred_tone": prompt("Preferred tone (plain_english/balanced/technical)", "plain_english"),
            "needs_safe_commands": prompt_bool("Need safe copy-paste commands?", True),
        },
        "stack": {
            "primary_language": prompt("Primary language", default_stack.get("primary_language", "python")),
            "framework": prompt("Framework", default_stack.get("framework", "pyqt")),
            "surfaces": prompt_list("Surfaces (comma separated)", ", ".join(default_stack.get("surfaces", ["desktop"]))),
            "target_os": prompt_list("Target OS values (comma separated)", ", ".join(default_stack.get("target_os", ["windows"]))),
        },
        "bootstrap": {
            "archetype": archetype,
            "mode": prompt("Harness mode (lite/standard/full)", default_mode),
            "enabled_modules": prompt_list("Extra modules to enable (comma separated)", ""),
            "disabled_modules": prompt_list("Modules to disable (comma separated)", ""),
            "uses_openai": prompt_bool("Uses OpenAI APIs or Codex heavily?", False),
            "needs_codespaces": prompt_bool("Needs Codespaces or devcontainer support?", False),
            "has_browser_bridge": prompt_bool("Needs browser bridge or extension support?", False),
            "notes": prompt_list("Optional notes (comma separated)", ""),
        },
    }

    dump_json(profile, args.output)
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
