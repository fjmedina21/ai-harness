# Phase 9 sandbox validation — implementation and unpassed real gate

Phase 9B now implements closed snapshot transfer, a restricted host validation
registry, separately approved dispatcher coordination, the existing Podman-only
container lifecycle and private durable evidence. Version remains **0.8.0**.
Real GitHub/native Keychain and current-code Podman acceptance are pending; the
validation CLI stays blocked. No generated/untrusted workload was executed on the
host or in a real Machine as part of deterministic verification.

## Implemented composition

```text
Completed independently approved L2 patch
  → current authenticated operator and exact host scope
  → expected resulting inventory and closed snapshot
  → separate durable sandbox.validate approval
  → host live-acceptance verifier
  → fixed Podman workload + bounded stdin transfer
  → staging digest verification + fixed Node action
  → owned cleanup verification + private durable evidence
```

The snapshot binds execution/workspace/source/policy identity, file path/size/hash,
aggregate inventory and transfer digest. Host and fixed receiver revalidate bytes;
no general archive extraction, `podman cp`, generated image build or host bind is
used. Source staging is an isolated disposable guest copy, never a writable mount
of the original project. Host payload is copy-on-read and frozen; guest 0400 files/
0500 directories are not an immutable security boundary against their own UID.
See [snapshot transfer](phase9b-snapshot-transfer.md).

`SandboxValidationRegistry` accepts only host-selected bounded profiles. Initial
`node-isolated-v1` runs fixed Node executable/argv in the approved working directory,
not model shell strings. Project scripts remain untrusted and execute only inside
the approved sandbox. Runtime limits remain 0.5 CPU, 256 MiB memory/swap total,
64 PIDs, 10 seconds, 16 MiB noexec private tmpfs, no network and no host secrets/
mounts/socket. Action output is capped at 1024 bytes inside the 4096-byte runtime
envelope. No package install or general native/TypeScript build support is claimed.

Existing rootless Podman Machine preflight, pinned pre-pulled image, UID/GID 65534,
dropped capabilities, seccomp, no-new-privileges, absent guest host shares and
effective create/inspect checks remain mandatory. Docker runtime is not added.
No machine start/provision/reconfiguration, image pull or policy repair happens
automatically. See [Phase 5 security](phase5-security.md) and
[dedicated runner prerequisites](DEDICATED-PODMAN-RUNNER.md).

## Authorization, cleanup and evidence

Patch approval alone cannot grant `shell:execute`. Coordinator prepare registers
a separate high-risk `sandbox.validate` through ToolDispatcher and the durable
journal; an independent authenticated approval is needed for the exact snapshot/
action/image/resource scope. Execute consumes that grant, confirms current host
operator authority and uses a private exclusive workspace claim. No model or
repository content supplies executable policy or acceptance authority.

Results distinguish success, action failure, timeout, cancellation, blocked and
uncertain. Independent cleanup targets the exact owner and immutable container ID.
Uncertain cleanup overrides a successful action, retains reconciliation evidence
and blocks replay. Evidence preserves exact snapshot/transfer/action/image IDs,
timestamps, duration/exit/classification and output digest. Raw output is bounded
and private; telemetry includes no full source or test logs.

The CLI target is:

```sh
pnpm harness engineering validate --id EXECUTION_ID --profile local-podman --action test
```

It currently rejects execution at `validation_acceptance_pending` after required
authenticated scope checks. General CLI action-approval/profile orchestration is
not enabled. The host runtime verifier is a trusted port, not a deployed attestation
service. See [runtime](phase9b-validation-runtime.md) and [threat model](phase9b-security.md).

## Real gate required before enabling local validation

1. Complete actual GitHub/native credential and two-identity Operational L2 smoke.
2. Obtain explicit owner authorization for current-code synthetic Podman workloads.
3. Prepare and independently verify a dedicated disposable rootless Machine/profile.
4. Pass effective network/UID/capabilities/seccomp/resources/filesystem checks.
5. Pass current transfer/action success/failure/timeout/cancellation tests, durable
   evidence reopen and confirmed owned cleanup. A skipped or blocked test is not passed.
6. Review exact SHA/evidence and separately authorize a concrete CLI profile and
   action approval workflow. Remote runner acceptance may remain deferred for the
   narrower experimental local scope.

The opt-in [E2E procedure](phase9b-e2e.md) records the exact commands. A passed test
does not certify generated code as secure. A failed action never calls a model:
Phase 9C autonomous repair is deferred, as is Phase 9D and release publication.
