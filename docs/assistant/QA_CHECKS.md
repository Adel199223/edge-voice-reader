# QA Checks

## Harness

- `python3 tooling/check_harness_profile.py --profile docs/assistant/HARNESS_PROFILE.json --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json`
- `python3 tooling/preview_harness_sync.py --profile docs/assistant/HARNESS_PROFILE.json --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json --json`
- `python3 tooling/preview_harness_sync.py --profile docs/assistant/HARNESS_PROFILE.json --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json --write-state docs/assistant/runtime/BOOTSTRAP_STATE.json`
- `python3 -c "import json, pathlib; json.loads(pathlib.Path('docs/assistant/manifest.json').read_text()); print('manifest ok')"`

## Extension Static Checks

- `node --check background.js`
- `node --check popup.js`
- `node --check reader_core.js`
- `node --check page_reader_core.js`
- `node --check page_reader_content.js`
- `node --test *.test.js`

## Live Edge Validation

- `powershell -ExecutionPolicy Bypass -File C:\Users\FA507\edge_voice_reader\tooling\edge_voice_reader_smoke.ps1 -RepoRoot C:\Users\FA507\edge_voice_reader`
- the smoke JSON now reports `popupSelection`, `hotkeyRead`, and `hotkeyStop` alongside the existing voice/persistence checks
- if the smoke result is `manual_check_required`, treat that as an honest synthetic-gesture limitation and do one real manual confirmation for popup selection plus `Alt+Shift+R` / `Alt+Shift+X`
- for deterministic chip-layout checks, serve `tooling/fixtures/page_reader_hover_fixture.html` over `http://127.0.0.1` and use it before rechecking live ChatGPT
- confirm the loaded unpacked extension root is `C:\Users\FA507\edge_voice_reader`
- confirm toolbar click opens the in-page rail on a supported page
- confirm hovering a readable block reveals the smaller first-line chip, that it stays pinned while the pointer moves onto it, and that clicking it starts queue playback from that block
- confirm while the queue is active there is exactly one persistent inline chip, pinned to the active block, showing pause while speaking and play or resume while paused
- confirm the active block frame never overlaps the first letter of the text and the active sentence remains the primary highlight
- confirm clicking the page chip starts inline without forcing the rail open
- confirm while reading or paused, hovering another sentence shows pointer intent plus a lighter hover cue but does not start playback until a real click happens, and that click jumps there while playback continues forward
- confirm list-item clicks on active ChatGPT lists jump to the exact bullet and continue forward without replaying earlier items
- confirm rail previous, next, pause or resume, and stop controls work on a real page, and that the transport row uses icons instead of text labels
- confirm an unsupported page opens the fallback/manual reader with a clear explanation
- confirm saved voice and speed survive rail reopen, popup/manual reopen, and browser restart

## Workspace Hygiene

- keep repo-local Git `core.filemode=false` in this Windows/WSL checkout so archived files do not churn as mode-only edits
