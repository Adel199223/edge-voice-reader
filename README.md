# Edge Voice Reader Extension

This directory is the active product surface for the repo: a lightweight MV3 extension that reads page blocks, selected text, and manual text with Microsoft Edge voices only.

## Canonical source of truth

- Canonical Windows repo: `C:\Users\FA507\edge_voice_reader`
- Load unpacked from this folder only.
- Do not load from `C:\Users\FA507\AppData\Local\Temp\edge-voice-reader-smoke\...`.
- Do not load from any `\\wsl.localhost\...` path while WSL is unavailable.
- This project is separate from `local_tts_multilingual` and must not depend on localhost daemon endpoints.
- See `PROJECT_IDENTITY.md` and `audit_project_boundaries.ps1` for the separation rules.

## Supported voices

- `Ava`
- `Andrew`

The extension stores both the stable key and the exact Edge voice name, then plays with direct `chrome.tts.speak({ voiceName })` calls.

## Primary page-reader UX

- Click the toolbar action on a supported `http/https` page to open the in-page reader rail
- Hover a readable block to reveal the play button
- Click a block play button to start there and continue through the remaining queue
- Use the rail for play or pause, previous, next, stop, voice choice, and speed
- The active block stays highlighted while Edge reads it

## Manual fallback reader

- `Use Selection`: imports the current page selection into the text box
- `Retry Voice Check`: reruns the silent compatibility probe for Ava and Andrew
- `Speak`: reads the current text with the saved voice and speed
- `Stop`: interrupts current playback

The same `popup.html` surface is also used as the fallback/manual reader page when a site cannot host the in-page rail.

## Keyboard shortcuts

- `Alt+Shift+R`: read the current selection
- `Alt+Shift+X`: stop reading

## Design rules for this connector

- Background service worker owns playback
- Toolbar click should prefer the in-page rail on supported pages
- Popup/manual reader remains the fallback and recovery surface
- Popup/manual close must not interrupt speech
- Voice and speed must persist across rail reopen, popup/manual reopen, and browser restart
- If the selected voice is unavailable, the extension must block and explain
- No localhost fetches, daemon health checks, or streamed audio belong in this path