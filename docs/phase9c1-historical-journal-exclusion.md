# Phase 9C.1 — historical journal exclusion

Decision date: **2026-11-27 America/Santo_Domingo**;
archive verified **2026-11-28T03:34:24Z**. Product source remains
`779daab899c2ef9875dc198785ad7b33489763e9`, version **0.8.0**.

## Decision and exact boundary

**Historical synthetic journal: OUT OF RELEASE SCOPE, retained for audit.**
The owner explicitly requested archival and justified exclusion after the successful
fresh-journal E2E. This supersedes the earlier release blocker requiring recovery
of that historical fixture. It does not mark its invalid approvals repaired or
its uncertain operations reconciled.

Only the obsolete synthetic journal that contains 14 inconsistent proposal/review
expiry bindings is covered by this decision. The current registered journal and
its successful live repair remain operationally separate. No general upgrade,
migration or recovery compatibility claim is made for malformed historical journals.

## Verified reasons for exclusion

| Check | Observation |
| --- | --- |
| Host registration | Historical path is absent from all registered project journal selections; current fixture selects its new journal |
| Journal users | No open file handles observed at archive time |
| In-flight durable effects | Zero Prepared or Running operations |
| Existing approvals | All 42 grants expired; statuses remain unchanged |
| Continuation / repair | All continuation leases and repair deadlines expired |
| Historical workspaces | All 20 referenced workspace receipts expired |
| Dedicated runtime | Existing trusted read-only preflight passed against the pinned Machine/image; zero containers present |
| Recorded cancellation | Three Uncertain cancellations in this journal retain their original states and previously verified cleanup evidence |
| Current E2E | Separate journal; completed real repair and its evidence remain unchanged |
| Integrity | Archive and original have identical SHA-256; row checksums and SQLite quick_check passed; the 14 authorization-binding mismatches remain recorded |

These observations support exclusion of inactive local synthetic execution state.
They are not proof of repaired authorization relationships, external billing
settlement, security certification or exactly-once effects.

## Preservation and prohibition on reuse

A private byte-for-byte archive and manifest were created with file mode **0400**
in a protected directory. The manifest records source/archive hashes, verification
time, operation counts, expired scopes and this owner-authorized decision. The
original file, associated artifacts, receipts, evidence and protected host key
remain at their existing private locations. No secret or raw journal is published.
Filesystem read-only mode is an access setting, not an immutable-storage guarantee.

No approval/grant/expiry, HMAC, journal row, operation state or claim was edited;
no source or host configuration changed. No runtime workload or provider request
was executed for archival. No lock or claim was released.

The archive must not be registered, resumed, replayed or used as authorization.
Its operational recovery remains **BLOCKED** pending a supported separately scoped
investigation. Do not edit it to make the current verifier accept historical grants.

Other documented Gate C cancellation probes retain their acceptance-fixture-only
classification and non-replay requirement. This decision neither changes their
states nor grants a blanket exception for another uncertain operation. A newly
relevant effect or active runtime requires a new assessment.

## Release impact

The historical-journal release blocker is removed **only for the fresh-journal
local beta scope**. The [current acceptance](phase9c1-live-acceptance.md),
[checklist](releases/beta-release-checklist.md) and portal distinguish this scope
exclusion from successful operational reconciliation.

At archival time the visual review was still partial; it subsequently passed
[candidate review](phase9c1-release-candidate.md). **Beta remains BLOCKED** for hosted
CI on the final new candidate and final owner release approval.
Version/tag/release authorization remains **PENDING**. No commit, push, merge,
version bump, tag, release or deployment was performed by this decision.
