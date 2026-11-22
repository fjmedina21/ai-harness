# Phase 6 security review

Locally implemented, unpublished experimental local-first durable operations.
Not production autonomous execution.

## Trust boundaries and controls

Host owns the private store location, session, requester identity, verifier,
allowlists, safety classification, permissions, approval policy and recovery
evidence. Models/providers cannot access the journal or approval service.
Default Deny and registry validation still precede operation creation. The durable
path does not accept in-memory approval grants. Decision identity is verified by
the host and must have harness:approver; no real IdP is provided by this phase.

Operations progress through Created, PendingApproval, Approved, Prepared,
Running and terminal Completed/Failed/Cancelled; Uncertain is blocked and only
host evidence may resolve it. Prepared consumes authorization in the same SQLite
transaction. No handler begins before durable Running. Neither failure nor
cancellation rolls effects back. Session-bound preparation/grants cannot be
reused after reopening storage. Duplicate requests, changed scope and terminal
operations are never automatically dispatched again.

Reconciliation is explicit, version-checked and journaled. The host must stop or
fence all dispatchers before declaring interruption. Opening storage never
resumes work or decides that another process has died. No automatic replay of
reads or writes; a separately reviewed new request uses normal authorization.
Confirmed external completion or confirmed absence of effects requires host
supplied bounded evidence references; model assertions are not evidence.

## Storage profile and threats

Use an absolute host-selected private directory, owner-only permissions, regular
single-link database files, no symlinks, local filesystem, SQLite rollback
journal and sync. Bound input, record, event, query and database sizes. Detect
physical corruption and validate payload checksums/domain state; refuse invalid
schema/version or storage errors. Do not delete/rebuild broken authorization
state. Persist scope digests and result digests only, no raw arguments/results,
credentials or exception contents. Evidence references must be opaque host IDs,
not sensitive data or URLs with secrets.

Checksums detect accidental corruption, not a malicious database owner. Private
permissions do not prevent hostile same-UID code, parent-directory replacement,
root access, snapshots rolled back by the operator or a compromised host.
Restoring old databases requires manual review; no anti-rollback/tamper-evident
hardware is supplied. Full disk, lock contention and failed commits fail closed.
A failed commit acknowledgement can still leave a committed record: inspect
storage without replay. Filesystem/hardware durability and power-loss behavior
are not established merely by passing process-crash tests.

## Preserved restrictions

No arbitrary shell, Git writes, deployments, automatic replay, container policy
changes, new credentials, self-approval or repository-selected authority. Existing
filesystem TOCTOU and partial-write limitations remain. Legacy memory approvals
remain available only on the unchanged non-durable path. Provider sessions and
JSON runtime checkpoints are not an atomic transaction with the operation DB.

## Implemented limits and recovery boundary

The private local SQLite profile, schema, sync policy and fixed ceilings are
documented in [the architecture](phase6-durable-execution.md). Consistent
transactions validate operation/grant/event coherence. Expiration is checked at
decision, consumption and immediately before Running. Approval reads and startup
validation use a transaction to avoid mixed cross-process snapshots.

Every store open creates a fresh session: old unused approved grants, consumed
grants and prepared/running operations cannot execute through the new session.
Cross-process approval handoff is deliberately unsupported. Explicit host
reconciliation first requires quiescence/fencing; version checks cannot stop an
external worker. A result digest is correlation, not authenticated proof.

Distinct new request IDs are new operations. The host must not use fresh IDs to
bypass uncertain effects. Failed is reserved for known pre-execution domain
failures; a handler exception is always uncertain. Pending approvals stop agent
loops; no task/native-session continuation or automatic CLI recovery exists.
Legacy in-memory APIs remain non-durable; new persistence guarantees apply only
to the explicit durable path.

The threat model does not include a compromised host/verifier or malicious
same-user storage owner. Checksums are not MACs, database backups can be rolled
back and offline authorization is not a deployed IdP. Relying on wall-clock
expiry assumes a trustworthy host clock. Hardware power failure, disk failure
and network/cloud-filesystem locking semantics remain outside local evidence.
Host synchronous database work can block up to its busy timeout; opening a
bounded store performs full domain/history validation. No data retention,
encrypted-at-rest backend or automatic archival is provided.

The separately requested Podman helper rename to
computePodmanMachineFingerprint changes naming only: its SHA-256 inputs/output
and runtime policy are unchanged. The old alias was removed at the owner request.
No real container test was required for this rename.

See [verification](VERIFICATION.md) for exact local evidence and residual gaps.

## Failure retirement

A native storage failure or ambiguous transaction acknowledgement permanently
retires that store instance for execution. The dispatcher also retires its
binding after an unavailable storage-port call or failed started operation.
Retired sessions cannot register, decide, prepare, start or finish execution;
inspection, revocation and host reconciliation remain possible if storage works.
A rolled-back consumption can remain recorded as approved, but cannot be used
by the retired instance or any reopened session. Invalid requests/policy/scope
rejections are not storage outages. There is no automatic session reset or retry.
