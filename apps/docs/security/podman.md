# Podman isolation and residual risk

## Required restrictions

The explicit local rootless Podman Machine profile uses a pinned pre-pulled OCI image, no network, no host/engine socket mounts, no guest host-filesystem shares, read-only root, non-root UID, dropped capabilities, seccomp, no-new-privileges and CPU/memory/PID/tmpfs limits. Snapshot transfer is bounded and closed; model output never supplies free-form argv.

## Acceptance is not configuration

Tests of command construction and mocked runtime results do not prove effective VM/cgroup restrictions. Gate C needs real probes and native-approved durable outcomes bound to exact owner/project/critical code/runtime/evidence with short expiry. Changing relevant code invalidates previous acceptance. An isolation probe alone does not prove the full coordinator/repair cycle.

## Unknown outcomes

Timeout, cancellation or cleanup failure can leave uncertain operations. Evidence inspection must validate the grant, action, snapshot and journal binding. Never re-execute merely because the last process exited or a lease expired.

## Limits

A rootless container is not an infallible sandbox. Host/root/OS/runtime compromise and same-UID races remain trust assumptions. Guest staging ownership is not immutable kernel protection against its owning UID. File evidence and SQLite are not one transaction. Dedicated remote Podman acceptance remains deferred; Docker runtime execution was removed earlier.

See [known limitations](./limitations.md) and the [threat model](./threat-model.md).

## Source and evidence

[docs/phase5-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase5-security.md), [docs/phase9b-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9b-security.md), [docs/phase9b-validation-runtime.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9b-validation-runtime.md), [docs/DEDICATED-PODMAN-RUNNER.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/DEDICATED-PODMAN-RUNNER.md).
