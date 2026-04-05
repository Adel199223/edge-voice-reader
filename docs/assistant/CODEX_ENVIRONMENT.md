# Codex environment notes

Use this file to make Codex and other coding agents easier to work with in this repo.

## Goals

- make setup expectations explicit
- reduce repeated environment discovery
- keep OpenAI-related docs lookup easy when relevant
- avoid unsafe or overly broad MCP defaults

## Safe default MCP posture

- prefer official, read-only documentation MCP servers when possible
- do not assume custom MCP servers are safe just because they are convenient
- keep project MCP examples minimal and reviewable

## Recommended local file

Copy `.vscode/mcp.json.example` to `.vscode/mcp.json` only if the repo actually benefits from it.

## Suggested agent instruction snippet

Add this line to your agent instructions file when the project uses OpenAI APIs or Codex heavily:

> Always use the OpenAI developer documentation MCP server if you need to work with the OpenAI API, ChatGPT Apps SDK, Codex, or related docs without me having to explicitly ask.

## Beginner-friendly guidance

If you are the main operator and you are still learning, keep this file short, concrete, and focused on:

- exact setup commands
- exact run commands
- exact validation commands
- one obvious recovery path when the environment breaks
