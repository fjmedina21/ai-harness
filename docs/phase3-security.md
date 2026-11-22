
# AI Harness — Phase 3 Security Review

## Current runtime migration

This file preserves the Phase 3 review snapshot. Later phases replaced the
container backend with explicit Podman Machine profiles, added provider
tool-calling adapters, durable operation approvals and observability. The
historical Docker verification work items below are superseded by
[the current runtime/security profile](phase5-security.md) and later phase
documents. Read this review as evidence of the earlier implementation only.

## Status

Phase 3 implements experimental components for model tool calling,
restricted container execution, authenticated approval integration,
controlled workspace tools, and conservative recovery inspection.

**Phase 3 is not production-ready autonomous execution.**

## Implemented controls

### Tool calling
- Provider-independent model tool-call contracts.
- Structural validation of untrusted responses.
- Host-defined tool allowlists.
- Authorization through ToolDispatcher.
- Bounded model turns, tool calls, and tool-result sizes.
- Pending approvals stop agent execution.

### Container execution
- Fixed `node.version` operation.
- Image reference pinned to a SHA-256 digest.
- Disabled networking and read-only root filesystem.
- Dropped Linux capabilities and restricted resources.
- No workspace mounts or Docker socket mounting.
- Best-effort container cleanup.

### Approval and audit
- Interface for external identity verification.
- Role-based authorization for approvers.
- Append-only JSONL audit writes with fsync.
- Single-use, scoped, expiring approvals in memory.

### Workspace operations
- `file.write` is create-only and rejects existing files.
- Restricted relative paths and content-size limits.
- `git.status` is read-only and uses bounded subprocess execution.
- No Git commit, push, merge, or deployment tools.

### Recovery
- Inspection of existing runtime checkpoints.
- Identification of interrupted and uncertain tasks.
- Automatic replay of side-effecting operations remains disabled.
- No automatic execution resume.

## Known limitations

1. No real OpenAI/Anthropic tool-calling adapter integration yet.
2. No automatic CLI exposure of the new agent runtime.
3. Docker isolation has only been unit-tested with a mock runner.
4. Container runtime and Docker daemon security are not yet verified.
5. Filesystem path checks have possible TOCTOU races.
6. File writes may leave partial files after failures.
7. Audit events are not tamper-evident or transactional.
8. Approval state is in-memory and does not survive restarts.
9. The authentication verifier is an interface; no production IdP is configured.
10. AuthenticatedApprovalService is not yet the exclusive
    authorization path for ToolDispatcher.
11. Operation consumption and audit persistence are not atomic.
12. Recovery planning does not implement automatic resume or durable idempotency.
13. Prompt-injection resistance is best-effort, not a security boundary.
14. No protection against hostile Git repositories is guaranteed.

## Required production work

- Integrate and test real model-provider tool-calling adapters.
- Isolate untrusted workloads in a dedicated container runtime.
- Verify Docker isolation with real integration tests.
- Introduce transactional approval and operation storage.
- Connect a trusted identity provider and enforce exclusive approval access.
- Implement durable operation journaling and reconciliation.
- Harden filesystem access against races and partial writes.
- Add end-to-end security tests and operational monitoring.

## Release policy

- Keep model-driven privileged tool execution disabled by default.
- Do not enable arbitrary shell execution.
- Do not advertise automatic recovery or exactly-once execution.
- Do not enable deployment or Git write operations.
- Do not classify this phase as production-ready.

## Phase 4 integration note

This review records its original phase boundaries. Native provider tool calling
is now opt-in through an explicit read-only host API; see
[Phase 4 security](phase4-security.md) for implementation and validation scope.
Historical statements about absent native integration/default exposure do not
replace that current scope. The filesystem, container, approval/audit and
recovery limitations above remain unresolved.
