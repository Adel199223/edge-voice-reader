# Bootstrap changelog

## 2026-03-24 - profile-driven harness rollout (phase 1)

### Added
- `BOOTSTRAP_VERSION.json`
- `BOOTSTRAP_ARCHETYPE_REGISTRY.json`
- `BOOTSTRAP_PROFILE_RESOLUTION.md`
- `NEW_PROJECT_BOOTSTRAP_WORKFLOW.md`
- archetype docs for desktop Python/Qt, Flutter, web, CLI, API, and browser extension projects
- example harness profiles and bootstrap state template
- dependency-light tooling for profile validation, preview, and wizard-driven creation
- optional Codex / Docs MCP environment docs and example config

### Changed
- intended bootstrap behavior shifts from prose-heavy inference toward explicit profile resolution
- validators are expected to move toward resolved requirements instead of one global contract

### Migration posture
- additive in the first pass
- maintain legacy aliases and current outputs while pilot repos adopt profiles
