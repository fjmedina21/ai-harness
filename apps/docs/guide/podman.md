# Podman validation

The existing validation coordinator executes a fixed accepted action against an approved isolated snapshot. It reuses the dispatcher, private journal and one-time approval services.

![Podman validation: verify exact acceptance, snapshot transfer, independent review, fenced action and durable evidence.](/diagrams/podman.svg)

## Preconditions

Require a current verified owner/session, registered project, completed consumed L2 patch, intact artifact/snapshot, accepted exact host action/profile, pre-pulled pinned OCI image and effective local runtime probes. Historical Gate C success is evidence for its original scope; changed critical code or expired acceptance blocks execution.

```sh
pnpm harness engineering validate --id EXECUTION_ID --profile local-podman --action ACTION
```

Choose `ACTION` from the registered host entry, never from a model suggestion. The CLI does not expose generic profile installation or arbitrary compiler execution. It prepares a separate action challenge and requires another exact native human confirmation.

## Fixed runtime restrictions

The rootless Podman Machine path uses no network, host/socket mounts or guest host shares; a read-only root; non-root UID; dropped capabilities; seccomp; no-new-privileges; and bounded tmpfs, CPU, memory, PIDs, time and output. Snapshot bytes transfer through bounded stdin. No automatic machine provisioning, image pulls or dependency installation occurs.

Current fixed Node scope uses 0.5 CPU, 256 MiB memory, 64 PIDs, 16 MiB tmpfs, at most 10 seconds and 1024 output bytes per action. Generic profile contracts do not widen this runtime.

## Interpret results

`passed` requires verified evidence and confirmed cleanup. Code failure, infrastructure failure, authorization denial and uncertain cleanup are different outcomes. Evidence is published before terminal journal commit; those stores are not one transaction. Inspect completed evidence without replay and reconcile unknown effects. See [isolation limits](../security/podman.md).

## Source and evidence

[docs/phase9b-validation-runtime.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9b-validation-runtime.md), [packages/tools/src/validation-coordinator.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/validation-coordinator.ts), [packages/tools/src/snapshot-validation-runtime.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/snapshot-validation-runtime.ts), [docs/phase9-real-acceptance-report.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-real-acceptance-report.md).
