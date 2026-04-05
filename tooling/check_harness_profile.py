#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys

from harness_profile_lib import load_json, validate_profile


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a harness profile against the registry.")
    parser.add_argument("--profile", required=True, help="Path to HARNESS_PROFILE.json")
    parser.add_argument("--registry", required=True, help="Path to BOOTSTRAP_ARCHETYPE_REGISTRY.json")
    args = parser.parse_args()

    profile = load_json(args.profile)
    registry = load_json(args.registry)
    errors = validate_profile(profile, registry)
    if errors:
        print("Profile validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Profile validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
