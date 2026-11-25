# AI Harness architecture

Version **0.8.0**, experimental local software-engineering tool.
**Single Developer + Single GitHub Identity + Explicit Project Authorization +
Human-Confirmed Personal L2 + Durable Podman Validation.**

## Independent controls

```text
GitHub OAuth + PKCE + online owner verification
                 ↓
Private host project registry + capabilities + resource limits
                 ↓
Exact diff + APPROVE + native macOS authentication
                 ↓
Durable Personal grant → fenced isolated patch application
                 ↓
Exact sandbox review + separate native human confirmation
                 ↓
Durable sandbox grant → existing rootless Podman runtime
                 ↓
Private durable evidence → read-only inspection/reconciliation
```

`Authenticated != Authorized != Approved`. Authentication verifies the one
numeric `ownerAccountId`; it never grants filesystem, provider or execution
permission. Authorization is current trusted host policy, independent per project.
Approval is single-use human intent for a concrete action, not a property of login.

## Package ownership

Contracts define bounded provider, patch, approval, workspace and evidence types.
Security owns GitHub verification, human-intent verification and the existing
ApprovalBroker/DurableApprovalService. Checkpointing owns HMAC proposal artifacts,
SQLite Journal v3 and private evidence storage. Tools own policy/path admission,
ToolDispatcher, workspaces, patch handling, snapshot transport, ValidationCoordinator
and SnapshotValidationRuntime. Application composes the existing sequential roles
and apply-only continuation. CLI is the trusted host composition boundary.
Provider-native schemas remain inside provider adapters.

The [project registry](project-authorization.md) separates canonical source/private
workspace trees and explicitly lists capabilities, files, operations, tools,
provider/time budgets and validation action profiles. Full authorization fingerprints
are included in authenticated artifacts. Source, prompts and generated patches
cannot change policy, register projects, approve themselves or choose arbitrary
commands. There are no identity assignments, external approvers or operational Team paths.

## Durable state and recovery

SQLite CAS, expiring single-use grants, unique human-intent IDs and lease epochs
remain the concurrency boundary. Approved effect-free patch/sandbox operations may
transfer sessions. Prepared, Running and Uncertain effects never resume or replay
automatically. Artifact/snapshot/policy/owner changes fail closed. Validation uses
the existing runtime and stores bounded private evidence before terminal commit.
`inspectEvidence` verifies the artifact, grant, action, snapshot and journal result
from a new process without invoking a runtime. Incomplete evidence/cleanup remains
uncertain and requires reconciliation; no exactly-once or cross-store atomicity claim.

## Acceptance boundary

Offline tests use synthetic verifiers and mocked Podman plus real private FS,
SQLite and independent processes. They do not prove live identity, native intent,
VM isolation or current resource enforcement. Current explicitly authorized actual
acceptance is limited to gatec-synthetic/local-podman fixed Node profiles; the fresh
CLI test passed with separate native grants. Other scope remains BLOCKED. A private
domain-HMAC record binds current owner/project/code/runtime, effective probes and
four exact native-approved durable outcomes. Its expiry or any mismatch retains
validation_acceptance_pending. No Phase 9C,
Phase 9D, deployment, publication or original-source integration is implemented.
See [security](phase9-security.md), [Podman security](phase9b-security.md),
[migration](single-developer-migration.md) and [evidence](VERIFICATION.md).
