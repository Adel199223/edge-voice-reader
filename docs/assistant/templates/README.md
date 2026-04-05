# Managed bootstrap templates

This folder is the vendored source of truth for the repo's assistant / Codex harness.

## What this folder is

A **managed bootstrap template set** that defines reusable harness structure, guidance, and supporting files for projects that use the same working model.

## What this folder is not

- not normal feature-work output
- not the place to make project-local quick fixes
- not a one-time starter that gets forgotten after initial repo creation

## Principles

1. **Vendored source of truth**
   - changes here are template changes
   - project-local repo work should not edit this folder unless the user explicitly requests bootstrap maintenance

2. **Profile-driven resolution**
   - bootstrap decisions should come from `HARNESS_PROFILE.json` whenever it exists
   - archetypes and modes should decide defaults
   - explicit `enabled_modules` and `disabled_modules` should be honored

3. **Human-readable + machine-readable split**
   - the profile is human-edited intent
   - runtime bootstrap state is machine-written output

4. **Preview before apply**
   - sync should resolve and preview the effective module set before writing files

5. **Compatibility during migration**
   - keep legacy module aliases while pilot repos move to the profile-driven model

## Main files added in this phase

- `BOOTSTRAP_VERSION.json`
- `BOOTSTRAP_ARCHETYPE_REGISTRY.json`
- `BOOTSTRAP_PROFILE_RESOLUTION.md`
- `NEW_PROJECT_BOOTSTRAP_WORKFLOW.md`
- `archetypes/*.md`
- `examples/*.json`

## Recommended next steps after updating this folder

1. generate or add `docs/assistant/HARNESS_PROFILE.json`
2. preview resolved modules with `tooling/preview_harness_sync.py`
3. write `docs/assistant/runtime/BOOTSTRAP_STATE.json`
4. sync the local harness
5. re-run validators
