# Issue Memory

Keep repeated lessons short and concrete.

## Current Reusable Lessons

- `chrome.tts.getVoices()` is not reliable enough to discover Ava and Andrew on this machine
- direct `chrome.tts.speak({ voiceName })` probing is the real compatibility check
- Windows Edge is the live playback truth source, while WSL remains the repo command home
- keep the extension lightweight and do not drift back toward daemon or local-model architecture
- do not auto-fallback to another voice when Ava or Andrew are unavailable
- transient popup/runtime errors should clear on reopen; persistent blocking should come from saved voice availability only
- keep `popup.html` stable because the smoke harness opens it directly, even though the primary user entry path is now toolbar-to-page-rail
- on supported pages, the safest toolbar flow is send-message first and one-shot script reinjection second, then manual fallback if the rail still cannot open
- synthetic CDP popup clicks and shortcut chords may still require one manual Windows-host confirmation, so `manual_check_required` is a valid smoke outcome
- for sentence highlighting, build the spoken block text from live DOM text nodes rather than `innerText`, then map sentence ranges back through those same text-node segments for CSS Highlights API painting
- for sentence-jump clicks, resolve the pointer to a caret position first, then map that text-node offset back through the projection segments before choosing the sentence index
- keep sentence jumping click-only; hover may preview a sentence, but it must never mutate playback or queue state
- while a page-reader session is active, show only one inline paragraph chip and bind it to the active block so its icon can track play, pause, and resume without competing hover chips elsewhere
- keep repo-local Git `core.filemode=false` in this workspace to avoid archive-only mode churn on `main`
