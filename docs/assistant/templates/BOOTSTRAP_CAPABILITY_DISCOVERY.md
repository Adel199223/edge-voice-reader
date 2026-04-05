# Bootstrap Capability Discovery

## What This Module Is For
This module keeps local tool, skill, and MCP assumptions fresh instead of hardcoding them into universal docs.

## Use It For
- local tool discovery
- AGENTS skill discovery
- MCP availability checks
- workflow-routing decisions that depend on machine capabilities

## Generated Output
Generated repos should include:
- `docs/assistant/LOCAL_CAPABILITIES.md`

## Rules
- Record only discovered capabilities that materially affect workflow decisions.
- Do not record secrets.
- Do not hardcode stale tool assumptions when the local environment can be inspected directly.
