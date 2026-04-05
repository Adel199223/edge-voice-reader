# Bootstrap Modules and Triggers

## What This Module Is For
This module tells the bootstrap process which optional workflow layers to add and when.

The goal is to keep the universal core small while still letting new repos activate richer modules only when the project actually needs them.

## Default Boot Sequence
1. Load `BOOTSTRAP_CORE_CONTRACT.md`
2. Load `BOOTSTRAP_ISSUE_MEMORY_SYSTEM.md`
3. Inspect the project request, user profile, repository state, and target platform
4. Activate only the relevant optional modules below
5. Generate or update the project docs and validator rules to match the selected module set
6. Record any disabled modules and why in the generated `APP_KNOWLEDGE.md`

## Trigger Matrix
| Module | Default | When To Activate |
|---|---|---|
| Beginner Layer | Conditional | When the user is clearly new, non-technical, or repeatedly needs simpler operational wording |
| Localization + Performance | Conditional | When multilingual UX/content or workspace watcher/index/performance risk exists |
| Reference Discovery | Conditional | When the user asks for parity or inspiration against named apps/sites/products |
| Browser Automation + Environment Provenance | Conditional | When browser UI or extension automation is in scope and at least one fragility signal exists |
| Cloud Machine Evaluation + Local Acceptance Gate | Conditional | When heavy cloud/API evaluation work is in scope and cost/run volume matters |
| Staged Execution | Conditional, mandatory when triggered | When risk is medium/high or at least two stage-gate trigger conditions are present |
| OpenAI Docs + Citation | Conditional | When OpenAI products/APIs or unstable external facts are in scope |
| Issue Memory System | Always On | For every project; generate project issue memory, docs-sync routing, and bootstrap filtering by default |
| Project Harness Sync | Always On | For every bootstrapped repo; generate local apply routing for vendored template files and keep template edits protected |
| Local Environment Overlay | Conditional | When the bootstrap is being tailored for a known personal machine or dual-host setup |
| Capability Discovery | Conditional | When skills, MCPs, or local tools may materially change the project harness |
| Worktree / Build Identity | Auto-Conditional | Automatically when the project has a runnable app, GUI, local desktop workflow, or explicit multi-worktree risk |
| Roadmap Governance | Conditional, adaptive when triggered | When work is multi-wave, restart-sensitive, cross-surface, worktree-isolated, or the user explicitly asks for a roadmap/master plan |
| Host Integration Preflight | Conditional | When an integration depends on local installs, auth state, or same-host runtime guarantees |
| Harness Isolation + Diagnostics | Conditional | When host-bound workflows span browser/app/local bridge/per-run/finalization, or when tests could collide with live machine state |
| Bootstrap Update Policy | Conditional | When the user explicitly wants to maintain the global Codex bootstrap harness |

## Canonical Bootstrap Maintenance Triggers
When the task targets the global Codex bootstrap harness itself, use these triggers instead of generic docs-maintenance wording:

| Trigger | Meaning |
|---|---|
| `update codex bootstrap` | Inspect the full bootstrap system, update only relevant template/validator files, then validate |
| `UCBS` | Accepted shorthand alias for `update codex bootstrap` |
| `audit codex bootstrap` | Inspect and report only, no edits by default |
| `check codex bootstrap` | Run bootstrap integrity validation only |
| `sync codex bootstrap docs` | Docs-only sync for already-implemented bootstrap/governance drift |

Hard rule:
- `update bootstrap` is not canonical and must be clarified instead of being assumed to target the global Codex harness.
- `UCBS` is accepted as shorthand, but `update codex bootstrap` remains the canonical wording in docs and examples.
- Normal project feature work must not edit `docs/assistant/templates/*` unless one of the canonical bootstrap triggers above was explicitly invoked.
- When bootstrap maintenance is active, consult project issue memory first and only generalize entries whose bootstrap relevance is `possible` or `required`.

## Canonical Project Harness Apply Triggers
When the task targets a repo's local harness rather than the reusable bootstrap source, use these triggers:

| Trigger | Meaning |
|---|---|
| `implement the template files` | Read vendored template files and apply them to the repo harness without editing the vendored template files |
| `sync project harness` | Accepted technical alias for the same local apply behavior |
| `audit project harness` | Inspect/report local harness drift only |
| `check project harness` | Validate local harness integrity only |

Hard rule:
- Vendored `docs/assistant/templates/*` files are committed project assets, not cleanup candidates.
- `implement the template files` must not edit `docs/assistant/templates/*`.
- `update bootstrap` is ambiguous and must be clarified between global bootstrap maintenance and local harness application.

## Issue Memory System Rule
Generated projects should always include issue memory by default.

Issue memory should:
- capture repeated workflow/product issues using operational triggers first and wording triggers second
- feed Assistant Docs Sync decisions at the project level
- feed `update codex bootstrap` / `UCBS` only for entries whose bootstrap relevance is `possible` or `required`
- stay concise and structured instead of becoming a narrative incident log

Do not wait for the first repeated issue before generating the issue memory files. They are part of the default harness.

## Worktree / Build Identity Auto-Activation Rule
Automatically activate `BOOTSTRAP_WORKTREE_BUILD_IDENTITY.md` when the project has:
- a runnable app
- a GUI
- a local desktop workflow
- explicit multi-worktree or multi-build testing risk

Generated projects in that class must include:
- latest approved baseline lock
- worktree provenance in ExecPlans
- canonical runnable build rule
- build-under-test identity packet
- canonical launch helper requirement
- noncanonical launch override rule
- merge-immediately-after-acceptance discipline

For CLI/library repos without those risks:
- keep the governance-level wording
- do not force unnecessary launch tooling

## Roadmap Governance Activation Rule
Activate `BOOTSTRAP_ROADMAP_GOVERNANCE.md` only when the work needs explicit roadmap behavior.

Use roadmap governance when work is likely to need:
- multiple waves or PRs
- fresh-session resume support
- detours and return-to-sequence handling
- worktree isolation
- cross-surface product coordination

If the user explicitly asks for a roadmap or master plan:
- activate the roadmap governance module even if a lighter flow might have been possible

Do not activate roadmap governance by default for:
- single-file fixes
- narrow bug fixes
- small UI text tweaks
- one-shot docs cleanup

For bounded major work that still lands as one merge:
- prefer ExecPlan-only
- do not force roadmap mode

When this module is activated, generated repos should include:
- `docs/assistant/workflows/ROADMAP_WORKFLOW.md`
- `docs/assistant/SESSION_RESUME.md`
- an active roadmap tracker in `docs/assistant/exec_plans/active/`
- an active wave ExecPlan in `docs/assistant/exec_plans/active/`

Generated repos should also document:
- `docs/assistant/SESSION_RESUME.md` as the roadmap anchor file
- both valid roadmap states:
  - active roadmap state
  - dormant roadmap state on `main`
- stages as optional research/spec phases and waves as implementation slices
- the active-worktree authority rule for live roadmap state
- the update order:
  1. active wave ExecPlan
  2. active roadmap tracker
  3. `docs/assistant/SESSION_RESUME.md`
- closeout ending in either archived roadmap artifacts or a dormant anchor on `main`
- the right to resequence future stages or waves when new discoveries force a better sequence
- the rule that roadmap mode is not the default for every task

Generated repos should also treat this as a reusable cleanup lesson routed through the existing governance modules:
- stale post-merge continuity
- stale active-plan inventory
- scratch artifact Source Control noise

## Stage-Gate Rules
Use staged execution when at least two of these are true:
- the work spans multiple surfaces
- the work touches risky external APIs or budget-sensitive systems
- the user asks for deep optimization or comparative research
- the work has medium/high failure or rollback cost

When staged execution is active:
- stop at stage boundaries
- require exact continuation tokens like `NEXT_STAGE_2`
- emit stage packets with changed files, validations, risks, and carry-forward assumptions

## Reference Discovery Rules
When a repo needs parity or inspiration research:
- prefer official product docs and official repos first
- then maintained high-quality repos
- avoid blind copying
- record adopted pattern vs local adaptation

## Browser Automation Rules
When browser automation is activated:
- verify toolchain availability before flow testing
- lock canonical workspace provenance before asset loading or browser actions
- separate host/tooling `unavailable` failures from application `failed` outcomes
- prefer machine checks first and human perceptual checks second

## Harness Isolation + Diagnostics Rules
When this module is activated:
- isolate tests from live user state, live ports, and authenticated machine state by default
- prefer temporary filesystem/env state and non-live or ephemeral test ports
- require explicit teardown for listeners, windows, and background workers
- make localhost bind conflicts visible in the runtime UI/status surface
- define one durable app-owned session artifact for multi-stage workflows and document the support-packet order

## Cloud Evaluation Rules
When cloud evaluation is activated:
- prefer cloud-first for heavy runs
- keep local-first for smoke checks, final apply, and human acceptance
- classify cloud preflight/tooling failures as `unavailable`
- classify logic/assertion failures after execution starts as `failed`

## Docs Sync Rule
Generated repos must keep docs-sync policy explicit:
- significant implementation change -> ask the exact docs-sync prompt only when relevant touched-scope docs still remain unsynced and immediate same-task synchronization is necessary
- if immediate same-task synchronization is not necessary, defer it to a later docs-maintenance pass
- if the relevant docs sync already ran during the same task/pass, do not ask the prompt again
- if approved, update only relevant docs for touched scope

## Cleanup and Publish Rule
Generated repos should encode cleanup-complete bare `push` semantics through the existing governance modules:
- continuity-closeout before merge
- roadmap closeout when active
- `SESSION_RESUME.md` update before merge
- cleanup of known scratch outputs
- follow-up branch/PR as the default if post-merge repair is still needed
