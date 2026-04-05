# Diagnostics

## If The Popup Does Not Speak

1. Run `wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && node --check background.js'`.
2. Run `wsl.exe bash -lc 'cd /home/fa507/dev/edge-voice-reader && node --check popup.js'`.
3. In Windows Edge, reload the unpacked extension from `edge://extensions`.

## If Ava Or Andrew Show As Unavailable

1. Treat Windows Edge as the truth source, not `getVoices()` output alone.
2. Run `powershell -ExecutionPolicy Bypass -File C:\Users\FA507\edge_voice_reader\tooling\edge_voice_reader_smoke.ps1 -RepoRoot C:\Users\FA507\edge_voice_reader`.
3. If the smoke script cannot start direct `chrome.tts.speak()` playback for the exact voice name, keep the popup blocked instead of falling back to another voice.

## If Use Selection Fails

1. Confirm the current page is a normal `http` or `https` page.
2. Expect `edge://`, extension pages, and other protected pages to reject script injection.
3. Re-test on a normal webpage before treating selection capture as broken.

## If Validation Is Ambiguous

- treat WSL as the command and edit home
- treat `C:\Users\FA507\edge_voice_reader` plus Windows Edge as the live playback home
- do not accept a WSL-only browser check as enough for real extension validation
