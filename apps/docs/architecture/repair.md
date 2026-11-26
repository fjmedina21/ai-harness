# RepairCoordinator

`RepairCoordinator` composes existing provider-neutral engineering, patches, workspaces, approval services and validation. It starts only from verified code-failure evidence and preserves the original bounded objective.

![Repair lifecycle overview with two human waits per iteration and explicit terminal stops.](/diagrams/repair.svg)

## Implemented lifecycle

`ValidationFailed → RepairRequested → AnalyzingDiagnostics → RepairProposed → AwaitingPatchApproval → RepairApproved → ApplyingRepair → RepairApplied → AwaitingSandboxApproval → Revalidating`.

Revalidation can enter `Completed` or `NextIteration → RepairRequested`. Terminal exits include `Cancelled`, `BudgetExhausted`, `NoProgress`, `Blocked`, `Failed` and `ReconciliationRequired`. Terminal states cannot resume ordinary progress.

The diagram abbreviates branching. The contract state/transition table is authoritative. A proposal is persisted with its patch, snapshot, profile/policy fingerprints and provider usage before a later effect. The existing dispatcher consumes grants; the coordinator cannot invent approval.

## Budget and progress ownership

An immutable host policy sets cumulative consumed/reserved iterations, requests, tokens, time, validations, files/bytes and estimated cost. Review delay counts against the global deadline. Repeated diagnostics, patches, content, snapshots and cycles terminate deterministically. Infrastructure/authorization failure is not a repairable compiler error.

SQLite repair state is installed lazily as schema v4 on an explicitly requested session, sharing the operation journal. Read-only inspection does not upgrade a v3 journal. In-flight unknown effects stop for reconciliation. These behaviors are offline verified; real repair E2E remains blocked.

## Source and evidence

[packages/contracts/src/repair.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/repair.ts), [packages/application/src/repair.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/application/src/repair.ts), [docs/phase9c-state-machine.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-state-machine.md), [docs/phase9c-e2e.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-e2e.md).
