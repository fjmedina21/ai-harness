# Phase 9B — Podman validation runtime

Version **0.8.0**. The host API implements bounded snapshot validation using the
existing Podman-only backend, effective profile checks, ToolDispatcher and durable
approval journal. The CLI target is recognized but fails closed with
`validation_acceptance_pending`; actual GitHub/Keychain and current-code Podman
acceptance are not yet established. No generated-code workload was run as part of
offline verification.

## Host composition

`SandboxValidationRegistry` registers immutable trusted action profiles.
`ValidationCoordinator` derives the expected approved snapshot, checks the
completed L2 operation/reference and independently consumed patch approval,
authorizes the GitHub operator and captures the exact workspace inventory.
`PodmanSnapshotValidationRuntime` requires a host acceptance verifier on every
effect before calling the existing fixed container lifecycle. Merely constructing
the runtime or selecting a profile grants no authority.

`prepare(artifact, workspace, actionId)` submits `sandbox.validate` through
ToolDispatcher as high-risk `shell:execute`. It returns a pending durable approval.
This is a separate action approval: patch approval does not grant sandbox execution.
A trusted authenticated approver must decide that exact validation scope using
DurableApprovalService. `execute(..., approvalId)` uses the same journal operation
and one-use approval. The model cannot invoke an approval service or supply a raw
command. Requester/operator identity and approver must remain independent.

The validation binding covers artifact, resulting snapshot/transfer digest,
workspace and complete action profile digest, including image/resources/argv.
Before dispatch, the host must revalidate current operator permission and policy.
The coordinator has no model/provider port, automatic repair or source integration.
The journal admits the narrowly scoped new validation action after confirmed
independently approved `patch.apply`; it does not loosen generic lease recovery.
Prepare/approve/execute currently require the same trusted journal-owner session.
Cross-process continuation of interrupted validation actions is not implemented;
uncertainty is retained for manual reconciliation, never automatic resumption.

## Initial action profile

The initial `node-isolated-v1` profile deliberately fits the existing noexec tmpfs
boundary. It supports only fixed host-selected `node` argument arrays and an exact
canonical working directory. It is not a generic shell, `pnpm install`, package
manager, native toolchain or general TypeScript monorepo build profile. Build/test
tools and dependencies must already be reviewed/present in the pinned image;
unsupported requests remain blocked rather than relaxing the profile.

| Field | Required profile |
| --- | --- |
| Runtime | explicit Podman Machine, dedicated/disposable host attestation |
| Image | pre-pulled qualified OCI reference pinned by SHA-256 and platform |
| Executable | `node`; host-selected argv, no shell interpretation |
| Network | `none`; no forwarded proxy settings |
| CPU / memory / PIDs | 0.5 CPU / 256 MiB memory+swap total / 64 |
| Runtime timeout | finite, at most 10 seconds including existing preflight/lifecycle budget |
| Action output | finite, at most 1024 bytes |
| Runtime envelope output | at most 4096 combined bytes |
| Filesystem | read-only root, only bounded private 16 MiB `/tmp`, no host binds |
| Privilege | UID/GID 65534, dropped capabilities, no-new-privileges, seccomp |

Existing preflight verifies machine fingerprint/socket, rootless guest, cgroup
capabilities, image identity, absent host guest shares and effective container
metadata. No machine creation/start, image pull, permission expansion or runtime
repair is performed automatically. See [Phase 5 security](phase5-security.md).

## Results, cancellation and durable evidence

The fixed receiver verifies staging before executing the selected action and
returns bounded structured output tied to the exact snapshot/transfer digest.
Results distinguish passed, failed, timeout, cancelled, blocked and uncertain.
Output-limit/start failures cannot become passes. Host cancellation and deadline
handling retain independent owned-resource cleanup. Cleanup checks use exact
owner token and immutable container ID; no prune or unrelated removal occurs.

`FileValidationEvidenceStore` uses a pre-existing canonical private `0700`
directory, create-only `0600` files, fsync, digest checking and an exclusive
workspace claim. Evidence contains execution/workspace/snapshot/transfer/action
IDs, runtime/image digest, timestamps/duration, exit/classification, timeout/
cancellation, cleanup, output digest and fixed sanitized diagnostic IDs. Bounded
raw output is private separate evidence, never source telemetry. The journal
remains the authoritative operation/approval/replay boundary.

A successful action with uncertain cleanup is `uncertain`, never passed. Interrupted
claims, uncertain acknowledgments and Running effects require manual inspection;
they do not authorize replay. A passed selected test says nothing general about
generated code security or semantic correctness.

## CLI target and remaining gate

```sh
pnpm harness engineering validate --id EXECUTION_ID --profile local-podman --action test
```

The parser rejects arbitrary command arguments and requires authenticated operator
scope for the selected execution. It currently stops at the acceptance gate.
General CLI profile loading and validation-action approval/review orchestration
are not enabled. The host API is available for reviewed acceptance composition;
it must not be advertised as operational L3. See [real acceptance](phase9b-e2e.md).
