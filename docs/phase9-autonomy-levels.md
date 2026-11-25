# Phase 9 autonomy levels and release gates

## Phase 9A.2 — current L2 continuation boundary

Version 0.8.0; implementation starts at `2746500e6787`. **Core L2 Resume** now
persists exact authenticated proposals/diffs and resumes an independently approved
operation in another process after complete source/workspace/policy reconciliation.
CAS lease ownership and monotonic fencing prevent concurrent or obsolete applicators;
Prepared/Running/Uncertain remain blocked. Resume never calls a provider or executes
generated code. Success is ReviewPending with inventory-only verification and no
source integration. Existing L0/L1 and same-session L2 retain their prior behavior.

**Operational L2 Resume is blocked**: fixture identities are test-only and there is
no deployed independent authenticator. CLI lifecycle status/diff/approve/reject/
continue commands are recognized but return authentication_required. A host embedding
must supply verified exact reader/approver/operator authority. L3 remains unavailable,
Phase 9B/9C is not started, Anthropic engineering is deferred and Podman is unchanged.
The following stabilization sections are historical snapshots. Current details and
migration limits are in the [L2 design](phase9-l2-approval-resume-design.md).


Starting main: **082d46fa6d48267c96e92e7feba4f068396e2b4f**, verified on
2026-11-23. Stabilization runtime: **2ce871777b987bcbf262f9eca4f8787a328b4dec**,
local branch feat/phase9a-stabilization. Version remains **0.8.0**; Phase 9 is
**not completed** and L3 remains unavailable.

Stabilization at 2ce8717, based on integrated 082d46f, adds finite layered deadlines,
bounded phase/role metrics and offline benchmarks. Configurable maxima: 900s global /
300s HTTP or role; defaults: 120s OpenAI CLI global / 30s HTTP. One real 360s/180s/180s
acceptance run passed in 262437.172 ms on 2ce8717. The old 600s pass remains historical, not a new gate.
L2 approve/continue now has the separately documented Core implementation above; independent authentication and privileged CLI activation remain operational gates. L3 remains blocked.

| Level | Implemented capability | Verified evidence | Authorized scope / gate |
| --- | --- | --- | --- |
| L0 Inspect | Existing Phase 8 read-only workflow retained | Offline regression suite and standard baseline CI | Explicit inspect profile; internal checkpoints remain possible; no new live inspection claim |
| L1 Propose | Fixture/OpenAI natural-language role workflow, strict structured proposals, hashes/policy and reviewed diff | Mocked real Responses adapter, actual CLI processes and filesystem; historical direct API-to-patch pass is narrower | Gate A established for tested offline cases; synthetic live workflow passed on 2ce8717 at explicit 360s/180s/180s; default 120s slow-model profile not live-validated |
| L2 Isolated apply | Private copies, exact independent durable approvals, locks, bounded diff and conservative recovery | Actual local SQLite/filesystem, concurrency, cancellation, crash/reopen; provider HTTP mocked | Gate B established for tested private-host boundary; trusted host approver required; CLI stays pending; no real-provider approved application demonstrated |
| L3 Validate/repair | Bounded repair coordinator and fixed validation registry contracts | Fixture validation only | Gate C BLOCKED; snapshot transfer and current real generated-code build/test/repair isolation evidence absent |
| L4 Supervised broader task | Contracts only | Build | No additional privileges enabled |
| L5 Integration/deployment | Out of scope | No handlers | No automatic merge/push/deployment or production access |

The new real four-role synthetic workflow **passed** at 2ce8717 with the explicit
360s global / 180s HTTP and role profile, in 262437.172 ms. Host schema/policy,
expected semantics/diff, Reviewer, unchanged source and cleanup all passed.
The prior 600s-profile pass and 120s/160s timeouts remain historical evidence.
No success under the ordinary 120s default is claimed for gpt-5.5-pro. See the
[live ledger](phase9-live-smoke.md). This is not general model-quality validation.

OpenAI engineering is implemented in `main`; Anthropic engineering is deferred by
the owner, while existing Anthropic inspection support remains unchanged. Host
selection of model, file scope, budgets and paid-call confirmation remains mandatory.
Unknown cost is explicit, and estimates never guarantee a provider bill. Missing
usage blocks further work; cancelled requests can have unknown upstream charges.

L2 changes exist only in the private copy. Completed requires trusted human review;
integrated is always false. No model can approve its own proposal. A fixture repair
can complete with levelAvailable=2, validationScope=fixture and l3Gate=blocked.
Successful unit tests or a successful provider response never promote these gates.

## Milestone coverage

| Milestone | Current state |
| --- | --- |
| 1 Architecture/threat model | Defined before implementation; explicit security limits |
| 2 Workspace manager | Private copies, ownership, limits/TTL, lock, inventory, safe host cleanup |
| 3 Structured patches | create/replace/delete, hashes/conflicts, bounded net diff, partial-effect uncertainty |
| 4 Controlled tools | Seven registry/dispatcher tools; no generic unlimited write |
| 5 Durable approvals | SQLite, digest/base/policy binding, independent approval and no uncertain replay |
| 6 Podman validation | Disabled port; approved snapshot transport and real workload evidence missing |
| 7 Validation commands | Fixed host registry; no real generated-code execution enabled |
| 8 Repair loop | Fixture-tested finite coordination; no real sandbox repair |
| 9 Agents | Sequential existing roles; OpenAI requirements/planner/implementer/reviewer composed |
| 10 CLI | Fixture/OpenAI L1 proposals and L2 approval-pending mode; inspect retained |
| 11 Delivery | Proposed/applied/reviewed evidence separated; never original-project integration |
| 12 Recovery | Conservative journal/checkpoint inspection; no uncertain replay or session resume |
| 13 Observability/evals | Bounded metadata, independent deterministic suites; no code/prompts in telemetry |

Final local restoration checks: **570/570**, including 120000 ms acceptance and
120001 ms rejection coverage. The temporary 160/600-second profiles also passed
their bounded offline checks before their real runs. Baseline hosted CI: **568/568** on `9ce59e8b4b6b`;
it does not certify the later audit changes. Publication and subsequent CI are
separate evidence from the local 5bb6317 closure. See [verification](VERIFICATION.md#phase-9a-evidence-audit)
and [provider integration](phase9-provider-integration.md).

Remaining work includes live acceptance within the restored deadline, independent approval
UX/authentication, snapshot transfer, current dedicated real isolation E2E, remote
risk acceptance and release gates. Same-UID hostile races, partial multi-file effects,
unknown billing and an undeployed identity verifier remain limitations. No production
readiness or 0.9.0 release follows from this audit.
