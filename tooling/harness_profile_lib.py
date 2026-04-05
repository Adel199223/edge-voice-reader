#!/usr/bin/env python3
"""Shared helpers for profile-driven bootstrap tooling.

This module intentionally avoids external dependencies so it remains easy to run
in beginner-friendly repos.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Set

ALLOWED_EXPERIENCE = {"beginner", "intermediate", "advanced"}
ALLOWED_TONE = {"plain_english", "balanced", "technical"}
ALLOWED_MODES = {"lite", "standard", "full"}


class ValidationError(Exception):
    """Raised when profile or registry validation fails."""


JsonObject = Dict[str, Any]


def load_json(path: str | Path) -> JsonObject:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dump_json(data: JsonObject, path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _require_keys(obj: JsonObject, keys: Sequence[str], prefix: str, errors: List[str]) -> None:
    for key in keys:
        if key not in obj:
            errors.append(f"missing required key: {prefix}{key}")


def validate_profile(profile: JsonObject, registry: JsonObject | None = None) -> List[str]:
    errors: List[str] = []
    if not isinstance(profile, dict):
        return ["profile must be a JSON object"]

    _require_keys(profile, ["schema_version", "project", "operator", "stack", "bootstrap"], "", errors)

    if profile.get("schema_version") != 1:
        errors.append("schema_version must equal 1")

    project = profile.get("project")
    if not isinstance(project, dict):
        errors.append("project must be an object")
    else:
        _require_keys(project, ["name", "description"], "project.", errors)
        if not isinstance(project.get("name"), str) or not project.get("name", "").strip():
            errors.append("project.name must be a non-empty string")
        if not isinstance(project.get("description"), str) or not project.get("description", "").strip():
            errors.append("project.description must be a non-empty string")

    operator = profile.get("operator")
    if not isinstance(operator, dict):
        errors.append("operator must be an object")
    else:
        _require_keys(operator, ["experience_level", "preferred_tone", "needs_safe_commands"], "operator.", errors)
        if operator.get("experience_level") not in ALLOWED_EXPERIENCE:
            errors.append("operator.experience_level must be beginner, intermediate, or advanced")
        if operator.get("preferred_tone") not in ALLOWED_TONE:
            errors.append("operator.preferred_tone must be plain_english, balanced, or technical")
        if not isinstance(operator.get("needs_safe_commands"), bool):
            errors.append("operator.needs_safe_commands must be a boolean")

    stack = profile.get("stack")
    if not isinstance(stack, dict):
        errors.append("stack must be an object")
    else:
        _require_keys(stack, ["primary_language", "framework", "surfaces", "target_os"], "stack.", errors)
        for field in ("primary_language", "framework"):
            if not isinstance(stack.get(field), str) or not stack.get(field, "").strip():
                errors.append(f"stack.{field} must be a non-empty string")
        for field in ("surfaces", "target_os"):
            value = stack.get(field)
            if not isinstance(value, list) or not value:
                errors.append(f"stack.{field} must be a non-empty list")
            elif any(not isinstance(item, str) or not item.strip() for item in value):
                errors.append(f"stack.{field} entries must be non-empty strings")

    bootstrap = profile.get("bootstrap")
    if not isinstance(bootstrap, dict):
        errors.append("bootstrap must be an object")
    else:
        _require_keys(
            bootstrap,
            [
                "archetype",
                "mode",
                "enabled_modules",
                "disabled_modules",
                "uses_openai",
                "needs_codespaces",
                "has_browser_bridge",
                "notes",
            ],
            "bootstrap.",
            errors,
        )
        if not isinstance(bootstrap.get("archetype"), str) or not bootstrap.get("archetype", "").strip():
            errors.append("bootstrap.archetype must be a non-empty string")
        if bootstrap.get("mode") not in ALLOWED_MODES:
            errors.append("bootstrap.mode must be lite, standard, or full")
        for field in ("enabled_modules", "disabled_modules", "notes"):
            value = bootstrap.get(field)
            if not isinstance(value, list):
                errors.append(f"bootstrap.{field} must be a list")
            elif field != "notes" and any(not isinstance(item, str) or not item.strip() for item in value):
                errors.append(f"bootstrap.{field} entries must be non-empty strings")
        for field in ("uses_openai", "needs_codespaces", "has_browser_bridge"):
            if not isinstance(bootstrap.get(field), bool):
                errors.append(f"bootstrap.{field} must be a boolean")

    if registry and isinstance(bootstrap, dict):
        archetypes = registry.get("archetypes", {})
        modules = registry.get("modules", {})
        if bootstrap.get("archetype") not in archetypes:
            errors.append(f"unknown bootstrap.archetype: {bootstrap.get('archetype')}")
        for module_field in ("enabled_modules", "disabled_modules"):
            for module in bootstrap.get(module_field, []):
                if module not in modules and module not in _module_aliases(registry):
                    errors.append(f"unknown module in bootstrap.{module_field}: {module}")

    return errors


def _module_aliases(registry: JsonObject) -> Set[str]:
    aliases: Set[str] = set()
    for module_meta in registry.get("modules", {}).values():
        for alias in module_meta.get("aliases", []):
            aliases.add(alias)
    return aliases


def _normalize_module(module: str, registry: JsonObject) -> str:
    if module in registry.get("modules", {}):
        return module
    for canonical, meta in registry.get("modules", {}).items():
        if module in meta.get("aliases", []):
            return canonical
    return module


def _add_modules(target: Set[str], modules: Iterable[str], registry: JsonObject) -> None:
    for module in modules:
        target.add(_normalize_module(module, registry))


def resolve_plan(profile: JsonObject, registry: JsonObject) -> JsonObject:
    errors = validate_profile(profile, registry)
    if errors:
        raise ValidationError("; ".join(errors))

    bootstrap = profile["bootstrap"]
    archetype_name = bootstrap["archetype"]
    mode_name = bootstrap["mode"]
    archetype = registry["archetypes"][archetype_name]
    mode = registry["modes"][mode_name]

    modules: Set[str] = set()
    _add_modules(modules, archetype.get("include", []), registry)
    _add_modules(modules, mode.get("include", []), registry)

    feature_flags = registry.get("feature_flag_modules", {})
    if bootstrap.get("uses_openai"):
        _add_modules(modules, feature_flags.get("uses_openai", []), registry)
    if bootstrap.get("needs_codespaces"):
        _add_modules(modules, feature_flags.get("needs_codespaces", []), registry)
    if bootstrap.get("has_browser_bridge"):
        _add_modules(modules, feature_flags.get("has_browser_bridge", []), registry)

    if profile["operator"].get("experience_level") == "beginner" or profile["operator"].get("needs_safe_commands"):
        modules.add("beginner_support")
    if "desktop" in profile["stack"].get("surfaces", []):
        modules.add("desktop_launcher")

    _add_modules(modules, bootstrap.get("enabled_modules", []), registry)

    excluded: Set[str] = set(_normalize_module(m, registry) for m in archetype.get("exclude", []))
    excluded.update(_normalize_module(m, registry) for m in mode.get("exclude", []))
    excluded.update(_normalize_module(m, registry) for m in bootstrap.get("disabled_modules", []))
    modules.difference_update(excluded)

    outputs: List[str] = []
    for module in sorted(modules):
        outputs.extend(registry["modules"].get(module, {}).get("outputs", []))
    starter_files = list(dict.fromkeys(archetype.get("starter_files", [])))

    return {
        "schema_version": 1,
        "bootstrap_version": registry.get("version", "unknown"),
        "project": profile["project"]["name"],
        "archetype": archetype_name,
        "mode": mode_name,
        "modules": sorted(modules),
        "excluded_modules": sorted(excluded),
        "outputs": sorted(dict.fromkeys(outputs)),
        "starter_files": starter_files,
        "notes": list(dict.fromkeys(archetype.get("notes", []) + bootstrap.get("notes", []))),
    }


def _extract_output_mappings(source: JsonObject | None) -> Dict[str, List[str]]:
    mappings: Dict[str, List[str]] = {}
    if not isinstance(source, dict):
        return mappings

    for raw_mapping in source.get("output_mappings", []):
        if not isinstance(raw_mapping, dict):
            continue
        resolved_output = raw_mapping.get("resolved_output")
        raw_targets = raw_mapping.get("sync_targets", [])
        if not isinstance(resolved_output, str) or not resolved_output.strip():
            continue
        if not isinstance(raw_targets, list):
            continue
        sync_targets = [
            target.strip()
            for target in raw_targets
            if isinstance(target, str) and target.strip()
        ]
        if sync_targets:
            mappings[resolved_output] = list(dict.fromkeys(sync_targets))
    return mappings


def resolve_sync_targets(
    plan: JsonObject,
    template_map: JsonObject | None = None,
    output_map: JsonObject | None = None,
) -> JsonObject:
    """Map generic resolved outputs onto repo-local sync targets when configured."""

    mappings: Dict[str, List[str]] = _extract_output_mappings(template_map)
    mappings.update(_extract_output_mappings(output_map))

    sync_targets: List[str] = []
    mapped_outputs: Dict[str, List[str]] = {}
    for output in plan.get("outputs", []):
        if output in mappings:
            mapped_outputs[output] = mappings[output]
            sync_targets.extend(mappings[output])
        else:
            sync_targets.append(output)

    return {
        "sync_targets": list(dict.fromkeys(sync_targets)),
        "mapped_outputs": mapped_outputs,
    }


def profile_fingerprint(profile: JsonObject) -> str:
    canonical = json.dumps(profile, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]


def make_state(profile: JsonObject, registry: JsonObject) -> JsonObject:
    plan = resolve_plan(profile, registry)
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "bootstrap_version": plan["bootstrap_version"],
        "profile_fingerprint": profile_fingerprint(profile),
        "resolved": {
            "project": plan["project"],
            "archetype": plan["archetype"],
            "mode": plan["mode"],
            "modules": plan["modules"],
            "starter_files": plan["starter_files"],
            "notes": plan["notes"],
        },
    }
