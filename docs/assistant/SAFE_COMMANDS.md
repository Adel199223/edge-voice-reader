# Safe Commands

Use these exact commands first when you need low-risk validation.

## Harness

```powershell
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && python3 tooling/check_harness_profile.py --profile docs/assistant/HARNESS_PROFILE.json --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json'
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && python3 tooling/preview_harness_sync.py --profile docs/assistant/HARNESS_PROFILE.json --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json --json'
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && python3 tooling/preview_harness_sync.py --profile docs/assistant/HARNESS_PROFILE.json --registry docs/assistant/templates/BOOTSTRAP_ARCHETYPE_REGISTRY.json --write-state docs/assistant/runtime/BOOTSTRAP_STATE.json'
wsl.exe bash -lc "cd /home/fa507/dev/edge-voice-reader && python3 -c \"import json, pathlib; json.loads(pathlib.Path('docs/assistant/manifest.json').read_text()); print('manifest ok')\""
```

## Extension Static Checks

```powershell
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && node --check background.js'
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && node --check popup.js'
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && node --check reader_core.js'
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && node --check page_reader_core.js'
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && node --check page_reader_content.js'
wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && node --test *.test.js'
```

## Windows Edge Smoke

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\FA507\edge_voice_reader\tooling\edge_voice_reader_smoke.ps1 -RepoRoot C:\Users\FA507\edge_voice_reader
```
