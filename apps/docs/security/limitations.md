# Security limitations

**AI Harness 0.9.0-beta.1 is experimental.** It is not certified for production autonomous
execution. The [capability matrix](../releases/capabilities.md) distinguishes
implementation, offline tests and restricted real acceptance.

## Human authority remains mandatory

**Authentication != Authorization != Approval.** GitHub verifies one installation
owner. Current host policy authorizes exact projects, tools, files, profiles and
budgets. Personal L2 confirms a human's intent for a concrete patch through exact
diff review, typed `APPROVE` and fresh native macOS authentication. A separate
sandbox decision is required before executing generated code.

A valid session, project file, model response, test fixture or earlier grant cannot
supply later approval. Each repair iteration requires a new exact patch decision
and a new sandbox decision. There is no operational Team or multiuser management.

## Restricted executable scope

Untrusted code executes only through approved fixed Podman profiles. The accepted
implementation bridge is restricted to `node-isolated-v1`; it does not provide
general Node dependency builds or operational .NET, Java, Python, Go, Rust or other
toolchain support. Discovery signals and generic validation contracts do not widen
that boundary. Remote Podman remains deferred; no general remote execution exists.

The runtime requires a preprovisioned rootless Machine and pinned image, with no
network by default, no host/socket mounts, non-root workload, read-only root,
dropped capabilities, seccomp, no-new-privileges and finite resources/time/output.
It does not automatically provision a Machine, pull images or install packages.
Current host policy and exact acceptance must still validate before execution.

## Isolation is not infallible

The operating system, parent paths, native verifier, host policy, Node runtime,
Podman VM/kernel and pinned image remain trusted. Portable Node filesystem checks
are not atomic rooted confinement against a hostile process with the same UID.
Tests do not establish resistance to kernel or container escapes.

Snapshot hashes establish admitted input identity and detect corruption. They are
not external attestation. Container staging file modes are not kernel immutability
against the owning sandbox UID; an action can modify its disposable guest copy.
Those effects are never copied into the original project.

Secrets already selected into source are not comprehensively detected by path
filters or redaction. Keep credentials, host profiles, raw journals and acceptance
evidence outside project content and the public documentation tree. Local search
indexes all published content; it must never index private evidence.

## Recovery stops at uncertainty

SQLite CAS, leases, fencing and single-use grants reduce overlap and replay. They
do not make filesystem, provider, Podman and journal effects one atomic transaction.
There is no external exactly-once guarantee.

Prepared, Running and Uncertain operations can require explicit host reconciliation.
A cleanup confirmation does not erase an Uncertain journal state. Process restart,
timeout or cancellation never grants permission to retry an uncertain effect.
Cancellation can leave partial multi-file changes in the private workspace; no
automatic rollback is promised. Preserve the journal and evidence for review.

## Real acceptance is scoped and expires

Historical live evidence covers the documented local synthetic project and fixed
Node profiles. Current runtime acceptance binds owner, project, critical code,
profile/image/resources, snapshot and durable evidence, with conservative expiry.
Changed code/policy/profile or stale/missing evidence retains
`validation_acceptance_pending`.

Phase 9C finite repair is implemented and offline verified. Its actual real E2E
remains **BLOCKED**. Current fixed isolation probes do not demonstrate the complete
repair workflow, real model behavior, human decisions or coordinated durable
acceptance. Ordinary hosted CI also does not establish VM isolation.

## Deliberately unavailable operations

Original-project integration, Git-writing tools, auto-merge, autonomous deployment,
unbounded shell execution, automatic uncertain replay, general remote execution
and multiuser administration are outside the operational product scope. The
supplied native credential and presence adapters target macOS; Linux/Windows
operational adapters are not supplied.

A documentation portal can be ready for controlled publication while beta release
remains blocked. No release, tag, package or Pages publication follows from a local
build or the existence of draft release notes.

## Source and review evidence

These boundaries correspond to the source-bound reviews:

- [Current engineering security](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-security.md).
- [Podman threat model](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9b-security.md).
- [Repair security](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-security.md).
- [Durable repair lifecycle](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-state-machine.md).
- [Operational authentication limits](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-github-authentication.md).

This is a documented threat-boundary review, not formal security or WCAG certification.
