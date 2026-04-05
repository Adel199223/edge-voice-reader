# New project bootstrap workflow

Use this workflow when creating a new repo or when converting an older repo to the profile-driven harness.

## Step 1 - Choose the closest archetype

Pick one of:

- `desktop_python_qt`
- `flutter_app`
- `web_app`
- `cli_tool`
- `api_service`
- `browser_extension`

## Step 2 - Generate a profile

```bash
python tooling/bootstrap_profile_wizard.py   --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json   --output docs/assistant/HARNESS_PROFILE.json
```

## Step 3 - Validate the profile

```bash
python tooling/check_harness_profile.py   --profile docs/assistant/HARNESS_PROFILE.json   --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json
```

## Step 4 - Preview the resolved harness

```bash
python tooling/preview_harness_sync.py   --profile docs/assistant/HARNESS_PROFILE.json   --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json   --write-state docs/assistant/runtime/BOOTSTRAP_STATE.json
```

## Step 5 - Sync the local harness

Run the normal harness sync workflow after the preview looks correct.

## Step 6 - Re-run validators

Validate the generated files and docs before continuing with feature work.

## Operator guidance

For beginner-led repos, prefer:

- `operator.experience_level = beginner`
- `operator.needs_safe_commands = true`
- `mode = standard` unless the repo is tiny or highly complex
