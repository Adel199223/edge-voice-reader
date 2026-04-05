# Host Integration

This repo depends on two host contexts:

- WSL for repo commands, harness tooling, and static checks
- Windows for Microsoft Edge, unpacked-extension loading, keyboard shortcut validation, and live speech playback

## Preflight Rules

- confirm Microsoft Edge is installed on the Windows host
- confirm the unpacked extension loaded in Edge points at `C:\Users\FA507\edge_voice_reader`
- confirm direct-call probes can start the exact Ava and Andrew voice names
- if the probe fails, classify that as unavailable instead of silently substituting another voice

## Practical Notes

- `getVoices()` alone is not enough for this repo's voice contract
- `activeTab` means popup-driven selection capture depends on a real live tab context
- full automation cannot fully replace one real Windows-host smoke run after voice-path changes
