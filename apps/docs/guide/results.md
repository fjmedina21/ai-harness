# Inspecting results, recovery and cancellation

Inspect the correct durable object: normal workflow `status`; protected proposal `engineering status`/`diff`; repair `repair-status`/`repair-history`; and host evidence inspection for an exact validation operation. A human-readable summary or model statement is not runtime evidence.

## Result interpretation

Check execution ID, owner/project, snapshot and artifact digests, operation state, grant consumption, validation classification, cleanup and budget accounting. Unavailable cost is unknown, not zero. Unsupported validation is not a pass. Normalized diagnostics sanitize bounded output and retain evidence digests/truncation.

Telemetry is optional best-effort metadata. `trace --input FILE --id ID` and `metrics --input FILE --id ID` inspect private JSONL; they cannot authorize, reconcile or change journal state. Evaluation reports characterize known fixtures only.

## Conservative recovery

Only an Approved effect-free action may transfer sessions under the existing lease protocol. CAS and monotonic fencing reject concurrent/stale owners. Prepared, Running, Uncertain, missing/corrupt evidence and unconfirmed cleanup must not replay. Completed results are inspected without repeating the effect.

![Recovery decisions: verify current state; continue only effect-free Approved; reconcile in-flight or unknown work.](/diagrams/recovery.svg)

## Cancellation

The CLI wires SIGINT/SIGTERM to an AbortSignal for relevant operations. Global, role, provider and validation deadlines are finite; human review does not extend a repair deadline. Cancellation stops further work where possible, but cannot undo a sent provider request or partial filesystem/runtime effect. Preserve uncertain reservations and evidence.

There is no public CLI `cancel`/`reconcile` command. Trusted host reconciliation requires inspecting actual effects; never edit checksums, reset consumed grants or infer success from an absent process.

## Source and evidence

[docs/phase6-durable-execution.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase6-durable-execution.md), [docs/phase9c-state-machine.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-state-machine.md), [packages/checkpointing/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/checkpointing/src/index.ts), [apps/cli/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/index.ts).
