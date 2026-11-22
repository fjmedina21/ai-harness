# Phase 5 Execution isolation and runtime hardening

Status: integrated into `main` at `fdd5c3b`. The implementation and real
isolation gate were validated locally on a dedicated rootless Podman Machine.
The regular hosted CI runs deterministic build/tests; the separate dedicated
runner workflow requires infrastructure and an approved profile before it can
provide remote isolation evidence. Live Docker isolation remains unverified.
The Phase 4 baseline is `25fdb68`, with 198 deterministic tests.

## Trust and supported profile

The trusted host owns runtime executable paths, selected runtime, exact Unix
endpoint, daemon ID, pinned image digest/platform, operation allowlist and
resource limits.
Models, repository configuration, tool output and container output cannot grant
permissions or select these values. ToolDispatcher remains the authorization gate.
Container operations are not registered for models or the default CLI.

The Docker verification target is a dedicated, disposable Linux rootless daemon,
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
containers to make the gate pass. Real runtime validation requires a separately
approved dedicated runner/profile; the standard CI must not target an arbitrary
shared daemon. The manual workflow in `.github/workflows/phase5-isolation.yml`
targets only the `ai-harness-phase5-isolation` runner label and the
`phase5-isolation` environment. Configure the runner as dedicated and the
environment with required reviewers before use. It is not remote evidence until
the runner and profile are configured and a run passes.

Filesystem guards are not a race-free sandbox. Callers requiring atomic rooted
confinement must be rejected until an appropriate OS primitive/backend exists.
No claim of exactly-once, automatic recovery, transactionality, authenticated
result provenance or production-safe execution of untrusted repository code.

References: [Docker security](https://docs.docker.com/engine/security/),
[rootless mode](https://docs.docker.com/engine/security/rootless/),
[resource limits](https://docs.docker.com/engine/containers/resource_constraints/).

## Implemented candidate and migration

`ContainerExecutor.execute(command, { signal })` returns operation output plus
`cleanup`, lifecycle `states` and preflight metadata. `ContainerExecutionError`
reports sanitized `kind`, separate `cleanup` and states. If creation was
attempted, its host-only `resource` reference retains name, owner token and any
known immutable ID for manual reconciliation. This is not a durable journal;
labels are ownership correlation in a trusted daemon, not authentication.
A successful operation with uncertain cleanup is an error, never success.

Runtime execution requires `securityProfile` in addition to existing options:
`dedicated: true`, `disposable: true`, exact `endpoint` (local Unix socket),
`daemonId`, and `platform` (`linux/amd64` or `linux/arm64`). The application must
supply and validate this attestation; it must not read policy from model output
or repository configuration. After context validation all commands pin the
endpoint. Image inspection rejects declared volumes; the runtime uses the
resolved image ID, disables healthchecks/restarts and inspects effective
restrictions before attaching. No automatic pull, context change or daemon
configuration is performed. Missing capability/profile is a fail-closed change
from the earlier experimental executor, not a permissive legacy fallback.

The real process runner uses bounded combined output and POSIX process-group
termination. The deadline includes preflight/create/start; cleanup has bounded
independent queries/removal. A lost create response without a visible owned
container remains uncertain: client termination does not prove the daemon
will not process a late request. No retries occur. Windows process-tree
containment is not established and is outside the supported Linux profile.

File reads return at most 1 MiB and transfer at most 1 MiB plus one overflow
sentinel byte. Descriptor identity/type/timestamps and single-link checks reject
several replacement/mutation cases, but do not implement an atomic rooted open.
Legitimate hardlinks and files modified during a read are now rejected. Buffers,
UTF-8 decoding and returned text have bounded additional allocation overhead.
`requireAtomicFilesystem: true` rejects local filesystem handlers; the read-only
factory and augmented-agent constructor accept that host option. Signals pass through
agents/dispatcher to file/Git/fixed subprocess operations. The orchestrator does
not acquire a new cancellation/resume API in this phase. Fixed handlers may
already have effects when cancellation is observed; writes can remain partial.

## Running the real suite on a validated dedicated host

The host explicitly provides an absolute JSON profile path through
`HARNESS_ISOLATION_PROFILE`. In the dedicated GitHub workflow, the environment
variable `HARNESS_ISOLATION_PROFILE_PATH` points to that pre-provisioned file.
The file must be a regular, single-link file owned
by the current user, with no group/other permissions and at most 8192 bytes.
Docker profiles accept only `backend` (optional), `dockerExecutable`,
`dockerContext`, `image` and `securityProfile`. Podman keys are listed below;
no commands, arbitrary flags or credentials are accepted. Pin an actual
pre-pulled approved image digest/platform. Setting attestation booleans is not
a substitute for validating that the daemon is dedicated and disposable.

```bash
HARNESS_ISOLATION_PROFILE=/absolute/private-profile.json pnpm test:isolation
```

The command emits JSON: `passed` (exit 0), `failed` after successful preflight
(exit 1), or `blocked` when its profile/preflight is unavailable (exit 2).
On a validated host it reports Docker/kernel/image/Node versions and runs real fixed container probes, a running cancellation case and a timeout
case, requiring confirmed cleanup for all. Probe source is syntax-checked in
normal tests without executing it on the host. It does not measure resistance
to kernel escapes or calibrate every resource controller under stress.

The suite passed on a dedicated disposable rootless Podman Machine, with actual
inside-container restriction probes, cancellation after observed Running state,
timeout and confirmed cleanup. Final independent listing found no containers;
the owned VM was stopped. See [exact environment and results](VERIFICATION.md).
This validates the fixed tested workload/profile; it does not prove arbitrary
untrusted-code safety, kernel-escape resistance or race-free filesystem access.
Live Docker isolation remains unverified: the existing Docker Desktop daemon
was unsuitable for this rootless profile and was preserved unchanged. The
dedicated workflow is prepared but cannot validate isolation until its runner
and approved profile are configured. Unit CI does not substitute for the real
gate, and no production-readiness claim follows.

## Podman backend candidate

The existing Docker options/signatures remain supported. The trusted host may
instead select `PodmanExecutionOptions` through the same `ContainerExecutor`:

```ts
const executor = new ContainerExecutor({
  backend: "podman",
  podmanExecutable: hostSelectedAbsolutePodmanPath,
  machineName: hostApprovedDedicatedMachine,
  image: hostApprovedQualifiedImageDigest,
  securityProfile: hostApprovedProfile,
});
```

These are host values, not repository/model settings. Omitted `backend` preserves
Docker selection. The private real-suite profile uses the same discriminant;
Podman accepts only `backend`, `podmanExecutable`, `machineName`, `image` and
`securityProfile`. Mixed Docker fields, flags and unknown backends are rejected.
No runtime is automatically installed or discovered from project config.

This candidate targets a dedicated disposable **Podman Machine**, rootless,
Linux/cgroup v2/systemd with cpu/memory/pids delegation and seccomp. It does not
claim support for arbitrary bare-Linux Podman hosts or remote TCP/SSH endpoints.
Machine name, creation time and rootless preference are inspected. The legacy
profile field `daemonId` holds the SHA-256 fingerprint of machine name, NUL and
creation timestamp for this backend; it is host metadata correlation, not remote
cryptographic attestation. The forwarded local Unix socket must match exactly.
Client/server major/minor versions must match; the engine reports rootless too.

Podman `machine inspect` does not expose a Mounts field. One fixed read-only
`machine ssh ... findmnt --json --types virtiofs,9p --output TARGET,FSTYPE`
checks the actual guest mount table. Shared filesystems or missing/failed
mount-table evidence block preflight. This conservative profile rejects any
virtiofs/9p sharing, including host home/workspace sharing. Initial provisioning
must disable machine default home shares before starting the VM; the executor
never creates or reconfigures a machine to compensate for a failed check.

All engine commands pin `--remote --url` to the validated Unix socket. The
backend uses native Podman metadata instead of pretending Docker inspect shapes
are identical. CPU quota/period translate to the shared half-CPU requirement;
`CgroupMode` must explicitly be private with cgroups enabled. Native effective
and bounding capabilities must both be empty. The no-device policy is verified
against Podman's native empty Devices list, mounts and fixed create command;
Docker's separate DeviceRequests field does not exist in native Podman inspect.
Empty native no-restart/IPC representations translate only to their documented
no-restart/private equivalents; missing CPU/cgroup/capability evidence blocks.

Image names must be qualified and digest-pinned. Automatic image volumes,
proxy environment forwarding, init, systemd mode and additional read-only tmpfs
mounts are disabled explicitly. The only requested tmpfs remains bounded `/tmp`.
No host binds, Docker socket, arbitrary shell or generated commands are enabled.
Cancellation, unique ownership, immutable-ID removal, uncertain cleanup and
independent deadlines are shared with Docker. Inspection projects only policy
fields to preserve the bounded output budget, not unlimited native JSON.

The same real suite can test either explicitly selected backend and reports its
name. Real Podman 6.1.4 validation uncovered native template field names
`Host.CgroupsVersion`, `Host.Security.SECCOMPEnabled` and image `ID`. Explicit
null capability slices are accepted as native empty lists; missing fields and
nonempty lists fail. Podman tmpfs is requested with `rprivate,notmpcopyup`;
inspection must retain every restrictive flag, private propagation and no
copyup. The fixed guest probe also confirms an initially empty `/tmp`.
Owned Podman removal uses `--force --time 0`, avoiding its default stop grace
period within the independent cleanup deadline. No retries are introduced.
The process environment preserves only PATH, HOME and the host-resolved TMPDIR
(macOS uses it to derive machine socket identity), apart from OS-injected
CoreFoundation metadata. Ambient runtime/proxy/credential configuration is not
forwarded. No new grant or host mount follows from these compatibility fixes.

The existing CLI was found at `/opt/podman/bin/podman`; no reinstall or Lima
installation was performed. An explicitly created VM used local bootstrap
configuration `volumes=[]`; guest `findmnt` confirmed no virtiofs/9p shares before
any container. Bootstrap pulled a public pinned Node image anonymously. Profile
and artifacts stay private/excluded; automatic runtime bootstrap is not part of
the executor. The real suite passed and the VM was stopped; Docker's context and
global settings were unchanged. See [verification](VERIFICATION.md) for limits.

References: [Podman Machine inspection](https://docs.podman.io/en/latest/markdown/podman-machine-inspect.1.html),
[container inspect types](https://github.com/podman-container-tools/podman/blob/main/libpod/define/container_inspect.go),
[Podman create](https://docs.podman.io/en/latest/markdown/podman-create.1.html).

Native field reference: [Podman 6.1.4 define types](https://pkg.go.dev/go.podman.io/podman/v6@v6.1.4/libpod/define).
