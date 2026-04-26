# Roadmap Anchor

## Current Product
- Public repo: `https://github.com/Adel199223/edge-voice-reader`
- Canonical WSL clone: `/home/fa507/dev/edge-voice-reader`
- Live unpacked extension: `C:\Users\FA507\edge_voice_reader`
- Product: `Edge Voice Reader`
- Shape: standalone Edge extension, page-reader first on supported pages, no backend

## Locked Decisions
- Use Microsoft Edge voices only.
- Surface only:
  - `Microsoft AvaMultilingual Online (Natural) - English (United States)`
  - `Microsoft AndrewMultilingual Online (Natural) - English (United States)`
- Persist voice and speed in extension storage.
- Block and explain if the chosen voice is unavailable.
- Do not auto-fallback to another voice.

## Active Implementation Surface
- `manifest.json`
- `background.js`
- `reader_core.js`
- `page_reader_core.js`
- `page_reader_content.js`
- `page_reader_page.css`
- `popup.html`
- `popup.js`

## Important Technical Note
- On March 29, 2026, direct `chrome.tts.speak()` calls successfully started both hidden voice names even though normal voice enumeration did not list them.
- The extension should therefore probe and play by exact voice name instead of building the picker from `getVoices()`.
- On March 29, 2026, popup/runtime feedback was tightened so transient selection and playback errors clear on popup reopen; persistent blocking state must come from saved `voiceAvailability`, not stale runtime errors.
- On March 29, 2026, the primary UX moved to a Speechify-style in-page reader rail on supported `http/https` pages. Toolbar click should open that rail, while `popup.html` remains the fallback/manual reader surface for unsupported pages and direct manual text entry.
- On March 29, 2026, the page-reader rollout targeted ChatGPT conversations plus generic article-like pages first, using hover-only block play buttons, ordered queue playback, active-block highlighting, and auto-scroll.
- On March 30, 2026, the paragraph hover control was tightened into a smaller first-line chip with pinned-target behavior so it no longer drifts while the pointer moves onto it.
- On March 30, 2026, in-page playback switched from whole-block highlighting to sentence-by-sentence highlighting. The background now advances through sentence segments inside each block, and the content script paints the live DOM sentence ranges with the CSS Highlights API while keeping only a subtle block frame.
- On March 30, 2026, page-start playback stopped forcing the rail open. Toolbar click and the `Reader` handle still open the rail, but paragraph-chip starts and sentence jumps now stay inline unless the rail is already open.
- On March 30, 2026, active-reading mode gained sentence-jump behavior: while playing or paused, hovering another sentence should show pointer intent and a lighter hover cue, but only a completed click may restart from there while preserving forward queue continuation.
- On March 30, 2026, the paragraph chip became playback-aware: during active reading there should be exactly one persistent inline chip, pinned to the active block, showing pause while speaking and play or resume while paused, then moving forward as the queue advances.
- On March 30, 2026, the rail transport row switched from text labels to icon buttons while keeping the same block-level previous, play or pause, next, and stop actions.
- On April 1, 2026, page-reader reliability was hardened for ChatGPT Arabic content: queue cursor resets no longer replay finished paragraphs, unordered bullets no longer speak a marker label, and consecutive Arabic list items use a list-aware auto-advance/start-time path.
- On April 5, 2026, list targeting was tightened for ChatGPT and article-like pages: short `li` items now remain readable blocks, idle starts on any bullet begin from the first item of that nearest list, and active list-item clicks jump to the exact clicked item without replaying earlier bullets after rescans.
- On April 26, 2026, long ChatGPT paragraph starts were hardened: very long single Latin page-reader chunks can pre-split into startup clauses, pre-start failures are finalized in the debug report, and attempts now track startup/recovery chunking plus first-word timing without storing raw sentence text.
- On April 26, 2026, page-reader and manual replacement starts gained a 150 ms Edge TTS stop-settle barrier before the next `chrome.tts.speak()` call. This protects Ava/Andrew Natural playback from native restart races after sentence jumps, retries, recovery chunking, and voice probes; debug attempts now record the settle reason/duration and sanitized speak options without raw sentence text.
- Keep repo-local Git `core.filemode=false` in Windows/WSL checkouts so archived files do not reappear as mode-only dirtiness.

## Immediate Next Focus
- Keep the repo lightweight and extension-first.
- Preserve the archived `edge_local_tts` repo only as legacy continuity.
- Validate the in-page rail on a real ChatGPT conversation page and one generic article page.
- Confirm toolbar click, hover play, persistent active chip behavior, queue continuation, sentence highlight, sentence jumping, list-start behavior, and list-item jumps on real Edge.
- Keep popup/manual fallback persistence, selection import, and hotkey read/stop working as secondary paths.
