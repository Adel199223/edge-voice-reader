# Bootstrap Core Contract

## What This Module Is For
This is the universal contract layer for bootstrapped repos.

It defines the minimum harness architecture, safety rules, and shorthand workflow semantics that every generated or upgraded repo should inherit unless a stricter local rule is documented.

## Required Architecture
Create or update these core artifacts in every bootstrapped repo:
- `AGENTS.md`
- `agent.md`
- `APP_KNOWLEDGE.md`
- `README.md`
- `docs/assistant/APP_KNOWLEDGE.md`
- `docs/assistant/INDEX.md`
- `docs/assistant/manifest.json`
- `docs/assistant/ISSUE_MEMORY.md`
- `docs/assistant/ISSUE_MEMORY.json`
- `docs/assistant/GOLDEN_PRINCIPLES.md`
- `docs/assistant/SESSION_RESUME.md` when roadmap governance is active
- `docs/assistant/exec_plans/PLANS.md`
- `docs/assistant/exec_plans/active/.gitkeep`
- `docs/assistant/exec_plans/completed/.gitkeep`
- `docs/assistant/workflows/DOCS_MAINTENANCE_WORKFLOW.md`
- `docs/assistant/workflows/COMMIT_PUBLISH_WORKFLOW.md`
- `docs/assistant/workflows/PROJECT_HARNESS_SYNC_WORKFLOW.md`
- `tooling/validate_agent_docs.dart`
- `test/tooling/validate_agent_docs_test.dart`
- the full vendored template set under `docs/assistant/templates/`

## Canonical and Bridge Rules
- `APP_KNOWLEDGE.md` is canonical for app-level architecture and status.
- `agent.md` is the primary human/agent runbook.
- `docs/assistant/manifest.json` is the machine-readable routing contract.
- `AGENTS.md`, `README.md`, and `docs/assistant/INDEX.md` are bridge/routing docs and should defer to the canonical runbook and manifest.
- Source code remains final truth when docs disagree.

## Template Apply and Safety Rules
- Vendored `docs/assistant/templates/*` files are committed project assets, not scratch files.
- `docs/assistant/templates/*` stays read-on-demand only.
- `implement the template files` applies vendored templates to the project harness.
- `sync project harness` is an accepted technical alias for the same local apply behavior.
- `implement the template files` must not auto-commit or auto-push.
- `implement the template files` must not edit `docs/assistant/templates/*` unless the user explicitly asks to update the template folder itself.
- Global template maintenance stays separate:
  - `update codex bootstrap`
  - `UCBS`

## Approval and Safety Rules
- Approval gates remain mandatory for destructive operations, history rewrites, risky DB work, publish/release actions, and non-essential external network calls.
- Major or multi-file work requires an ExecPlan.
- Parallel work should prefer isolated `git worktree` usage.
- After significant implementation changes, generated repos must keep the exact docs-sync prompt:
  - `Would you like me to run Assistant Docs Sync for this change now?`
- Generated repos should ask it only when relevant touched-scope docs still remain unsynced and immediate same-task synchronization is necessary.
- If immediate same-task synchronization is not necessary, defer it to a later docs-maintenance pass.

## Commit and Push Defaults
### Bare `commit`
- inspect modified tracked files, staged files, untracked files, and temp artifacts
- split the result into logical grouped commits
- treat vendored `docs/assistant/templates/*` files as intentional if they changed
- do not suggest removing or ignoring vendored templates by default

### Bare `push`
- treat as Push+PR+Merge+Cleanup unless the user narrows scope
- require branch-scoped ExecPlan closeout before merge
- when roadmap governance is active, require roadmap closeout and `SESSION_RESUME.md` update before merge
- treat cleanup of known scratch outputs as part of merge cleanup, not as an afterthought

### Post-Merge Repair Default
- If continuity or cleanup was missed after merge, generated repos should default to a follow-up branch/PR.
- Direct repair on `main` should happen only when the user explicitly asks for it.

## Scratch Output Rule
- Deterministic assistant review/debug artifacts should default under ignored `tmp/` unless a generated repo has a stricter local equivalent.
- Generated repos should treat scratch artifact Source Control noise as a workflow failure, not as normal cleanup trivia.

## OpenAI Freshness Rule
OpenAI-specific behavior is temporally unstable and should be routed through official docs or an `openai-docs` capability when available.

## Output Contract For New Repos
A bootstrapped repo should always leave behind:
- one canonical app brief
- one machine-readable manifest
- one local harness-apply workflow
- one docs maintenance workflow
- one commit/publish workflow
- one always-on issue memory system
- one vendored template folder that can be reapplied later
