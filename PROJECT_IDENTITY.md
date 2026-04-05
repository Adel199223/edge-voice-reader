# Project Identity

## Product

- Name: `Edge Voice Reader`
- Surface: Microsoft Edge MV3 extension
- Audio path: Microsoft Edge voices via `chrome.tts`

## Canonical source

- Canonical Windows source of truth: `C:\Users\FA507\edge_voice_reader`
- Load unpacked from this folder only.
- Temp snapshots under `C:\Users\FA507\AppData\Local\Temp\edge-voice-reader-smoke\...` are recovery artifacts, not live sources of truth.
- WSL `edge_local_tts` paths are not live sources while WSL is disabled.

## Boundary rules

- No localhost base URL settings belong in this project.
- No `/v1/health`, `/health`, `/v1/speak`, or streamed-audio daemon flows belong in this project.
- `local_tts_multilingual` owns the localhost daemon and its API/runtime contracts.
- `Edge Voice Reader` owns `chrome.tts` playback, voice persistence, the in-page rail, the popup/manual reader, and keyboard shortcuts.

## Operator note

- If `edge://extensions` ever shows this project next to `Local TTS Connector`, treat that as drift and clean the active profile before continuing work.
- Run `audit_project_boundaries.ps1` before loading a new copy if there is any doubt about cross-project contamination.