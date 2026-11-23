# Dedicated Podman isolation runner

**Status: preparation only.** The real remote gate has not been run from a dedicated
GitHub Actions runner. The local Podman Machine evidence recorded in this repository
does not satisfy remote acceptance.

## Trust model

The job executes repository checkout and dependency installation on a self-hosted
runner. A dependency lifecycle script can run as the runner account. Restrict this
runner to this repository and this workflow, and prefer a single-job ephemeral
runner inside a disposable Linux VM that is destroyed or restored from a clean
snapshot after each run. Do not attach personal data, production credentials,
other repository workspaces, cloud metadata credentials, or shared caches. Do not
run unrelated jobs on it. Do not expose sudo to job steps.

This workflow is `workflow_dispatch` only and the job condition requires the
official `fjmedina21/ai-harness` repository and `main` ref. It uses `contents: read`, a dedicated runner label, the protected
`phase5-isolation` Environment, a 15-minute job timeout, Node 24 and the frozen
pnpm lockfile. The three official actions are pinned to immutable commit SHAs resolved from their official `v4` refs. Pinning prevents a moving tag from changing the job, but does not replace reviewing action source before future updates:
[actions/checkout](https://github.com/actions/checkout/commit/11d5960a326750d5838078e36cf38b85af677262),
[pnpm/action-setup](https://github.com/pnpm/action-setup/commit/b906affcce14559ad1aafd4ab0e942779e9f58b1),
and [actions/setup-node](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020).
Checkout does not persist its read-only GitHub token in local Git configuration.
The `HARNESS_ISOLATION_PROFILE` value is passed only to the isolation test step,
not checkout or dependency installation.

Keep the `phase5-isolation` Environment restricted to trusted repository
operators. Configure required reviewers and disable administrator bypass where
available. Register the runner at repository scope, not as a shared account-wide
runner. If organization/enterprise runner groups are available, restrict the group
to this repository and this workflow. Do not use this runner for pull requests,
fork code, arbitrary workflow dispatch, or workflows with write permissions.

## Runtime compatibility

The current implementation accepts only an explicitly selected **Podman Machine**
with a rootless Linux guest. It invokes `podman machine inspect` and a fixed,
read-only `podman machine ssh` mount check. A rootless Podman service running
natively on the Linux runner is not compatible with this profile. Before setup,
confirm the selected Linux host can run the required Podman Machine and guest
platform. If nested virtualization or the required machine backend is unavailable,
stop and propose a separately reviewed runtime design; do not weaken preflight.

Provision the runner and Podman Machine manually under one dedicated service
identity. The job must not create, start, reconfigure, or install the machine.
Keep Podman rootless, Linux cgroup v2, systemd cgroup manager, seccomp enabled,
and cpu/memory/pids controllers available. The machine name must be explicit and
match the private profile. Pre-pull the approved image outside CI and pin it by
qualified OCI reference and digest for the guest architecture. The runtime uses
`--pull never`.

The `dedicated` and `disposable` profile fields are host assertions. A hashed
machine name/creation timestamp and Unix socket match are identity checks, not
remote attestation. The host, runner service, Podman client, VM monitor, guest
kernel, image provenance, and GitHub environment administrators remain trusted.

## Private profile

The workflow reads the GitHub **Environment variable**
`HARNESS_ISOLATION_PROFILE_PATH`, maps it to `HARNESS_ISOLATION_PROFILE`, and
passes it only to `pnpm test:isolation`. The value must be an absolute path on the
runner. The file must be owned by the runner service user, be a regular single-link
file, no larger than 8192 bytes, opened without following a symlink, and have no
group/other permissions. Use a private parent directory (mode `0700`) and file
(mode `0600`). Do not store credentials in the profile.

The schema is intentionally narrow:

| Field | Required value |
|---|---|
| `backend` | `podman` |
| `podmanExecutable` | Absolute approved executable path |
| `machineName` | Exact host-approved Podman Machine name |
| `image` | Qualified OCI image reference pinned with `@sha256:<64 lowercase hex>` |
| `securityProfile.dedicated` / `disposable` | `true` host attestations |
| `securityProfile.endpoint` | Exact absolute Unix socket URL from that machine |
| `securityProfile.daemonId` | SHA-256 fingerprint of machine name and creation timestamp |
| `securityProfile.platform` | `linux/amd64` or `linux/arm64` matching the image and guest |

A schema-shaped example containing fake zero digests exists only at
`harness-development/podman-remote-validation/isolation-profile.template.json`.
It is excluded from Git, is not usable, and must never be copied unchanged as an
approved profile. Generate the real profile on the dedicated host after verifying
the machine, socket, image digest and owner; keep its contents out of logs and
commits. Do not infer or discover profile values from repository configuration.

## Effective controls checked

`pnpm test:isolation` runs fixed host-owned operations; no model or repository
content selects a command. It checks the actual running container and requires:

- UID/GID 65534, empty effective and bounding capabilities, seccomp mode 2, and
  `no-new-privileges`.
- Read-only root; only an empty 16 MiB `/tmp` tmpfs with `rw,nosuid,nodev,noexec`.
- No host/workspace/socket binds, devices, extra mounts, forwarded ports, image
  volumes, proxy forwarding, or non-`none` network mode.
- No non-internal network interface and an explicit no-route/policy-denial result
  when probing a reserved external address. Connection refusal and timeout are
  failures, not proof of isolation.
- Effective memory 256 MiB, swap 0, CPU 0.5 and maximum 64 PIDs.
- A digest-pinned pre-pulled image, selected runtime/machine identity, and guest
  with no virtiofs/9p host shares.
- Container observed `Running` before cancellation, effective timeout, owned
  resource cleanup and independent confirmation that the test container is absent.

The suite does not attempt kernel escapes or exploit tests. It is evidence for
these fixed probes, not proof against a compromised host/runtime/kernel or all
possible workloads. It does not enable agents to execute code.

## Configure and run manually

1. Create the dedicated Linux runner VM and exclusive service account. Keep it
   outside production and personal development networks/data.
2. Install a reviewed Node 24 and pnpm 12.21.0 toolchain and a reviewed Podman
   client as administrator. Do not give job steps sudo.
3. Under the service identity, prepare a rootless disposable Podman Machine and
   approved digest-pinned image. Verify Linux guest architecture, cgroups,
   seccomp, rootless status and absence of host shares before registering CI.
4. Create the private profile from host-observed values. Set parent/file modes to
   `0700`/`0600`, verify ownership, and place its absolute path in the
   `phase5-isolation` Environment variable `HARNESS_ISOLATION_PROFILE_PATH`.
5. Register a self-hosted runner with labels `linux` and
   `ai-harness-phase5-isolation`; place it in a runner group restricted to this
   repository. Prefer single-job ephemeral registration. Never expose its
   registration token in job variables or logs.
6. Configure Environment protection with required reviewer approval and no
   bypass. Confirm the runner group and Environment allow only trusted maintainers.
7. Review the current `main` commit and workflow file, then manually select
   **Actions → Phase 5 dedicated isolation → Run workflow → main**. The job is
   expected to remain unavailable or fail closed until all runner/profile
   prerequisites exist. This document does not authorize a run.
8. Review the run page and sanitized JSON log. Require exit 0 and `status: passed`,
   the expected commit SHA and run ID, each effective probe, observed-running
   cancellation, timeout, and `cleanup: confirmed`. Any `blocked`, `failed`,
   skipped job, missing field, or uncertain cleanup is not a pass.
9. Verify no test-owned containers remain. Destroy the ephemeral runner VM or
   restore its approved clean snapshot; do not use global `podman system prune`.
10. Record the GitHub run URL/ID, commit SHA, timestamp, runner/guest platform,
    Podman version, image digest, pass/fail of each control and cleanup result in
    the protected operational record. Never copy the private profile or socket
    path into that record.

## Evidence and retention

The test emits one bounded JSON summary to the workflow log; no downloadable
artifact is uploaded. The summary includes validated GitHub commit/run identity
when available, Podman version, kernel/platform, image digest, probe results,
cleanup, cancellation and timeout. It omits the socket endpoint, profile path,
machine fingerprint, environment, credentials and raw runtime errors. The
workflow run page is the source for workflow metadata. Restrict log access and
configure retention to the repository's approved minimum; review content before
adding any artifact upload in the future.

The current evidence state is **remote validation pending**. The Phase 5 real
Podman run recorded in `docs/VERIFICATION.md` was local. The current `main` commit `5991799` passed standard CI run
[45082194651](https://github.com/fjmedina21/ai-harness/actions/runs/45082194651).
The current Actions history contains no run for `.github/workflows/phase5-isolation.yml`;
no successful remote isolation run is recorded. Standard CI and deterministic
fixtures do not satisfy this gate.

## Failure handling

- Exit 2 / `blocked`: private profile or required runtime capability unavailable.
  Fix the trusted host setup; never weaken profile checks to proceed.
- Exit 1 / `failed`: a probe or cleanup failed after preflight. Preserve logs,
  inspect only the uniquely owned resource through the approved host account,
  and reset the ephemeral runner. Do not retry side-effecting steps blindly.
- `cleanup: uncertain`: treat the job as failed. Do not run a broad prune. Keep
  the runner quarantined until an operator independently verifies the exact
  container name/ID/owner and removes only that resource.
- Workflow skipped: verify it was dispatched against `main`; do not interpret a
  skipped branch as a successful gate.
- Machine/image mismatch: review the private profile and pre-provisioned host;
  never use repository-controlled config to change them.

## Acceptance and remaining risks

Remote gate acceptance requires one manually approved successful run on a
restricted dedicated runner, exact SHA/run ID, all real probes passed, cleanup
independently confirmed, logs reviewed, and runner reset/destroyed. Until then,
remote validation remains pending. Even after a pass, the result does not justify
enabling arbitrary code, shell, workspace mounts, Git writes, deployment or new
agent permissions. Any such capability needs its own threat model and approval.
