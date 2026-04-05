# Bootstrap Host Integration Preflight

## What This Module Is For
This module governs workflows that depend on local installs, auth state, or same-host runtime guarantees.

## Use It For
- browser or desktop automation with local auth
- CLI integrations that require installation checks
- same-host app-plus-browser workflows

## Required Behavior
- verify required installs before feature work
- verify auth state before relying on a host-bound tool
- validate the target app and dependent tool on the same host
- run one live smoke check before claiming the integration works

## Failure Classification
- missing install/auth/preflight = `unavailable`
- logic or assertion failure after execution starts = `failed`
