# Bootstrap Update Policy

## What This Policy Governs
This file governs the global Codex bootstrap template system under `docs/assistant/templates/`.

It is a protected maintenance policy for the harness itself, not a general project update policy.

## Hard Protection Rule
- Ordinary project feature work must **not** edit `docs/assistant/templates/*`.
- The bootstrap system must not edit `docs/assistant/templates/*` during ordinary project feature work.
- Only explicit bootstrap-maintenance requests may change the template system.
- If the task is normal app/product work, template files are read-only reference material unless the user explicitly invokes a bootstrap maintenance trigger.
- Project-local `implement the template files` / `sync project harness` requests do not authorize editing `docs/assistant/templates/*`.

## Canonical Bootstrap Maintenance Triggers

### `update codex bootstrap`
Interpret this as a full bootstrap maintenance command:
- inspect the full template system
- inspect `docs/assistant/ISSUE_MEMORY.md` and `docs/assistant/ISSUE_MEMORY.json` for generalized lessons
- compare it against recent reusable workflow lessons
- update only the relevant bootstrap template files, template validators/tests, and template-specific ExecPlans
- validate the full bootstrap system at the end

Accepted shorthand alias:
- `UCBS`

### `audit codex bootstrap`
Interpret this as inspection/reporting only:
- inspect the full template system
- report gaps, drift, or recommended improvements
- do **not** edit files by default

### `check codex bootstrap`
Interpret this as validation only:
- run bootstrap integrity validation
- report failures or drift
- do **not** edit files by default

### `sync codex bootstrap docs`
Interpret this as a docs-only maintenance request:
- sync already-implemented bootstrap/governance changes into the bootstrap docs
- do not broaden into unrelated product docs

## Non-Canonical Trigger Rule
- `update bootstrap` is **not canonical**.
- update bootstrap is **not canonical** and must be clarified before any bootstrap-template edits happen.
- If the user says `update bootstrap`, the target must be clarified rather than assumed to mean the global Codex bootstrap harness.
- This avoids confusion with project-local bootstrap files or project-specific setup systems.
- `UCBS` is an accepted shorthand alias for `update codex bootstrap`, not a separate maintenance command.
- If the user says `implement the template files` or `sync project harness`, treat that as project-local harness application, not global bootstrap maintenance.

## Allowed Change Surface For `update codex bootstrap`
Allowed by default:
- `docs/assistant/templates/*`
- template-related validator code/tests
- template-specific ExecPlans
- minimal routing/index references only when the bootstrap system truly depends on them

Not allowed by default:
- normal product docs
- app guides
- unrelated workflows
- project feature files

## Issue Memory Input
`update codex bootstrap` / `UCBS` should treat project issue memory as an input, not as an automatic promotion source.

Use only issue entries whose bootstrap relevance is:
- `possible`
- `required`

Prioritize:
- `repeat_count >= 2`
- high workflow cost
- regression after a prior accepted fix

Do not promote one-off local/project issues into the global Codex bootstrap unless they generalize cleanly.

## Universal vs Local Boundary
- Universal bootstrap files stay general.
- Personal machine facts belong in `BOOTSTRAP_LOCAL_ENV_OVERLAY.md`.
- Dynamic skills/MCP/tool assumptions belong in `BOOTSTRAP_CAPABILITY_DISCOVERY.md`.
- Project-specific bootstrap behavior must not be pushed back into the global Codex bootstrap unless it generalizes cleanly.
- Vendored template files may be committed in project repos, but global bootstrap maintenance still refers only to editing the reusable template contents themselves.

## Roadmap Governance Promotion Rule
- Promote roadmap-related process lessons only when they are reusable across future apps.
- Keep roadmap governance adaptive; do not make roadmap mode the default for every task.
- Prefer adding or updating `BOOTSTRAP_ROADMAP_GOVERNANCE.md` for reusable roadmap process rules instead of hardcoding them into project-local docs.
- Do not leak app-specific dates, branch names, tracker filenames, or domain language into the bootstrap templates.
- Valid reusable governance examples include:
  - adaptive thresholds for no-roadmap vs ExecPlan-only vs roadmap
  - active-worktree authority during in-flight wave work
  - `SESSION_RESUME.md` as the roadmap anchor file and stable fresh-session entrypoint
  - detour/closeout update order
  - dormant roadmap state on `main`

## Cleanup and Continuity Promotion Rule
- Promote cleanup/publish lessons when they generalize across future repos.
- Valid reusable examples include:
  - stale post-merge continuity
  - stale active-plan inventory
  - scratch artifact Source Control noise
  - follow-up branch/PR as the default for missed post-merge repair
- Prefer updating the existing core-contract, roadmap-governance, issue-memory, and prompt/trigger templates instead of inventing a new bootstrap module for this lesson.

## Required Validation
Any bootstrap update should finish with:
- `dart run tooling/validate_agent_docs.dart`
- `dart run tooling/validate_workspace_hygiene.dart`
- `dart run test/tooling/validate_agent_docs_test.dart`

## Expected Output For `update codex bootstrap`
- changed files
- what reusable workflow lesson or drift triggered the update
- validator commands and results
- explicit note that the change was scoped to the bootstrap system

## Docs Sync Prompt Rule
Bootstrap-generated repos must preserve the exact docs-sync prompt:
- `Would you like me to run Assistant Docs Sync for this change now?`

But the prompt is conditional:
- ask it only when relevant touched-scope docs still remain unsynced and immediate same-task synchronization is necessary
- if immediate same-task synchronization is not necessary, defer it to a later docs-maintenance pass
- do not ask it again if the relevant docs sync already ran during the same task/pass
