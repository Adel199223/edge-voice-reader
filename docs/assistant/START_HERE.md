# Start Here

This repo is a lightweight Microsoft Edge extension called `Edge Voice Reader`. Work from the WSL clone for repo commands, but use real Windows Edge plus the live Windows folder for the browser truth surface.

## Read Order

1. `README.md`
2. `docs/ROADMAP.md`
3. `docs/ROADMAP_ANCHOR.md`
4. the active ExecPlan that matches the current task
5. `agent.md`
6. `docs/assistant/manifest.json`

## Current Checkpoint

- product shape: standalone Edge-first extension at the repo root
- voice contract: only `Ava` and `Andrew`
- primary UX: toolbar click opens the in-page reader rail on supported pages
- fallback UX: `popup.html` remains the manual reader for unsupported pages and pasted text
- persistence contract: saved voice and speed must survive rail reopen, popup/manual reopen, and browser restart
- current assistant-harness checkpoint: `docs/assistant/HARNESS_PROFILE.json` plus `docs/assistant/runtime/BOOTSTRAP_STATE.json`

## Primary Surfaces

- canonical WSL clone: `/home/fa507/dev/edge-voice-reader`
- live unpacked extension root: `C:\Users\FA507\edge_voice_reader`
- main continuity docs: `README.md`, `agent.md`, `docs/ROADMAP.md`, `docs/ROADMAP_ANCHOR.md`
- Windows-host smoke validation: `tooling/edge_voice_reader_smoke.ps1`

## Default Resume Rule

If a new chat starts cold, anchor from `docs/ROADMAP_ANCHOR.md` first and only then reopen the active ExecPlan.
