# desktop_python_qt

Use this archetype for Windows-first desktop apps built in Python with a GUI and optional CLI companion.

## Good fit
- local desktop utilities
- GUI apps that still benefit from scripted validation or batch actions
- beginner-friendly apps where environment repair and launch scripts matter

## Default posture
- mode: `standard`
- favors plain-language docs
- favors local launch and repair commands
- normally does **not** assume Codespaces

## Recommended modules
- `beginner_support`
- `desktop_launcher`
- `host_integration`
- `diagnostics`
- `build_identity`

## Common repo-local outputs
- `scripts/run_app.ps1`
- `scripts/repair_env.ps1`
- `docs/assistant/START_HERE.md`
- `docs/assistant/SAFE_COMMANDS.md`
