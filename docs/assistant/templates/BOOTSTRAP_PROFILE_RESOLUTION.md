# Bootstrap profile resolution

This document defines how the harness decides what to generate or require.

## Source priority

When these files exist, read them in this order:

1. `docs/assistant/HARNESS_PROFILE.json`
2. `docs/assistant/runtime/BOOTSTRAP_STATE.json`
3. `docs/assistant/templates/BOOTSTRAP_VERSION.json`
4. `docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json`
5. the selected archetype doc in `docs/assistant/templates/archetypes/`

## Resolution algorithm

1. start with the chosen archetype defaults
2. merge the selected mode defaults
3. add feature-flag modules
4. add `enabled_modules`
5. subtract `disabled_modules`
6. expand the result into expected files and starter outputs
7. write the final decision set to `docs/assistant/runtime/BOOTSTRAP_STATE.json`

## Feature-flag modules

- `uses_openai: true` -> `openai_docs_mcp`
- `needs_codespaces: true` -> `codespaces`
- `has_browser_bridge: true` -> `browser_bridge`
- `operator.experience_level == "beginner"` or `operator.needs_safe_commands == true` -> `beginner_support`
- stack surface contains `desktop` -> `desktop_launcher`

## Design rule

If the profile names an archetype, do not override it with silent inference.

## Migration rule

Legacy repos may keep their current behavior until a profile is added. Once a profile exists, it becomes the preferred source of truth.
