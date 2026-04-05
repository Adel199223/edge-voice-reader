# Edge Voice Reader

## What This Repo Is
- A standalone Microsoft Edge extension for dyslexia-friendly read aloud.
- The extension uses Microsoft Edge voices only.
- The active app surface lives at the repo root, not in a nested app directory.

## Canonical Homes
- Public repo: `https://github.com/Adel199223/edge-voice-reader`
- Canonical WSL clone: `/home/fa507/dev/edge-voice-reader`
- Live unpacked extension: `C:\Users\FA507\edge_voice_reader`

## Product Defaults
- Preferred voices:
  - `Microsoft AvaMultilingual Online (Natural) - English (United States)`
  - `Microsoft AndrewMultilingual Online (Natural) - English (United States)`
- Selection-first workflow:
  - import selected text,
  - speak,
  - stop,
  - remember voice and speed.
- No automatic fallback to other voices.

## Technical Direction
- Playback is owned by the background service worker.
- Popup close must not interrupt speech.
- `chrome.tts.getVoices()` is not reliable for Ava/Andrew discovery on this machine; direct `chrome.tts.speak({ voiceName })` is the supported path.
- The popup should expose only the curated voice picker and speed control, not raw voice IDs or daemon fields.
- The in-page reader is the primary UX on supported pages; `popup.html` remains the fallback/manual reader.

## Repo Bootstrap
- Fresh-chat bootstrap now lives fully inside this repo under `docs/assistant/`.
- Use `docs/assistant/START_HERE.md` for re-entry, and use `docs/assistant/HARNESS_PROFILE.json` plus `docs/assistant/runtime/BOOTSTRAP_STATE.json` when the task is harness maintenance.
- Vendored files in `docs/assistant/templates/` are project assets and should only change during explicit bootstrap maintenance.

## Legacy Material
- The older `edge_local_tts` repo is archived continuity for this product line.
- Do not reintroduce daemon fetches, health checks, or streamed audio into the active extension path unless the roadmap changes intentionally.
