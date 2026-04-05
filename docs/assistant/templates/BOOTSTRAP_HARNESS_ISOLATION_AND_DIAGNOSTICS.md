# Bootstrap Harness Isolation and Diagnostics

## What This Module Is For
This module hardens host-bound workflows against live-machine interference and weak diagnostics.

## Activate It When
- browser/app/local-bridge workflows share one host
- tests or listeners could collide with live machine state
- a multi-stage workflow needs one durable session artifact

## Required Behavior
- isolate tests from live user state, live ports, and authenticated machine state by default
- prefer temporary filesystem/env state and non-live or ephemeral test ports
- require teardown for listeners, windows, and background workers
- surface localhost bind conflicts and listener ownership problems clearly
- define one durable session artifact and one support-packet order for multi-stage troubleshooting
