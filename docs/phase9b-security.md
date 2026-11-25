# Phase 9B security review

Generated source, project tests, build scripts, package lifecycle hooks and
dependency code are untrusted executable data. They may run only in an explicitly
authorized sandbox. Authentication proves the developer identity; current host
policy, independent action approval and the dispatcher authorize each effect.
No fixture, repository setting or model output can declare a live gate passed.

| Threat | Implemented control | Remaining boundary |
| --- | --- | --- |
| Prompt/source injection | Closed snapshot and host action registry; no model command/privilege interpretation | Human-selected tests can still be malicious sandbox workloads |
| Traversal/archive/link attacks | No archive extraction; canonical scope, regular single-link files, no-follow writes, hashes | Private-host parent-path TOCTOU remains documented |
| Modified approved workspace | Derive approved resulting inventory; compare journal result and captured bytes before dispatch | Same-UID hostile host is not a supported adversary |
| Host-secret access / mounts | No host/workspace/socket binds; no guest virtiofs/9p shares; minimal environment | Runtime, host, guest kernel and image remain trusted |
| Exfiltration | Network none, no ports/proxies, bounded private output | Secrets already selected into source are not comprehensively detected |
| Arbitrary shell / lifecycle scripts | Fixed executable/argv profile, execution only inside Podman | Fixed Node argv may deliberately run untrusted scripts in the sandbox |
| Privilege escalation | Rootless Machine, non-root workload, no capabilities, seccomp, no-new-privileges | No kernel/runtime escape resistance proof |
| Resource exhaustion | Fixed CPU/memory/PID/tmpfs, finite time, bounded stdin/stdout/stderr | Actual resource effectiveness requires current real isolation tests |
| Approval substitution/replay | Exact profile/snapshot/artifact scope, independent durable action approval, dispatcher transaction | Trusted host APIs must not auto-grant approval |
| Concurrent/interrupted execution | SQLite state gate and private exclusive workspace claim | Uncertain operation/claim requires host reconciliation |
| Interrupted cleanup | Exact owner+ID removal and independent absence checks | Delayed daemon side effects can remain uncertain |
| Misleading evidence | Closed diagnostics, snapshot IDs/digests, create-only private evidence, cleanup overrides pass | Evidence store digest is corruption detection, not an external attestation |

## Preserved restrictions

The initial runtime retains the existing rootless Podman-only restrictions:
read-only root, no general host mounts, no engine socket, no privileged container,
no host namespaces, network denied, pinned pre-pulled image, no automatic machine
bootstrap and no broad cleanup. Writable staging lives only in private bounded
container tmpfs. Native executables cannot be introduced through the noexec source
staging. Do not weaken controls to accommodate a project build.

Guest staging file/directory modes 0400/0500 enforce initial read-only intent but
do not provide kernel immutability against the owning sandbox UID. Current
verification establishes snapshot identity before action execution and immutable
host capture, not an unmodifiable guest filesystem. Stronger guest immutability
is unresolved; this is an additional reason Gate C remains unpassed.

The independent `sandbox.validate` action approval is required even after approved
L2 patch application. The requester cannot approve their own validation action.
The host acceptance verifier is a trusted integration port, not a deployed
attestation authority; a no-op verifier would violate the operational contract.
The CLI therefore remains disabled while live acceptance is pending.

## Verification and residual risk

Deterministic tests use harmless synthetic fixtures and mocked Podman metadata,
plus real temporary filesystem and SQLite. They may reject malicious profiles,
paths, manifests, mounts, permissions, identity mismatches and replay, but do not
prove effective VM networking/cgroups/seccomp or native cancellation/cleanup.
The [real acceptance suite](phase9b-e2e.md) must be explicitly authorized and run
on a disposable dedicated rootless Machine before Gate C passes. Historical
Phase 5 evidence or standard hosted CI is not a substitute for current transport
and generated-workload tests. Remote dedicated-runner acceptance may remain
deferred for this experimental local scope.

No autonomous repair, automatic retry of uncertain validation, exact-once claim,
original-project integration, Git mutation, deployment or production-security
claim is introduced. Phase 9C requires its own concrete design and acceptance
after the present live gates pass.
