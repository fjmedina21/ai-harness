# Durable Podman validation runtime

Version **0.8.0**, experimental. Gate C is LIVE VERIFIED only for the registered
gatec-synthetic project and exact local-podman fixed Node profiles. Its actual fresh
CLI case passed. Other scope remains validation_acceptance_pending; repository
flags, model claims and mocked tests cannot accept a profile.

The CLI requires a private create-only domain-HMAC acceptance record under the
registered journal root, using the existing proposal host key with a separate
domain. The record binds owner, complete project fingerprint, critical executed
runtime/auth/CLI code, pinned runtime options, effective probes and four distinct
native-approved durable test/output/timeout/cancel outcomes. Every invocation
rechecks signature, expiry, code/policy and actual evidence against SQLite. Maximum
record lifetime is 24 hours; workspace/source/snapshot validity can block it earlier.
A repeated completed command returns verified existing evidence without replay.
This is trusted host policy/corruption protection, not external attestation.

## Host composition

The existing ValidationCoordinator, SnapshotValidationRuntime, ToolDispatcher,
ApprovalBroker/DurableApprovalService, SQLite Journal v3 and FileValidationEvidenceStore
are reused. An AuthorizedValidationProject supplies exact canonical source/workspace,
current file policy, optional full authorization fingerprint and exact allowed action
profiles. The host independently authenticates the owner and checks capabilities;
absent project/action or a changed policy/snapshot rejects before runtime execution.

prepare validates the completed, consumed, human-reviewed L2 patch and expected
resulting snapshot; captures bounded regular single-link source bytes through
stdin; and returns a new pending sandbox operation and challenge. approve requires
a separately scoped GitHub owner verifier plus exact native human action review.
The review includes project source/workspace/snapshot and full action/profile, image,
argv, CPU/memory/PID limits, network policy, timeout and output limit. Patch intent
cannot be reused. execute accepts only that exact durable grant and acquires the
existing CAS/fenced lease before dispatcher consumption.

Approved effect-free actions can be approved/continued from another process.
Prepared/Running/Uncertain actions and interrupted evidence claims require
reconciliation, never retry. A completed patch lease cannot authorize a sandbox;
a new grant and epoch are required. Runtime execution is fenced before dispatch,
after policy revalidation and before evidence publication. Four-process offline
coverage exercises prepare, human fixture approval, execute and evidence inspection.

## Runtime and evidence

PodmanSnapshotValidationRuntime retains the existing dedicated rootless Machine,
pinned pre-pulled image, no host/engine socket mounts, no guest host-filesystem shares,
network none, read-only root, non-root UID, no-new-privileges, seccomp, no capabilities,
0.5 CPU, 256 MiB memory, 64 PIDs, 16 MiB noexec tmpfs, at most 10 seconds per action
and 1024 bytes per action output. No machine start/reconfiguration, image download,
package install or host execution of project code is automatic. Node-only actions
remain the accepted implementation boundary; no privileged native/package build.

Evidence publication precedes journal terminal completion. Evidence includes exact
operation/workspace/snapshot/transfer/action/image, times, bounded output digest,
classification and cleanup status. inspectEvidence verifies its artifact/reference,
current owner/project/action, workspace snapshot, consumed grant and completed
journal result without calling Podman. Uncertain or corrupt data cannot become a
successful execution. Output files and claims use private create-only durable writes.

Filesystem evidence and SQLite are not one transaction. Process death after Running,
unknown commit acknowledgement, missing evidence or cleanup uncertainty blocks replay.
Digests detect corruption; same-UID malicious host edits are outside the boundary.
Guest staging modes are not kernel immutability against the owning UID.
See [threats](phase9b-security.md), [E2E](phase9b-e2e.md) and
[current report](phase9-real-acceptance-report.md).
