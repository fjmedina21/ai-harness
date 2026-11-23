# Phase 5 — Podman execution isolation and runtime hardening

Version 0.6.0 runtime: **Podman Machine only**. Docker daemon/context execution and
its implicit default have been removed at the owner request. Older Phase 3–5 reports
describe the historical implementation, not an additional supported backend.

## Supported profile and trust

Host selects an absolute Podman executable, backend=podman, a named dedicated
disposable rootless Podman Machine, exact local Unix endpoint, creation-time
fingerprint, qualified digest-pinned image and platform.
Models/repository configuration/tool output cannot select these or grant
permissions. ToolDispatcher remains the mandatory authorization gate.
Container execution is not registered for models or the default CLI.

The implemented profile uses Podman Machine with Linux/cgroup v2/systemd,
delegated cpu/memory/pids controllers and seccomp. Client/server major/minor
versions must agree. Bare remote Podman servers, TCP/SSH endpoints and rootful
machines are outside this profile. Tested host: macOS with a Linux/arm64 guest.
The host attests dedicated/disposable use; metadata does not prove exclusivity
or resistance to a compromised host/VM/runtime/kernel.

## Intentional migration

ContainerExecutor and its neutral results remain; ContainerExecutionOptions and
ExecutionRuntimeOptions now describe PodmanExecutionOptions. Callers must supply:

~~~ts
const executor = new ContainerExecutor({
  backend: "podman",
  podmanExecutable: hostSelectedAbsolutePodmanPath,
  machineName: hostApprovedMachineName,
  image: hostApprovedQualifiedImageDigest,
  securityProfile: hostApprovedProfile,
});
~~~

Omitted backend, backend=docker, dockerExecutable/dockerContext, unknown
backends and mixed options fail closed, before process execution. There is no
Docker fallback or Docker context/daemon discovery. Former Docker callers must
migrate to an explicitly approved Podman Machine; no automatic conversion occurs.
This removal does not uninstall or reconfigure host Docker software.

The existing field daemonId remains the SHA-256 fingerprint of machine name,
NUL and creation timestamp. computePodmanMachineFingerprint names this operation;
no legacy helper alias exists. The fingerprint is correlation, not attestation.

The isolation profile loader requires an explicitly provided absolute private
host-owned single-link regular file, at most 8192 bytes, no group/other access
and no symlink. It accepts only backend, podmanExecutable, machineName, image
and securityProfile with its fixed attestation fields. Credentials, commands,
flags and Docker-specific keys are rejected.

## Threat model and implemented controls

| Threat | Control | Residual limit |
| --- | --- | --- |
| Model/repository changes command or grant | Fixed host operation IDs, Default Deny and approval policy | Host APIs remain trusted capabilities |
| Runtime substitution | Exact executable, machine name/creation fingerprint and Unix endpoint | Privileged host can replace runtime/socket |
| Image drift | Pre-pulled qualified digest/platform, image identity and declared-volume rejection | Trusted image/kernel remain dependencies |
| Host files or sockets exposed | No guest virtiofs/9p shares, workspace/host/socket binds or host namespaces | No proof against runtime/kernel escapes |
| Guest network access | Fixed network=none, no forwarded proxy environment | VM/bootstrap networking is separate from container denial |
| Privilege escalation | UID/GID 65534, empty effective/bounding capability sets, seccomp and no-new-privileges | Host/guest/runtime remain trusted |
| Resource exhaustion | 256 MiB memory+swap total, swap 0 in probe, 0.5 CPU, 64 PIDs, bounded tmpfs/output | Fixed probes are not exhaustive stress testing |
| Cancellation/timeout leaves work | Independent owned-resource cleanup and final absence checks | Late daemon processing can remain uncertain |
| Cleanup targets unrelated resources | Random name/owner token, exact immutable ID and owner comparison | No global prune or unrelated deletion |
| Unsafe filesystem path/content | Bounded descriptor reads, no-follow checks and mutation/hardlink rejection | Parent traversal remains subject to TOCTOU |

Machine inspect does not expose mounts, so preflight runs one fixed read-only
guest findmnt command. Missing evidence or any virtiofs/9p share blocks execution.
Guest share configuration is a bootstrap responsibility; executor never creates
or reconfigures a machine, installs a runtime, pulls an image or fixes a failed
profile.

## Creation and effective policy

All engine commands use --remote --url with the validated Unix endpoint.
Only node.version is the public runtime command. Host-only integration probes
are fixed source strings, never generated or model-selected commands.

Create explicitly disables proxy forwarding, automatic image volumes, init,
systemd integration, extra read-only tmpfs mounts, restart and healthchecks.
No network, workspace, socket, device or host bind is exposed. Root filesystem
is read-only; only /tmp is a bounded 16 MiB rw/nosuid/nodev/noexec/rprivate tmpfs
with copyup disabled.

Native inspection validates CPU quota/period, private cgroups, empty actual
effective/bounding capabilities, devices/mounts, memory/PID limits, restart,
security settings and tmpfs restrictions before start. Missing metadata fails;
explicit native null capability slices mean empty, not missing evidence.

Execution deadline is at most 10 seconds; combined stdout/stderr at most
4096 bytes. Each cleanup query/removal has an independent deadline at most
3 seconds. Removal pins owner and immutable ID and uses --force --time 0.
No side-effecting operation is automatically retried. Cancellation does not
roll back partial effects or prove a delayed daemon request cannot arrive.

The process runner terminates POSIX process groups and forwards only PATH, HOME
and host-resolved TMPDIR, apart from OS-injected metadata. Ambient provider,
proxy and credential configuration is not forwarded. Windows process-tree
containment is not established.

ContainerExecutionError reports sanitized kind, cleanup outcome, lifecycle
states and any known resource reference for host reconciliation. Cleanup
uncertainty is an error even when operation output succeeded. No automatic replay
or external exactly-once guarantee follows. Phase 6 operation journaling is an
independent opt-in and does not make external container effects transactional.

## Verification

Mandatory tests use deterministic native Podman metadata fixtures. They exercise
policy, preflight, effective restrictions, cancellation, timeout, cleanup,
failure windows and explicit rejection of removed Docker profiles.
They do not substitute for real isolation evidence.

The separate pnpm test:isolation gate requires HARNESS_ISOLATION_PROFILE set to
the absolute approved private profile. It reports passed (exit 0), failed after
preflight (exit 1) or blocked (exit 2); missing infrastructure never silently skips.
Real probes verify effective UID/capabilities/seccomp/no-new-privileges,
read-only root, bounded empty tmpfs, no host mounts/shares, network denial,
cgroups, running cancellation, timeout and confirmed removal. The TCP denial
probe accepts only explicit route/policy errors; connection refusal and timeout
are failures. Successful JSON omits private socket endpoints and machine fingerprints.

The dedicated GitHub workflow requires its labeled runner, protected environment
and pre-provisioned Podman Machine/profile. Workflow configuration is not remote
evidence; hosted deterministic CI is not a substitute for this gate.
See [verification](VERIFICATION.md) for current local versus historical evidence.

Docker Hub image references such as docker.io/library/node are OCI registry
locations, not Docker runtime support. Socket-denial probes retain Docker socket
paths as forbidden exposure checks.

Filesystem guards are not an atomic rooted sandbox. Create-only writes can
remain partial; requiring atomic confinement fails closed. No arbitrary shell,
Git writes, deployments or automatic privileged-tool exposure is introduced.

References: [Podman Machine inspection](https://docs.podman.io/en/latest/markdown/podman-machine-inspect.1.html),
[Podman create](https://docs.podman.io/en/latest/markdown/podman-create.1.html),
[Podman 6.1.4 native types](https://pkg.go.dev/go.podman.io/podman/v6@v6.1.4/libpod/define).
