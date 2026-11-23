# Phase 9 autonomy levels and release gates

Status: partial experimental implementation on
`feat/phase9-autonomous-engineering-runtime`, based on `fdcb1130e91a`.
Version remains 0.8.0. Phase 9 is **not completed** and no 0.9.0 release is proposed.

| Level | Implemented capability | Evidence | Enabled scope / gate |
| --- | --- | --- | --- |
| L0 Inspect | Existing Phase 8 read-only workflow preserved | Full deterministic regression suite | Existing explicit inspect profile; does not imply no internal checkpoint |
| L1 Propose | Structured proposals, policy/schema/hash validation and reviewable diff | Synthetic agents; real bounded filesystem reads; no source/workspace writes | Gate A established for known offline fixtures; CLI fixture recipe and host adapter port only; real-model generation unverified |
| L2 Isolated apply | Private copies, exact durable approvals, scoped patch application, locks, net diff, cleanup and conservative recovery | Real local filesystem/SQLite, concurrent calls, cancellation, partial effects, process crash/reopen | Gate B established for tested private-host boundary; programmatic host approval required; CLI stops pending approval; no hostile same-UID race guarantee |
| L3 Validate/repair | Bounded sequential repair coordinator and validation registry contracts | Fixture validation/evidence only | Gate C BLOCKED; real snapshot transport, current approved local isolation and real build/test/repair E2E absent; unavailable |
| L4 Supervised broader task | Contracts only | TypeScript build | No added privileges enabled |
| L5 Integration/deployment | Out of scope | No handlers | No merge/push/deployment/production access |

The host adapter port can supply request-based proposals without vendor schemas;
this change does not wire OpenAI/Anthropic into implement CLI. No arbitrary
natural-language request capability is established by the CLI fixture recipe.
Existing provider inspection behavior remains intact. Model adapter authorization,
finite per-call reservation/usage/cost estimates and subsequent live interoperability
validation are separate. Estimated spend is not a provider billing guarantee;
missing/invalid usage stops work and usageComplete is false.

L2 source changes are only in the isolated copy. Completed means the trusted host
confirmed review of the available evidence; integrated is always false. A fixture
repair can reach that delivery state while levelAvailable remains 2, validationScope
is fixture and l3Gate is blocked. Passing unit tests never changes these gates.

## Milestone coverage

| Milestone | Current state |
| --- | --- |
| 1 Architecture/threat model | Written before implementation; limits recorded |
| 2 Workspace manager | Private copies, ownership/identity, limits/TTL, lock, inventory, explicit safe host cleanup |
| 3 Structured patches | create/replace/delete, hashes/conflicts, bounded net diff, partial-effect uncertainty |
| 4 Controlled tools | Seven explicit registry/dispatcher tools; no generic unlimited write |
| 5 Durable approvals | Existing SQLite path; digest/base/policy binding; self-approval rejection for patch.apply |
| 6 Podman validation | Intentionally disabled port; transport design pending approval and implementation |
| 7 Validation commands | Fixed host description registry, no production execution |
| 8 Repair loop | Implemented and fixture-tested, no real sandbox repair |
| 9 Agents | Existing roles, sequential proportional task plan; no parallel writes |
| 10 CLI | Fixture proposal and isolated approval-pending modes; inspect retained |
| 11 Delivery | Diff scope, statuses, files, evidence/usage/risks/review; never integration |
| 12 Recovery | Journal/checkpoint/receipt inspection and no replay; no session resume |
| 13 Observability/evals | Closed-schema events and independent deterministic phase9 suite |

Remaining work includes the concrete real snapshot/validation path, live provider
engineering adapters/interoperability, approval UI with a deployed identity verifier,
current real isolation E2E, and release acceptance. Existing abstract verifier and
host adapter ports are not deployed authentication or validated model integrations.
