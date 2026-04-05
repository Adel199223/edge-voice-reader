# Capability Discovery

## Product Surfaces

- primary product: MV3 extension at the repo root
- live validation target: Microsoft Edge on the Windows host
- continuity layer: `README.md`, `agent.md`, `docs/ROADMAP.md`, `docs/ROADMAP_ANCHOR.md`

## Tooling Surfaces

- WSL-hosted repo commands for Node, Python, and harness tooling in `/home/fa507/dev/edge-voice-reader`
- Windows PowerShell smoke harness in `C:\Users\FA507\edge_voice_reader\tooling\edge_voice_reader_smoke.ps1`
- browser-side probe harness in `tooling/edge_voice_reader_smoke.mjs`

## Product Rules

- no backend, localhost daemon, CUDA stack, or local voice models in the active product path
- only the hidden Edge voice names for Ava and Andrew are supported
- popup playback and read-selection hotkeys share one background playback path
