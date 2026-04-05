# Browser Bridge

The browser is the primary product surface in this repo, not just a companion.

## Canonical Browser Surface

- active extension root: `C:\Users\FA507\edge_voice_reader`
- background playback owner: `background.js`
- shared settings and voice metadata: `reader_core.js`
- in-page page-reader UI: `page_reader_content.js`
- page-reader extraction and queue helpers: `page_reader_core.js`
- manual fallback UI: `popup.html`

## Ownership Rules

- keep playback in the background service worker so rail or popup/manual close does not stop speech
- keep page-reader playback, popup/manual speak, and `read-selection` hotkeys on the same saved voice and speed path
- keep the surfaced voices limited to Ava and Andrew
- block and explain instead of silently falling back

## Validation Scope

- validate real playback in Windows Edge
- use unpacked-extension reloads after extension file changes
- treat protected pages and browser-owned pages as unsupported page-reader and selection targets
