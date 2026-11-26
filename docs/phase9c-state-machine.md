# Durable repair lifecycle

Conceptual lifecycle:

```text
ValidationFailed → RepairRequested → AnalyzingDiagnostics
  → RepairProposed → AwaitingPatchApproval → RepairApproved
  → ApplyingRepair → RepairApplied → AwaitingSandboxApproval → Revalidating
  → Completed | next finite iteration
```

The implementation adapts these stages to the existing operation journal. Repair
tables are installed transactionally on the first explicitly requested session;
read-only inspection does not upgrade a v3 journal. Existing grants are not converted. Repair
state records session/execution/iteration, owner/project, base and resulting snapshot,
patch and approval references, validation/diagnostic evidence, usage, reservations,
policy digest and timestamps. CAS and fencing prevent concurrent state owners.
The underlying dispatcher remains the authority for consuming a grant and recording
Prepared/Running/Completed around an effect.

Only durable verified results permit progress. A process restart may inspect a
pending human review and continue an effect-free approved operation through the
existing lease protocol. A provider call in flight, applying patch, Running or
Prepared validation, missing/corrupt evidence or uncertain cleanup requires
ReconciliationRequired. No state is invented to reconstruct a missing result.

Terminal classifications include Completed, Cancelled, BudgetExhausted,
NoProgress, Blocked, Failed and ReconciliationRequired. A completed session does
not imply integration. There is no exactly-once guarantee across filesystem,
provider, Podman and SQLite; conservative non-replay is the safety boundary.


Per-iteration records retain provider identity/model metadata and reported usage
when available; unknown usage/cost stays explicit. The exact repair policy/profile
fingerprints and source ancestry are included in proposal artifacts so a persisted
repair approval cannot silently authorize another policy or profile.
