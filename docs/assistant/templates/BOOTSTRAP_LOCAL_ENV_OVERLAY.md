# Bootstrap Local Environment Overlay

## What This Module Is For
This module keeps personal-machine facts out of the universal bootstrap contract.

## Use It For
- Windows vs WSL routing
- host-specific launch commands
- local path conventions
- machine-local secrets or auth prerequisites

## Generated Output
Generated repos should include:
- `docs/assistant/LOCAL_ENV_PROFILE.example.md`

Machine-local overlays should live in:
- `docs/assistant/LOCAL_ENV_PROFILE.local.md`

## Hard Boundary
- Universal docs stay machine-neutral.
- Personal-machine facts must not be written into the core bootstrap contract.
