# SQLite persistence, events and durable recovery

File checkpoints support ordinary workflow inspection. Protected operations use the private SQLite journal plus authenticated proposal artifacts and validation evidence. These are separate persistence responsibilities.

## Transactional ownership

The journal records operation state, approvals, intent replay ledger and lease epochs. CAS transitions prevent competing owners from both claiming the next state. Expiring single-use grants and monotonic per-write fencing prevent stale workers from continuing a newly owned effect.

Journal schema v3 supports existing durable approval/session behavior. Opt-in repair initializes v4 tables transactionally on first session. No automatic conversion reactivates historical approval records.

![Durable recovery: reopen, verify, claim with CAS/fence, continue only effect-free approval, reconcile unknown work.](/diagrams/recovery.svg)

## Recovery is conservative

Approved effect-free operations may transfer sessions after verification. Prepared/Running/Uncertain effects never replay automatically; completed results are inspected rather than re-executed. Missing or corrupt artifacts, unconfirmed cleanup and unknown commit acknowledgments require reconciliation.

Filesystem artifacts, provider requests, runtime execution and SQLite are not one atomic transaction. A process can die after an effect but before acknowledgement. The product does not promise exactly-once external execution.

## Events and evidence

Lifecycle events describe observed progress. Best-effort telemetry cannot grant authority or repair journal state. HMAC/digests protect binding and corruption checks under trusted-host assumptions; they are not external attestation against a compromised owner/root process.

## Source and evidence

[docs/phase6-durable-execution.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase6-durable-execution.md), [packages/contracts/src/durable.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/durable.ts), [packages/checkpointing/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/checkpointing/src/index.ts), [docs/phase9c-state-machine.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-state-machine.md).
