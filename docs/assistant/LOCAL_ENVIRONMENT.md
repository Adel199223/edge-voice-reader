# Local Environment

## Paths

- repo root: `/home/fa507/dev/edge-voice-reader`
- public repo: `https://github.com/Adel199223/edge-voice-reader`
- live unpacked extension root: `C:\Users\FA507\edge_voice_reader`
- smoke tooling: `C:\Users\FA507\edge_voice_reader\tooling\edge_voice_reader_smoke.ps1`
- latest smoke artifacts: `C:\Users\FA507\edge_voice_reader\out\edge_voice_reader_smoke\`

## Host Split

- use WSL for repo commands, file edits, harness validation, and static checks
- use Windows Edge for unpacked-extension loading, popup behavior, selection capture, and live speech validation

## Environment Notes

- load the unpacked extension from `edge://extensions`
- the daily-use browser target is Microsoft Edge, not Chrome
- protected pages like `edge://` cannot be used as the selection-capture truth test
