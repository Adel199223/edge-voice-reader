# Session Resume

Use this workflow when a new chat needs to pick up the Edge Voice Reader work from the standalone repo without referring back to the archived `edge_local_tts` repo.

## Resume Order

1. `README.md`
2. `docs/ROADMAP.md`
3. `docs/ROADMAP_ANCHOR.md`
4. the active ExecPlan that matches the current task
5. `agent.md`
6. `docs/assistant/manifest.json`

## Rules

- this repo is a standalone Edge extension, not a daemon-backed app
- keep Ava and Andrew as the only surfaced voices unless the roadmap changes on purpose
- use Windows Edge plus `C:\Users\FA507\edge_voice_reader` for live playback truth and the WSL clone for repo commands
- when harness maintenance is the task, start from `docs/assistant/HARNESS_PROFILE.json` and `docs/assistant/runtime/BOOTSTRAP_STATE.json`
