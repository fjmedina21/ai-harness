# Phase 5 Execution isolation and runtime hardening

Status: implementation in progress. Real-isolation acceptance is not established.
The Phase 4 baseline is `25fdb68`, with 198 deterministic tests.

## Trust and supported profile

The trusted host owns executable paths, Docker context, exact Unix endpoint,
daemon ID, pinned image digest/platform, operation allowlist and resource limits.
Models, repository configuration, tool output and container output cannot grant
permissions or select these values. ToolDispatcher remains the authorization gate.
Container operations are not registered for models or the default CLI.

The verification target is a dedicated, disposable Linux rootless Docker daemon,
with cgroup v2/systemd, memory/swap/CPU/PID limit support and seccomp enabled.
The host must attest dedicated/disposable use; daemon queries cannot prove
exclusive ownership of a machine. An exact endpoint and daemon ID prevent
silent context substitution, but do not protect against a malicious host/daemon.
Docker Desktop and rootful daemons are outside this verification profile.

The current machine reports `desktop-linux`, Linux/aarch64, cgroup v2 and
seccomp/cgroupns, without a rootless security option. No dedicated disposable
runtime was identified. No container was started for this assessment.

## Threat model

| Threat | Control or required evidence | Residual limitation |
|---|---|---|
| Model/repository changes command or policy | Fixed operation IDs, host-only immutable profile, Default Deny | Trusted host code can invoke low-level APIs |
| Context or endpoint substitution | Inspect context then pin Unix endpoint; compare daemon ID | Privileged host can replace socket/daemon |
| Image drift or automatic mounts | Pre-pulled digest and platform; reject image volumes; disable healthchecks | Trusted pinned image/kernel remain dependencies |
| Container accesses network or host files | No network, bind mounts, socket, host namespaces or elevated capabilities | Kernel/runtime escape resistance is not proven |
| Resource exhaustion | 256 MiB memory/swap total, 0.5 CPU, 64 PIDs, 16 MiB noexec tmpfs | Effective limits require real cgroup evidence |
| Cancellation leaves work running | Terminate client process group; owned container removal; absence check | Daemon may process a request after client termination |
| Cleanup deletes unrelated resources | Unique owner token, exact name, immutable ID; no global prune | Host/daemon are trusted |
| Cleanup uncertainty becomes success | Separate operation/cleanup outcomes; fail closed; no automatic replay | No durable operation journal |
| File grows during read | Incremental capped reads and descriptor checks | Copies/decoding have bounded allocation overhead |
| Filesystem path race | No-follow final open, identity checks, hardlink rejection | Parent traversal is not an atomic rooted open |
| Secret leakage | Restricted paths, no ambient process environment in containers, sanitized errors | Filename filters cannot identify all secrets |

## Fixed limits and compatibility

Operation deadline is at most 10 seconds, combined captured stdout/stderr at
most 4096 bytes. Each cleanup query/removal has its own deadline (at most 3
seconds); cleanup never inherits an already-aborted operation signal. Execution
and cleanup are not retried. Only `node.version` is a runtime command; integration
probes are fixed host test operations and never model tools.

Existing signatures are extended with optional signals/results. Executing Docker
without an explicit verified security profile now fails closed; callers must
supply a trusted profile. No fallback to the former unchecked execution path.
`complete()`, provider schemas, read-only agent defaults and approval policy
are unchanged. File writes remain create-only and can leave partial output.

## Real validation gate

Mandatory normal tests use fixtures, not a Docker daemon or real credentials.
A separate opt-in command must fail when no valid dedicated runtime profile is
provided. The real suite must establish effective UID/capabilities, seccomp,
no-new-privileges, root readonly, bounded tmpfs, network denial, no workspace or
socket mounts, cgroup limits, cancellation and confirmed owned-resource cleanup.
A missing runtime is blocked evidence, never a passed or silently skipped test.
Do not install runtimes, pull images, alter daemon/global config or use privileged
containers to make the gate pass. CI runtime validation requires a separately
approved dedicated runner/profile; the existing CI must not target an arbitrary
shared daemon.

Filesystem guards are not a race-free sandbox. Callers requiring atomic rooted
confinement must be rejected until an appropriate OS primitive/backend exists.
No claim of exactly-once, automatic recovery, transactionality, authenticated
result provenance or production-safe execution of untrusted repository code.

References: [Docker security](https://docs.docker.com/engine/security/),
[rootless mode](https://docs.docker.com/engine/security/rootless/),
[resource limits](https://docs.docker.com/engine/containers/resource_constraints/).
