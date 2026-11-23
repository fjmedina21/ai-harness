# Phase 9 autonomy levels and release gates

Audited source: `main` at **9ce59e8b4b6b97757a3104aaed4684c91cbbeef5**,
2026-11-23, including Phase 9 and the OpenAI 9A integration. This audit branch adds
explicitly authorized temporary 160/600-second profiles, restores the maximum to
**120 seconds**, and records evidence plus boundary regressions. Version remains **0.8.0**. Phase 9 is **not completed**.

| Level | Implemented capability | Verified evidence | Authorized scope / gate |
| --- | --- | --- | --- |
| L0 Inspect | Existing Phase 8 read-only workflow retained | Offline regression suite and standard baseline CI | Explicit inspect profile; internal checkpoints remain possible; no new live inspection claim |
| L1 Propose | Fixture/OpenAI natural-language role workflow, strict structured proposals, hashes/policy and reviewed diff | Mocked real Responses adapter, actual CLI processes and filesystem; historical direct API-to-patch pass is narrower | Gate A established for tested offline cases; known synthetic live workflow passed under temporary 600s profile; current 120s profile not live-validated |
| L2 Isolated apply | Private copies, exact independent durable approvals, locks, bounded diff and conservative recovery | Actual local SQLite/filesystem, concurrency, cancellation, crash/reopen; provider HTTP mocked | Gate B established for tested private-host boundary; trusted host approver required; CLI stays pending; no real-provider approved application demonstrated |
| L3 Validate/repair | Bounded repair coordinator and fixed validation registry contracts | Fixture validation only | Gate C BLOCKED; snapshot transfer and current real generated-code build/test/repair isolation evidence absent |
| L4 Supervised broader task | Contracts only | Build | No additional privileges enabled |
| L5 Integration/deployment | Out of scope | No handlers | No automatic merge/push/deployment or production access |

The real four-role synthetic workflow **passed** on 1c3755a49489 under a temporary
600-second profile: four HTTP 200 responses, host-validated expected proposal/diff,
completed advisory review, unchanged source and confirmed cleanup, in 240770 ms.
The 120s attempt had no patch; the 160s attempt validated a proposal but timed out
during review. **Pending — real OpenAI engineering workflow validation under the
restored 120-second profile.** No general model-quality or task-correctness claim
follows. See the [live ledger](phase9-live-smoke.md).

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
it does not certify this branch's later changes. See [verification](VERIFICATION.md#phase-9a-evidence-audit)
and [provider integration](phase9-provider-integration.md).

Remaining work includes live acceptance within the restored deadline, independent approval
UX/authentication, snapshot transfer, current dedicated real isolation E2E, remote
risk acceptance and release gates. Same-UID hostile races, partial multi-file effects,
unknown billing and an undeployed identity verifier remain limitations. No production
readiness or 0.9.0 release follows from this audit.
