# Bootstrap Project Harness Sync Policy

## What This Policy Governs
This module governs how a bootstrapped repo applies its vendored template files to its own harness.

It is project-local apply policy, not global bootstrap-template maintenance.

## Canonical Local Triggers
### `implement the template files`
Interpret this as the beginner-facing local apply command:
- read `docs/assistant/templates/BOOTSTRAP_TEMPLATE_MAP.json` first
- load the vendored template files needed for the requested harness scope
- update the project-local harness docs, workflows, manifest contracts, and validators
- preserve documented repo-specific adaptations unless they conflict with bootstrap floor contracts
- do **not** edit `docs/assistant/templates/*`
- do **not** auto-commit or auto-push

Accepted technical alias:
- `sync project harness`

### `audit project harness`
Interpret this as inspection/reporting only:
- inspect vendored templates vs current project harness
- report drift and recommended changes
- do not edit files by default

### `check project harness`
Interpret this as validation only:
- run harness integrity validation
- report failures or drift
- do not edit files by default

## Hard Protection Rule
- Vendored `docs/assistant/templates/*` files are committed project assets.
- They are not cleanup candidates.
- They must not be removed or ignored by default.
- They must not be edited unless the user explicitly asks to update the template folder or maintain the global bootstrap system.

## Local Apply Order
When `implement the template files` changes the project harness, update in this order:
1. `agent.md` and `docs/assistant/manifest.json`
2. bridge/routing docs:
   - `AGENTS.md`
   - `README.md`
   - `docs/assistant/INDEX.md`
3. workflow docs, including `PROJECT_HARNESS_SYNC_WORKFLOW.md`
4. validator and test coverage
5. roadmap docs only if the changed contracts affect resume/governance behavior:
   - `docs/assistant/workflows/ROADMAP_WORKFLOW.md`
   - `docs/assistant/exec_plans/PLANS.md`
   - `docs/assistant/SESSION_RESUME.md`
6. cleanup/publish and scratch-output guidance if the changed contracts affect continuity or merge cleanup behavior:
   - `docs/assistant/workflows/COMMIT_PUBLISH_WORKFLOW.md`
   - `docs/assistant/workflows/DOCS_MAINTENANCE_WORKFLOW.md`
   - any local deterministic review/debug tooling docs

When template changes alter continuity or cleanup rules, local harness apply must resync those governance docs instead of leaving the repo half-upgraded.

## Commit and Ignore Defaults
- If vendored templates were copied into the repo, later `commit` triage should treat them as intentional tracked scope.
- Do not suggest removing or ignoring them by default.
- If vendored templates and applied harness files changed together, split them into logical commits by default:
  - vendored template sync
  - harness implementation from vendored templates

## Global vs Local Boundary
- `implement the template files` / `sync project harness` = apply vendored templates to this repo
- `update codex bootstrap` / `UCBS` = maintain the reusable template contents themselves
- `update bootstrap` is ambiguous and must be clarified
