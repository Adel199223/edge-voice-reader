# Bootstrap Harness Kit Adoption

## 1. Title And Objective
Adopt the vendored `bootstrap_harness_kit` into `/home/fa507/dev/edge-voice-reader` using the existing-repo quickstart so this lightweight Edge Voice Reader repo can bootstrap a fresh Codex session from repo-local assistant docs alone.

## 2. Scope In/Out
In scope:
- copy `bootstrap_harness_kit/` from `/home/fa507/dev/accessible_reader`,
- seed the reusable harness source into this repo,
- add `docs/assistant/HARNESS_PROFILE.json`,
- generate the standard `docs/assistant/*` assistant layer for a `browser_extension` repo in `standard` mode with `host_integration`,
- wire the new assistant docs to the existing product docs without replacing them,
- validate the profile and preview-generated bootstrap state.

Out of scope for this pass:
- changing the active extension product behavior,
- introducing `HARNESS_OUTPUT_MAP.json`,
- editing vendored template files beyond the seeded kit copy,
- syncing or modifying the heavier multilingual repo.

## 3. Assumptions And Defaults
- The target repo is `/home/fa507/dev/edge-voice-reader`.
- The source kit is `/home/fa507/dev/accessible_reader/bootstrap_harness_kit`.
- The repo keeps `README.md`, `agent.md`, `docs/ROADMAP.md`, and `docs/ROADMAP_ANCHOR.md` as the product-facing continuity layer.
- The harness posture is `browser_extension` + `standard` + explicit `host_integration`, with browser bridge enabled and operator-friendly defaults.

## 4. Worktree And Build Identity
- Worktree path: `/home/fa507/dev/edge-voice-reader`
- Branch: `main`
- HEAD SHA at stage start: `ec2457a146c6c6f3d2b2bf873e3fccbc1b8d0d06`
- Distinguishing feature label: `bootstrap-harness-kit-adoption`

## 5. Implementation Steps
1. Copy `bootstrap_harness_kit/` into the repo root and run the kit seed step.
2. Create `docs/assistant/HARNESS_PROFILE.json` for the Edge Voice Reader repo.
3. Add the missing assistant-layer docs and runtime files under `docs/assistant/`.
4. Point `START_HERE.md` and `workflows/SESSION_RESUME.md` at `README.md`, `agent.md`, `docs/ROADMAP.md`, and `docs/ROADMAP_ANCHOR.md`.
5. Run harness profile validation and preview generation to write `docs/assistant/runtime/BOOTSTRAP_STATE.json`.

## 6. Validation And Acceptance Criteria
- `bootstrap_harness_kit/` exists in the repo root.
- `docs/assistant/HARNESS_PROFILE.json` validates against the vendored registry.
- Preview writes `docs/assistant/runtime/BOOTSTRAP_STATE.json` without missing-target errors.
- The repo contains the expected assistant layer beyond `exec_plans/`.
- A fresh Codex session can bootstrap from the repo-local assistant files without referring back to `/home/fa507/dev/local_tts_multilingual`.

## 7. Rollback/Fallback Strategy
- If the kit seed step collides with active repo files, keep the seeded copy minimal and manually add only the missing assistant outputs required for the new bootstrap path.
- If preview reveals an unexpected duplication issue, stop short of adding `HARNESS_OUTPUT_MAP.json` unless that remap is clearly necessary.
