
# Phase 2 — Tool Execution Security

## Status

Experimental implementation. Not a production security boundary.

## Implemented controls

- Typed tool definitions and argument validation.
- Default Deny permission enforcement.
- Human approval state machine with one-time consumption.
- Approval binding to execution, workspace, tool, permission,
  risk and canonicalized arguments.
- Workspace-relative file reads with path restrictions.
- Common sensitive-file name restrictions.
- File size and agent context limits.
- Fixed subprocess allowlist without shell interpretation.
- Command timeout and captured-output limits.
- Agent access to tools is opt-in.

## Known limitations

1. File path validation is not atomic against concurrent
   filesystem modifications.
2. Filename filtering cannot guarantee detection of secrets.
3. Tool approvals are held in memory and do not survive restart.
4. Approval decisions are not authenticated by this package.
5. Tool handlers are trusted host code, not sandboxed plugins.
6. Subprocess execution has no OS-level isolation.
7. Prompt-injection defenses are best-effort.
8. Dynamic model-generated tool calls are not enabled.
9. The default CLI and SDD workflow do not automatically
   execute tools.

## Production requirements

Before using this runtime with untrusted repositories
or arbitrary commands:

- Introduce isolated execution environments.
- Enforce network, process, CPU, memory and filesystem limits.
- Add authenticated human approval interfaces.
- Persist approval decisions and audit events transactionally.
- Bind execution permissions to trusted host configuration.
- Review and harden filesystem operations against race conditions.
- Add adversarial security and integration tests.
- Define cancellation and recovery behavior.

## Security principle

Tools must never obtain permissions, approvals or execution
authority from model-generated content.

## Phase 4 integration note

This review records its original phase boundaries. Native provider tool calling
is now opt-in through an explicit read-only host API; see
[Phase 4 security](phase4-security.md) for implementation and validation scope.
Historical statements about absent native integration/default exposure do not
replace that current scope. The filesystem, container, approval/audit and
recovery limitations above remain unresolved.
