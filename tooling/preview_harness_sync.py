#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from harness_profile_lib import (
    ValidationError,
    dump_json,
    load_json,
    make_state,
    resolve_plan,
    resolve_sync_targets,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Preview the effective harness resolution for a profile.")
    parser.add_argument("--profile", required=True, help="Path to HARNESS_PROFILE.json")
    parser.add_argument("--registry", required=True, help="Path to BOOTSTRAP_ARCHETYPE_REGISTRY.json")
    parser.add_argument(
        "--template-map",
        help="Optional path to BOOTSTRAP_TEMPLATE_MAP.json for repo-local output mappings",
    )
    parser.add_argument(
        "--output-map",
        help="Optional path to repo-local HARNESS_OUTPUT_MAP.json overlay",
    )
    parser.add_argument("--write-state", help="Optional path for docs/assistant/runtime/BOOTSTRAP_STATE.json")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON only")
    args = parser.parse_args()

    profile = load_json(args.profile)
    registry = load_json(args.registry)
    template_map_path = Path(args.template_map) if args.template_map else Path(args.registry).with_name("BOOTSTRAP_TEMPLATE_MAP.json")
    template_map = load_json(template_map_path) if template_map_path.exists() else None
    output_map_path = Path(args.output_map) if args.output_map else Path(args.profile).with_name("HARNESS_OUTPUT_MAP.json")
    output_map = load_json(output_map_path) if output_map_path.exists() else None

    try:
        plan = resolve_plan(profile, registry)
    except ValidationError as exc:
        print(f"Cannot resolve harness plan: {exc}", file=sys.stderr)
        return 1

    sync_resolution = resolve_sync_targets(plan, template_map, output_map)
    sync_targets = sync_resolution["sync_targets"]
    missing_sync_targets = [target for target in sync_targets if not Path(target).exists()]
    report = dict(plan)
    report["sync_targets"] = sync_targets
    report["mapped_outputs"] = sync_resolution["mapped_outputs"]
    report["missing_sync_targets"] = missing_sync_targets

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(f"Project: {plan['project']}")
        print(f"Archetype: {plan['archetype']}")
        print(f"Mode: {plan['mode']}")
        print("Modules:")
        for module in plan["modules"]:
            print(f"  - {module}")
        print("Outputs:")
        for output in plan["outputs"]:
            print(f"  - {output}")
        print("Sync targets:")
        for target in sync_targets:
            print(f"  - {target}")
        if sync_resolution["mapped_outputs"]:
            print("Mapped outputs:")
            for output, targets in sync_resolution["mapped_outputs"].items():
                print(f"  - {output} -> {', '.join(targets)}")
        if missing_sync_targets:
            print("Missing sync targets:")
            for target in missing_sync_targets:
                print(f"  - {target}")
        if plan["starter_files"]:
            print("Starter files:")
            for starter in plan["starter_files"]:
                print(f"  - {starter}")
        if plan["notes"]:
            print("Notes:")
            for note in plan["notes"]:
                print(f"  - {note}")

    if args.write_state:
        state = make_state(profile, registry)
        dump_json(state, args.write_state)
        if not args.json:
            print(f"Wrote bootstrap state to {args.write_state}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
