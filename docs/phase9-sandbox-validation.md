# Phase 9 sandbox validation — L3 blocked

`PodmanEngineeringValidator.available` is false and validate throws before any
process or container call. Existing Podman-only probe execution and effective
profile checks are unchanged. Docker is not reintroduced. Registering a fixed
`EngineeringValidationCommand` describes a host-selected intent, pinned image,
argv, timeout, log ceiling and resource ceiling; it grants no execution privilege.
The current production code has no workspace-transfer implementation.

Read-only environment inspection on 2026-11-23 found Podman 6.1.4 at
`/opt/podman/bin/podman` and the existing `ai-harness-isolation` Machine stopped.
No machine was started, provisioned or reconfigured; no profile credential was
opened and no isolation workload was run. A name and historical successful suite
do not establish current dedication, approval or effective workload isolation.
Remote evidence remains deferred.

## Snapshot transfer design awaiting independent approval

| Alternative | Assessment |
| --- | --- |
| Original project bind mount | Rejected: original metadata/host access and write exposure |
| General workspace bind mount | Rejected for this phase: weakens current no-mount profile |
| Git worktree in container | Rejected: shared Git authority and source provenance issues |
| Build a temporary image using project Dockerfile | Rejected: executes untrusted build/install instructions |
| General archive extraction / podman cp | Deferred: archive/link traversal, remote filesystem and cleanup risks |
| Bounded snapshot stream to trusted fixed entrypoint | Preferred proposal, not implemented or approved |

The preferred future transport would stream a closed bounded manifest plus file
bytes over a host-owned input channel to a pinned trusted entrypoint. The receiver
must verify manifest/content digest before exposing any content to the workload,
create regular 0600 files with exclusive no-follow operations under a new private
container-internal directory, reject links/devices/duplicates/traversal, enforce
aggregate bytes and keep original roots unmounted. No archive-provided metadata or
model-supplied entrypoint is accepted. The current ProcessRunner has no such
reviewed stdin transfer port; it must not be improvised through shell or argv.

Keep network none, non-root, read-only root, no capabilities/privileged/sockets,
seccomp, no-new-privileges and the effective CPU/memory/PID/tmpfs limits. Any staging
profile change requires separate review and authorization. Host-controlled image
tooling/dependencies must already be pinned; no generated install script runs on
the host. General native builds may be incompatible with the existing noexec
16 MiB tmpfs; do not relax it automatically to make tests run.

The runner must bind every validation to snapshot/workspace/profile/environment,
fixed validation ID, measured duration/exit, resources and confirmed independent
cleanup. Logs are bounded/redacted artifacts; telemetry contains no logs/patches.
Partial transport, timeouts, resource exhaustion, digest mismatch or cleanup doubt
must become Uncertain, with no automatic retry. Fixtures return explicit
kind=fixture evidence and do not test these real controls.

## Authorization and evidence required to unblock

1. Approve the concrete transport implementation and threat-model changes.
2. Confirm a dedicated disposable local Machine and approve generated-code execution.
3. Verify effective profile before current-code runs; do not mount host credentials.
4. Pass current real local isolation/resource/cancellation/cleanup tests.
5. Pass real end-to-end synthetic build/test/failure/repair scenarios through the
   new transport and host validation registry.
6. Review evidence and separately authorize enabling L3 locally. Remote execution
   additionally requires the dedicated remote gate and independent risk review.

Live provider calls need their own explicit model, budget and credential decision.
No real-provider or real Podman test was executed in this phase.
