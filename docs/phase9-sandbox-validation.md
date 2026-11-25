# Durable sandbox validation

Version **0.8.0**. ValidationCoordinator, SnapshotValidationRuntime,
ValidationEvidenceStore, ToolDispatcher, ApprovalBroker and SQLite v3 are the sole
existing execution path. There is no second runtime or autonomous repair.

The host verifies owner, registered project, current full policy, exact approved
patch/resulting workspace and snapshot before preparing a separate sandbox grant.
The human reviews project, workspace, snapshot, exact action/profile/image, resource
and output/time limits, types APPROVE and completes native authentication. The
patch receipt cannot grant execution. Approved effect-free sandbox operations may
transfer processes only under CAS/leases/fencing; uncertain effects never replay.

The fixed Node Podman backend preserves dedicated rootless Machine, no host mounts
or socket, network none, read-only root, no-new-privileges, no capabilities, seccomp,
fixed resources/time/output and independently verified cleanup. No machine provisioning,
pulls, installs or generated-code execution on macOS occurs automatically.

CLI local-podman additionally requires a private domain-HMAC acceptance record with
current owner/project/code/runtime, effective probes and four native-approved durable
outcomes. It revalidates that evidence before using the accepted action. Absent,
expired, tampered or changed acceptance remains validation_acceptance_pending.
Repeated completed commands inspect the original durable result, never replay it.

Current local acceptance is scoped to gatec-synthetic's exact profiles and pinned
image. Other projects/runtime profiles remain blocked. Cancellation evidence and
confirmed container cleanup coexist with conservative Uncertain journal state and
a retained claim requiring explicit reconciliation. No exactly-once claim exists.
See [runtime](phase9b-validation-runtime.md), [threat model](phase9b-security.md),
[E2E](phase9b-e2e.md) and [actual report](phase9-real-acceptance-report.md).
