# Edge Voice Reader Repurpose

## 1. Title And Objective
Repurpose the standalone `edge-voice-reader` repo into a thin Edge-first voice reader extension that uses only Microsoft Edge browser voices, with Ava and Andrew as the only surfaced voices and persistent voice/speed settings.

## 2. Scope In/Out
In scope:
- continuity docs and bootstrap files for the repurposed repo,
- legacy daemon archival inside the repo so current changes are preserved,
- repo-root extension rewrite into a background-owned `chrome.tts` reader,
- focused validation for hidden Edge voice probing, persistence, and selection-first playback.

Out of scope for this pass:
- whole-page article reading,
- ChatGPT/article import buttons,
- any localhost daemon path as part of the default UX,
- React/Vite or a bundled frontend stack.

## 3. Assumptions And Defaults
- Product home is the standalone repo plus live Windows extension pair:
  - `/home/fa507/dev/edge-voice-reader`
  - `C:\Users\FA507\edge_voice_reader`
- The repo-facing name and product-facing name are both `Edge Voice Reader`.
- The only surfaced voices are:
  - `Microsoft AvaMultilingual Online (Natural) - English (United States)`
  - `Microsoft AndrewMultilingual Online (Natural) - English (United States)`
- If the chosen voice is unavailable, the extension must block and explain instead of auto-falling back.
- Selection-first UX is the v1 priority; article/ChatGPT extraction is deferred.

## 4. Worktree And Build Identity
- Worktree path: `/home/fa507/dev/edge-voice-reader`
- Branch: `main`
- HEAD SHA at stage start: `ec2457a146c6c6f3d2b2bf873e3fccbc1b8d0d06`
- Primary browser target: Microsoft Edge on the Windows host attached to this workspace
- Distinguishing feature label: `edge-voice-reader-repurpose`

## 5. Implementation Steps
1. Add continuity docs for the repurposed repo: `README.md`, `docs/ROADMAP.md`, `docs/ROADMAP_ANCHOR.md`, `AGENTS.md`, and `agent.md`.
2. Preserve the current daemon-era files by moving them under a clearly named legacy/archive surface instead of deleting them outright.
3. Rewrite `manifest.json`, `background.js`, `popup.html`, and `popup.js` around direct `chrome.tts` playback, strict Ava/Andrew selection, and persisted settings.
4. Remove daemon-only fields and flows from the popup and service worker, keeping only selection-first actions and shared background playback state.
5. Add focused tests/checks for voice probing, settings persistence, and selection/error behavior.
6. Run static checks and a real Edge smoke probe that confirms direct-call Ava/Andrew support and saved-setting reuse.

## 6. Validation And Acceptance Criteria
- Repo docs consistently describe a standalone extension-first product rather than a daemon.
- Legacy daemon material remains preserved in-repo and is not presented as the active workflow.
- Popup and hotkey paths share one background playback implementation.
- Voice and speed persist across popup reopen and browser restart.
- Ava and Andrew direct-call probes succeed on the real Edge host, or the extension shows a clear blocking unavailable state.
- No localhost fetch, healthcheck, or streamed-audio code remains in the primary extension path.

## 7. Rollback/Fallback Strategy
- If direct hidden-voice probing proves unstable, keep the repo/docs repurpose and switch the extension to an explicit unavailable state rather than reintroducing the daemon path.
- If archival moves become risky because of existing uncommitted changes, preserve files in place temporarily and only rewrite docs plus the extension surface in this pass.
