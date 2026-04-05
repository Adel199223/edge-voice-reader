# AGENTS.md

Compatibility shim. Operational details live in `agent.md`.

## Canonical Rules
- `docs/ROADMAP.md` is the canonical product plan.
- `docs/ROADMAP_ANCHOR.md` is the continuity anchor for future chats.
- If docs conflict with code, source code is the final truth.

## Product Direction
- This repo is a standalone Edge-first voice reader extension.
- The active product surface is the repo root.
- The live unpacked extension continues to load from `C:\Users\FA507\edge_voice_reader`.
- The archived `edge_local_tts` repo is legacy continuity only and must not drive new implementation decisions.

## Workflow Defaults
- Keep the extension lightweight: no localhost daemon, no CUDA, no local voice models, no bundled frontend stack.
- Prefer browser-native playback through `chrome.tts`.
- Ava and Andrew are the only surfaced voices unless the roadmap is intentionally changed.

## Harness Routing
- Repo-local assistant bootstrap files live under `docs/assistant/`.
- For harness maintenance, start with `docs/assistant/HARNESS_PROFILE.json`, `docs/assistant/runtime/BOOTSTRAP_STATE.json`, and `docs/assistant/START_HERE.md`.
- Treat `docs/assistant/templates/*` as vendored harness source and do not edit those files unless the task is explicit bootstrap maintenance.

## Planning And Handoff
- Major work should update `docs/ROADMAP.md` when product direction changes materially.
- After significant implementation changes, refresh `docs/ROADMAP_ANCHOR.md` so a new chat can resume in this repo without external context.
