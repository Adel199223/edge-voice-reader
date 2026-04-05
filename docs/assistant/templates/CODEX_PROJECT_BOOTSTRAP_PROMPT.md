# CODEX Project Bootstrap Prompt (Entrypoint)

## Purpose
This file is the canonical entrypoint for bootstrapping a new Codex-managed project or upgrading an existing repo harness.

It is intentionally small. Detailed policy now lives in read-on-demand sub-bootstrap files under `docs/assistant/templates/`.

## Read Policy
- `docs/assistant/templates/*` is read-on-demand only.
- Vendored `docs/assistant/templates/*` files are committed project assets in bootstrapped repos.
- Load only the sub-bootstrap files required by the project and its triggers.
- Do not bulk-load every template file by default unless the task is to refactor the bootstrap system itself.
- Template maintenance is protected work. Do not edit `docs/assistant/templates/*` during normal project work unless the user explicitly invokes a canonical bootstrap maintenance trigger from `BOOTSTRAP_UPDATE_POLICY.md`.

## Newbie-First Layer (Optional: remove for developer-first repos)

- Assume user is a complete beginner/non-coder unless this section is removed or the user explicitly requests technical depth.
- Do not reduce testing, validation, approval gates, or canonical precedence in beginner mode.
- If user explicitly requests developer depth, switch style while keeping all governance contracts unchanged.
- For support/explainer work, use this structure: plain-language-first, steps-second, canonical-check-last.
- Support reply skeleton: `plain explanation -> numbered steps -> canonical check -> uncertainty note if needed`.
- Define unavoidable technical terms in one sentence.
- Generated user guides must include near the top:
  - `## Quick Start (No Technical Background)`
  - `## Terms in Plain English`

## Bootstrap Execution Order
1. Read this entrypoint.
2. Read `BOOTSTRAP_TEMPLATE_MAP.json`.
3. Load `BOOTSTRAP_CORE_CONTRACT.md`.
4. Load `BOOTSTRAP_ISSUE_MEMORY_SYSTEM.md`.
5. Load `BOOTSTRAP_PROJECT_HARNESS_SYNC_POLICY.md`.
6. Load `BOOTSTRAP_MODULES_AND_TRIGGERS.md`.
7. If the task is bootstrap maintenance, load `BOOTSTRAP_UPDATE_POLICY.md` and follow its trigger semantics.
8. If bootstrap maintenance is active, inspect `docs/assistant/ISSUE_MEMORY.md` and `docs/assistant/ISSUE_MEMORY.json` and use only generalized issue entries marked `possible` or `required`.
9. Activate additional sub-bootstrap files only when their trigger conditions apply.
10. Generate or update the project harness.
11. Run validator coverage so the harness cannot silently drift.

## Profile-first bootstrap resolution

Before selecting or reapplying template modules, read these files in this order when they exist:

1. `docs/assistant/HARNESS_PROFILE.json`
2. `docs/assistant/runtime/BOOTSTRAP_STATE.json`
3. `docs/assistant/templates/BOOTSTRAP_VERSION.json`
4. `docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json`
5. `docs/assistant/templates/BOOTSTRAP_PROFILE_RESOLUTION.md`
6. the specific archetype file from `docs/assistant/templates/archetypes/`

### Resolution rules

- If `HARNESS_PROFILE.json` exists, treat it as the **source of truth** for archetype, mode, operator level, and explicit module overrides.
- Do not silently infer a different archetype when the profile already names one.
- Use the registry to resolve default modules for the chosen archetype and mode.
- Then apply `enabled_modules`, then subtract `disabled_modules`.
- If `uses_openai` is true, include `openai_docs_mcp`.
- If `needs_codespaces` is true, include `codespaces`.
- If `has_browser_bridge` is true, include `browser_bridge`.
- If the operator is `beginner` or `needs_safe_commands` is true, include `beginner_support`.
- If the project surface includes `desktop`, include `desktop_launcher` unless the profile explicitly disables it.

### Safety rules

- Preview the resolved changes before applying the harness.
- Write the resolved result to `docs/assistant/runtime/BOOTSTRAP_STATE.json` after preview.
- Treat `docs/assistant/templates/*` as vendored source material. Do not edit those files during normal repo work unless the user explicitly requests a bootstrap/template update.
- During migration, preserve compatibility with legacy module names by consulting the registry aliases.

## Template Files
- `BOOTSTRAP_CORE_CONTRACT.md`: universal governance, docs architecture, shorthand workflow semantics, OpenAI freshness routing.
- `BOOTSTRAP_ISSUE_MEMORY_SYSTEM.md`: always-on issue memory generation, capture triggers, docs-sync wiring, and bootstrap filtering.
- `BOOTSTRAP_PROJECT_HARNESS_SYNC_POLICY.md`: local `implement the template files` behavior, vendored-template protection, and harness-apply order.
- `BOOTSTRAP_MODULES_AND_TRIGGERS.md`: optional module trigger matrix and staged-execution behavior.
- `BOOTSTRAP_LOCAL_ENV_OVERLAY.md`: machine-local overlay for host profile and Windows/WSL routing.
- `BOOTSTRAP_CAPABILITY_DISCOVERY.md`: dynamic skill, MCP, and local-tool discovery.
- `BOOTSTRAP_WORKTREE_BUILD_IDENTITY.md`: approved baseline, worktree provenance, canonical runnable build, build-under-test identity.
- `BOOTSTRAP_ROADMAP_GOVERNANCE.md`: adaptive roadmap triggering, `SESSION_RESUME.md` as the roadmap anchor file, stage/wave structure, active-worktree authority, and detour/closeout governance.
- `BOOTSTRAP_HOST_INTEGRATION_PREFLIGHT.md`: host-bound integration preflight and same-host validation.
- `BOOTSTRAP_HARNESS_ISOLATION_AND_DIAGNOSTICS.md`: test isolation from live state, listener ownership checks, and support-packet ordering.
- `BOOTSTRAP_UPDATE_POLICY.md`: protected bootstrap-maintenance policy and canonical update triggers.
  - accepted shorthand alias: `UCBS` for `update codex bootstrap`

## Trigger Matrix
| Need | Load These Modules |
|---|---|
| Every project | `BOOTSTRAP_CORE_CONTRACT.md`, `BOOTSTRAP_ISSUE_MEMORY_SYSTEM.md`, `BOOTSTRAP_PROJECT_HARNESS_SYNC_POLICY.md`, `BOOTSTRAP_MODULES_AND_TRIGGERS.md` |
| Personal machine or dual-host optimization | `BOOTSTRAP_LOCAL_ENV_OVERLAY.md` |
| Skills, MCPs, or local tools may change workflows | `BOOTSTRAP_CAPABILITY_DISCOVERY.md` |
| Runnable app/GUI project or explicit parallel-worktree risk | `BOOTSTRAP_WORKTREE_BUILD_IDENTITY.md` |
| Long-running multi-wave / restart-sensitive work, or explicit roadmap/master-plan request | `BOOTSTRAP_ROADMAP_GOVERNANCE.md` |
| Local auth / browser / CLI integration is in scope | `BOOTSTRAP_HOST_INTEGRATION_PREFLIGHT.md` |
| Host-bound workflows span browser/app/local bridge or fragile listeners | `BOOTSTRAP_HARNESS_ISOLATION_AND_DIAGNOSTICS.md` |
| The user explicitly wants to maintain the global Codex bootstrap harness | `BOOTSTRAP_UPDATE_POLICY.md` |

## Compact Master Prompt (Copy/Paste)
```md
You are bootstrapping a new project harness.

Read `docs/assistant/templates/BOOTSTRAP_TEMPLATE_MAP.json` first.
Then load:
- `docs/assistant/templates/BOOTSTRAP_CORE_CONTRACT.md`
- `docs/assistant/templates/BOOTSTRAP_ISSUE_MEMORY_SYSTEM.md`
- `docs/assistant/templates/BOOTSTRAP_PROJECT_HARNESS_SYNC_POLICY.md`
- `docs/assistant/templates/BOOTSTRAP_MODULES_AND_TRIGGERS.md`

After reading those two files, decide which optional sub-bootstrap files are needed for this project. Load only the relevant ones.

Build a deterministic AI-first project harness that includes:
- canonical + bridge documentation
- machine-readable routing in `docs/assistant/manifest.json`
- validator tooling and tests
- `docs/assistant/ISSUE_MEMORY.md` and `docs/assistant/ISSUE_MEMORY.json` as standard generated project files
- the full vendored template set under `docs/assistant/templates/`
- a local apply path so `implement the template files` updates project harness files without editing the vendored template files
- explicit approval gates, ExecPlan rules, docs-sync policy, and worktree isolation
- shorthand semantics where bare `commit` means full pending-tree triage plus logical grouped commits and immediate push suggestion
- shorthand semantics where bare `push` means Push+PR+Merge+Cleanup unless the user explicitly narrows scope
- official-doc freshness routing for unstable OpenAI facts

If the project is being bootstrapped for a specific personal machine, encode that in a local environment overlay, not in the universal core contract.
If skills, MCPs, or local tools may affect workflows, dynamically discover and record them instead of hardcoding stale assumptions.
If the repo already carries vendored template files and the user says `implement the template files`, read those files as local input, update the project harness to match them, and do not edit `docs/assistant/templates/*` unless the user explicitly asks to update the template folder itself.
If the project needs long-running multi-wave, restart-safe execution, activate dedicated roadmap governance with adaptive thresholds instead of treating roadmap mode as the default for every task.
When roadmap governance is activated, generate docs/assistant/workflows/ROADMAP_WORKFLOW.md, docs/assistant/SESSION_RESUME.md as the roadmap anchor file, an active roadmap tracker, and an active wave ExecPlan, and make the active worktree authoritative during live wave work.
Generated roadmap repos must support both active and dormant `SESSION_RESUME.md` states, with dormant state on `main` explicitly saying that no active roadmap is currently open and that normal ExecPlan flow is the default until roadmap mode is reactivated.
If local host/auth integrations are in scope, require installation, auth, same-host validation, and a live smoke check before building the feature.
Issue memory should be generated by default in every project harness and used for Assistant Docs Sync and generalized bootstrap maintenance decisions.
If the project has a runnable app, GUI, local desktop workflow, or explicit multi-worktree testing risk, automatically activate the worktree/build identity protections and require latest-approved-baseline locking, worktree provenance, a canonical runnable build, merge-immediately-after-acceptance discipline, and build-under-test identity packets.
If host-bound workflows span browser/app/local bridge or fragile listeners, activate harness-isolation diagnostics so live machine state does not silently corrupt tests or debugging.
If the task is maintaining the global Codex bootstrap harness itself, load `docs/assistant/templates/BOOTSTRAP_UPDATE_POLICY.md` and follow its canonical triggers instead of assuming generic docs maintenance behavior.
When bootstrap maintenance is active, consult `docs/assistant/ISSUE_MEMORY.md` and `docs/assistant/ISSUE_MEMORY.json` but promote only generalized lessons whose bootstrap relevance is `possible` or `required`.
Generated repos must define bare `push` as continuity-closeout plus cleanup, including ExecPlan closeout, roadmap closeout when active, `SESSION_RESUME.md` update, and cleanup of known scratch outputs before merge.
Generated repos should default deterministic assistant review/debug artifacts under ignored `tmp/` unless they define a stricter local scratch root.
If post-merge continuity or cleanup was missed, generated repos should default to a follow-up branch/PR rather than silent direct repair on `main`.
`UCBS` is an accepted shorthand alias for `update codex bootstrap`, but the long form remains canonical.

Return:
1. changed/added files
2. the selected module set and why
3. validator commands and results
4. assumptions and dated external facts
5. any generated local-overlay or capability-inventory recommendations
```

## Design Rules
- Keep the bootstrap general for new apps.
- Generate issue memory as a standard subsystem for every project.
- Keep the full vendored template set committed so the repo can later reapply it locally.
- Use optional overlays for personal machine facts.
- Prefer dynamic capability discovery over hardcoded skills or MCP assumptions.
- Use adaptive roadmap governance for complex multi-wave work and keep smaller tasks on lighter planning modes.
- Keep `SESSION_RESUME.md` as the stable fresh-session anchor even when roadmap state is dormant.
- Generalize repeated workflow failures only where they become reusable rules, and prefer prevention rules over seeding fake project incidents.
- Preserve existing strong governance, stage-gates, docs-sync policy, and validator-first behavior.

## Maintenance Rule
If the template system changes materially, update both:
- the entrypoint/template map
- validator coverage that proves the template system is still self-consistent
- the bootstrap-specific update policy when maintenance semantics or protected-surface rules change
