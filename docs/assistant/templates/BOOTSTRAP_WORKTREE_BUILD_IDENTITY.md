# Bootstrap Worktree Build Identity

## What This Module Is For
This module protects runnable-app repos from launch confusion across parallel worktrees.

## Activate It When
- the project has a runnable app
- GUI or local desktop execution matters
- multiple worktrees or build outputs can be confused

## Generated Expectations
Generated repos in this class should include:
- latest-approved-baseline discipline
- worktree provenance in ExecPlans
- one canonical runnable-build rule
- one build-under-test identity packet
- launch/build handoff guidance

## Hard Rules
- Do not hand off a runnable build without worktree path, branch, HEAD SHA, workspace file, and launch command.
- Do not let parallel worktrees share ambiguous build output without explicit identity reporting.
