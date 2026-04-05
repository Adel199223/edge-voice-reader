# Roadmap

## Product Direction

Keep this repository as one standalone Edge-first extension.

- The product identity is `Edge Voice Reader`.
- The active app is the unpacked MV3 extension at the repo root.
- Browser-native Edge voices are the only playback path.
- The first-class voices are `Ava` and `Andrew`, using the exact hidden Edge voice names validated on March 29, 2026.
- No localhost daemon, local models, CUDA, Piper, XTTS, or streamed audio belong in the default product path.

## Current Milestone

Ship and harden the page-reader milestone for the thin Edge extension.

- Keep the primary UX on supported `http/https` pages:
  - toolbar click opens or focuses the in-page reader rail
  - hover-only play button per readable block while idle
  - sequential reading from the clicked block onward
  - stable first-line hover chip that stays pinned while the pointer moves onto it
  - sentence-by-sentence highlight plus a non-obscuring block frame and auto-scroll
  - while reading, direct sentence hover and click to jump from that sentence onward
  - inline page starts stay inline; the rail opens only on explicit user action
- Support ChatGPT conversations and generic article-like pages first.
- Preserve the existing popup/manual reader as fallback and recovery surface:
  - pasted text
  - `Use Selection`
  - `Speak`
  - `Stop`
  - `read-selection` hotkey
  - `stop-reading` hotkey
- Persist preferred voice and speed across rail reopen, popup/manual reopen, and browser restart.
- Block and explain when Ava or Andrew are unavailable; never auto-fallback.

## Next Planned Milestones

1. Harden manual validation on real Edge host pages, especially ChatGPT and one generic article page.
2. Improve readable-block extraction quality and noisy-DOM exclusion without adding backend complexity.
3. Explore finer-grained word-level highlighting only if Edge emits boundary data reliably enough to justify it.

## Validation Standard

- Warm short-selection playback should feel immediate.
- Saved voice and speed must be reused by page-reader playback, popup/manual playback, and the read-selection hotkey.
- Toolbar click must open the in-page rail on supported pages and a clear fallback/manual reader on unsupported pages.
- Clicking a readable block must start there and continue through the remaining queue in order.
- The currently spoken block must stay visually obvious while the current sentence remains the primary reading highlight.
- List reads and list-item jumps on ChatGPT-style content must stay stable across rescans.
- New-chat continuity in this repo must work from `AGENTS.md`, `agent.md`, and `docs/ROADMAP_ANCHOR.md` alone.
