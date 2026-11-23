# Verification — current source version 0.8.0


## Phase 9A evidence audit

Audit date: **2026-11-23**. Starting `main` and `origin/main` were clean and equal
at **9ce59e8b4b6b97757a3104aaed4684c91cbbeef5** after fetch/ff-only synchronization.
Branch: **docs/phase9a-openai-live-validation**. Version: **0.8.0**. Phase 9
implementation 0aca4039abf2 / documentation 463b3255390e and OpenAI 9A implementation
2cfc4a92aadc / documentation 9ce59e8b4b6b are integrated in that main snapshot.
Temporary long-deadline profiles were separately owner-authorized during this
audit; the maximum has now been restored to **120000 ms**.

| Check / evidence | Observed result and exact scope |
| --- | --- |
| Baseline local build/test | Passed on 9ce59e8b4b6b; **568/568**, zero failed/cancelled/skipped |
| Baseline hosted CI | [45205140383](https://github.com/fjmedina21/ai-harness/actions/runs/45205140383), exact SHA 9ce59e8b4b6b97757a3104aaed4684c91cbbeef5; build-test job 137798700393 succeeded 2026-11-23T15:26:36Z; decoded logs confirm **568/568** |
| Earlier Phase 9 CI | [45174956424](https://github.com/fjmedina21/ai-harness/actions/runs/45174956424), SHA 463b3255390eab90cdb06d6f07adb9a35e3575f8; success, created 2026-11-23T12:30:27Z; separate earlier source |
| Historical direct OpenAI smoke | Recorded pass, gpt-5.5-pro HTTP 200 and valid patch/diff; missing independent retained report and source-binding limitations are explicit in the ledger |
| Full live workflow, 120s | Source 9ce59e8b4b6b; timeout after **120046 ms**, 2 requests, first HTTP 200 then cancellation; no patch; source unchanged and cleanup confirmed |
| Full live workflow, 160s | Source **11c3738e42ccb9603cc198a434e3ce635c2efda1**; timeout after **160058 ms**, 3 HTTP 200s and a host-validated proposal, then reviewer cancellation; source unchanged and cleanup confirmed |
| Full live workflow, temporary 600s profile | Source **1c3755a494895d071937c8f12f9c1da6e8cf2fb0**; **PASSED**, 4 HTTP 200s, **240770 ms**, proposed, valid expected proposal/diff and completed advisory review; source unchanged and cleanup confirmed |
| Successful run usage | Reported **2132 input / 874 output**; **598 reasoning included in output**; cost unknown, no host rates. Earlier cancelled requests have unknown usage/cost |
| Local temporary-profile checks | Both 160s and 600s revisions passed build, **570/570** full tests and **63/63** focused runtime/CLI/transport cases before their real runs |
| Final restored build/test | **570/570** after restoring 120000 ms; zero failed/cancelled/skipped |
| Final focused checks | **63/63**; 120000 ms acceptance and 120001 ms rejection, mocked actual CLI/smoke processes, existing cancellation/timeout tests |
| Documentation / private files | 65 relative links/anchors verified, git diff --check clean; no new key/path patterns found; excluded private-file metadata unchanged |
| Hosted CI at audit closure 5bb6317 | Not run at that pre-publication snapshot; baseline CI does not certify later changes. The owner subsequently authorized merge/push; assess subsequent CI against its own SHA |
| L2 / L3 | L2 actual filesystem/SQLite with mocked provider HTTP and independent approvals; no live-provider approved application. L3 blocked; no Podman run |

The synthetic four-role OpenAI workflow is **live verified under the temporary
600-second profile**. It is not a pass under the restored **120-second** profile:
the complete trace took 240.77 seconds and one request took 140.56 seconds.
Successful live acceptance within the restored deadline remains pending. An
HTTP 200 alone, a valid patch without finished review, or an offline mock is not
substitute evidence. The smoke returned exit 0, smokePassed=true, proposed and
proposalValidated=true, with no patch application or generated-code execution.
Its completed review is model advice, not independent human authorization.

The original no-call scope was changed only by later owner authorization for real
execution, uncertain cost, the 160-second extension, and a long attempt followed
by restoration. The long attempt used a disclosed finite 600-second window and
the existing 6-request / 512-output-token-per-request budget. No unlimited loop,
automatic fallback, Anthropic, L3, push, merge, tag or release was performed.
Runtime source files again match 9ce59e8b4b6b; additional boundary tests remain.

See the classification matrix, HTTP/timing/token records, digests, source/cleanup
assertions and limitations in the [live ledger](phase9-live-smoke.md). The existing
smoke does not emit date/commit/duration/HTTP observations itself; current attempts
used its exported entry point with a host metadata wrapper around real native fetch.
This validates the application workflow, not a live interactive CLI subprocess;
actual CLI subprocess E2E remains mocked HTTP. No private prompt, response body,
credential, approval ID, source code or host path is published.

The audit reviewed non-secret local reports without changing or publishing them.
No independent older Phase 9A live JSON/log was found. Historical direct-smoke
numbers below are preserved documentary observations, not reconstructed usage.
The following sections are dated closure snapshots; their branch/count/publication
statements belong to those dates. Historical clean/help/evaluation checks were
not rerun in this audit's build/test sequence.

## Phase 9A OpenAI local closure

Date: **2026-11-23**. Starting commit **463b3255390eab90cdb06d6f07adb9a35e3575f8**.
Branch: **feat/phase9-real-provider-engineering**. Node **24.18.0**, pnpm
**12.21.0**, source version **0.8.0**. Owner scope is OpenAI only; Anthropic
engineering is deferred. This historical section records the original local closure;
subsequent main integration/CI are verified in the audit above.
Implementation commit: **2cfc4a92aadcd16f6ae75b96e283a183b04f7113**;
the documentation commit contains this final report.

| Check | Historical closure result |
| --- | --- |
| Baseline build and full tests | Passed, **512/512** |
| Final pnpm clean / build / test | Passed, **568/568**; zero failed/cancelled/skipped |
| Separate OpenAI application + CLI subprocess + transport suites | Passed, **69/69**; included in the full count |
| pnpm harness --help / version | Passed; **0.8.0 (experimental)** |
| Deterministic evaluation | **19/19**, **42/42 assertions** |
| Phase 9 evaluation | **10/10**, **10/10 assertions** |
| Real adapters + mocked HTTP | New OpenAI L1/L2, JSON/protocol, budgets, failure/usage/timeout/cancellation and no-fallback tests passed |
| Real filesystem + SQLite | Selected context, original unchanged, exact independent pending/approved application tested |
| Actual CLI processes | JSON/text, fixture compatibility, no implicit .env load, L2 pending, cancellation 130 and timeout 124 tested |
| New full-workflow smoke at original closure | Opt-in script and mocked subprocess/semantic/cleanup checks passed; live was not executed then. Current real attempts are recorded above |
| Prior direct live smoke | gpt-5.5-pro HTTP 200, valid patch/diff, source unchanged; **separate baseline evidence**, not new CLI validation |
| Real Podman / L3 | **Not executed / blocked** |
| Hosted CI at original local delivery | Not yet run at that moment; subsequently passed for integrated 9ce59e8b4b6b, as verified above |

Tests detected and corrected the legacy OpenAI text adapter's omitted
max_output_tokens wire field, telemetry binding registration, explicit invalid
proposal outcomes, and estimated usage retention for incomplete responses. Native
output limits now have request assertions. The default HTTP deadline remains 30s;
explicit host-selected deadlines are bounded to 120s. The earlier direct smoke's
observed output was below the requested cap but did not establish provider cap
serialization or a 120s adapter deadline; see [live evidence](phase9-live-smoke.md).

Scope, compatibility and security are documented in
[provider integration](phase9-provider-integration.md). Optional full-workflow paid
smoke requires separate owner approval; no credential is read from .env during
standard tests. No raw provider error, key, prompt or code is telemetry. Current
source changes retain default-deny, independent approvals, original-root read-only
behavior, no generated-code execution and no real L3. Full Phase 9 remains partial.


## Phase 9 local verification

Date: **2026-11-23**; Node **24.18.0**, pnpm **12.21.0**, macOS arm64.
Starting commit: **fdcb1130e91ac37212e41253103b7b01f6415040**, on clean main
synchronized with origin after fetch/ff-only verification. Development branch:
**feat/phase9-autonomous-engineering-runtime**. Version remains **0.8.0**.

| Required check | Historical closure result |
| --- | --- |
| Baseline build/test | Passed, 427/427 |
| pnpm clean | Passed |
| pnpm build | Passed |
| pnpm test | **512/512 passed**, zero failed/cancelled/skipped; 85 new regression cases included |
| Focused Phase 9 suites | Passed incrementally, latest standalone 83/83 before final deadline/checkpoint regressions; all current cases are included in 512 |
| pnpm harness --help / version | Passed; ai-harness 0.8.0 (experimental) |
| pnpm harness eval run --suite deterministic | **19/19 scenarios; 42/42 assertions** |
| pnpm harness eval run --suite phase9 | **10/10 scenarios; 10/10 assertions** |
| git diff --check | Passed |
| Private/generated artifacts | AGENTS.md, docs/AI-HARNESS-HANDOFF.md and harness-development remain locally excluded; dist/node_modules are not selected |
| Real filesystem / SQLite | Passed via synthetic temporary projects, approvals, concurrency, cancellation, cleanup and actual process crash/reopen |
| Real generated-code Podman / provider execution | **NOT RUN**; no credential use, billing, Machine startup or profile changes |
| Podman read-only inspection | 6.1.4 installed at /opt/podman/bin/podman; existing ai-harness-isolation Machine stopped; no effective current-code workload validation |
| Hosted CI | **NOT RUN** for this branch; baseline CI is not new-change evidence |

The full-suite gate first exposed timeout checkpoint finalization inheriting an
aborted signal. The correction added independent bounded terminal persistence,
kept L1 free of checkpoints, and added L2 cancellation regression coverage; the
subsequent complete required command sequence passed. A trusted crashing test
worker exercises journal Running + actual file changes + a stale lock without
executing any synthetic-project code. No exactly-once or power-loss guarantee.

See [full report](phase9-e2e.md), [level matrix](phase9-autonomy-levels.md),
[threat model](phase9-security.md) and [blocked real sandbox gate](phase9-sandbox-validation.md).
This historical Phase 9 source is now integrated; Phase 9 is still incomplete. Implementation commit: **0aca4039abf2837b9ae68533b2ae196102bc6091**.
The report was recorded by 463b3255390e, now integrated in the audited main. The earlier no-push/no-merge statement described original local delivery, not current publication status.

## Historical Phase 8 evidence

The sections below preserve the earlier closure-time evidence and then-current
local/unmerged descriptions. That closure is included in the actual starting main
fdcb1130e91a verified above. No fresh GitHub CI/release claim is made here.


Integrated baseline: **`c87d22f2de3a09eed85938c4d955a54f4f00cd7c`** on `main`,
including [PR #3](https://github.com/fjmedina21/ai-harness/pull/3). Standard CI
[45095776893](https://github.com/fjmedina21/ai-harness/actions/runs/45095776893)
was verified through GitHub: `build-test`, install, build, tests and CLI smoke
all passed for that exact SHA. The 18-run Actions history contains only standard
CI; no dedicated remote isolation run was found. The releases API returned no
releases; npm publication was not independently checked.

## Final Phase 8 closure — local candidate evidence

Date: 2026-11-22 (America/Santo_Domingo). Branch:
`chore/phase8-final-closure`, starting from the integrated SHA above.
Environment: Node **24.18.0**, pnpm **12.21.0**, TypeScript **5.8.3**, macOS arm64.
These closure changes are **local, not merged or published, and have no CI run**.
Baseline CI does not certify this branch's new fix or regressions.
The local compatible fix and regressions are committed at
`87b32b39ce5589b30df1c8da09d9d5a562043aca`; documentation follows in a separate
local closure commit.

| Check | Observed result |
|---|---|
| Baseline clean/build/full tests | Passed; 424/424 tests |
| Final `pnpm clean`, `pnpm build`, `pnpm test` | Passed; **427/427**, zero failed/cancelled/skipped |
| Focused transport/application/CLI regression run | Passed; 31/31 (included in full suite) |
| Focused Phase 8 application/CLI E2E | Passed; **18/18** (included in full suite) |
| Real CLI subprocess smoke | init, doctor, fixture inspect JSON/text and status passed; reopened SQLite, optional telemetry, three roles, three reads and six fixture turns; README unchanged; temporary resources removed |
| `pnpm harness --help` / `version` | Passed; **ai-harness 0.8.0 (experimental)** |
| Deterministic evaluation | **19/19 scenarios, 42/42 assertions**; known host fixtures only |
| Docs links, versions, exclusions, `git diff --check` | Passed locally; no generated/private artifacts selected for commit |

Tests use synthetic projects, mocked HTTP and the actual local SQLite backend.
Real provider credentials were removed from the test process environment;
provider tests supply synthetic values and replace HTTP. No live API, real
Podman isolation or infrastructure command was executed in this closure.
Repeated focused runs are not additional unique tests beyond the 427 total.
Private support logs remain under excluded `harness-development/phase8-final-closure/`.

### Audit and compatible correction

- CLI → application → sequential orchestrator → planner → code reviewer →
  validator → parsed/validated calls → Default Deny dispatcher → bounded
  `file.read` → checkpoints / optional SQLite / optional telemetry → structured
  result. Inspection completion never means source implementation or project
  test execution; the default SDD path still generates proposals.
- Execution/task identities, native tool/result call IDs, durable request/call
  scope and progress correlation remain separated and tested. Host selection
  owns provider/model, permissions, budgets and paths; project config cannot
  authorize extra tools. `complete()` and public exports remain compatible.
- Reproduced inherited-property lookup in HTTP error classification: `__proto__`
  returned an object and `constructor` a function instead of a fixed category.
  The compatible fix uses own-property lookup; unknown codes become `unknown`
  and a recognized error type can still classify the response. No retries,
  billing changes or extra provider requests were added.
- Added regressions for that lookup, both-provider HTTP failure through CLI
  without retry/fallback or sensitive telemetry, and CLI timeout exit 124 with
  in-flight abort and reopened cancelled checkpoint. Strengthened identity and
  project-config permission non-escalation assertions.
- Provider sessions close in agent `finally`; HTTP timers/listeners and streams,
  read descriptors, telemetry sinks and SQLite lifecycle were reviewed. Reopen,
  cancellation, timeout, invalid stores and resource cleanup are covered by
  local regressions. This is not exhaustive leak testing or sandbox proof.

### Security acceptance and remaining trust

Inspection exposes only `file.read` with `files:read`. No shell, source-writing,
Git mutation, deployment, container execution, approval self-grant, provider
fallback or automatic replay is added. Telemetry allowlists discard payloads;
HTTP diagnostics retain numeric status/fixed categories, not upstream bodies.
Checkpoints and summaries can retain requests and sensitive model-derived data.

Filesystem guards are not race-free rooted confinement; sensitive filename
filters do not find every secret. Checkpoint directories and ancestry remain
host-trusted local state (including protection against link substitution).
Snapshots are not authenticated authorization records. Telemetry is bounded,
lossy and single-writer; cancellation does not promise rollback; recovery does
not resume native provider sessions or guarantee external exactly-once effects.
No architectural/security guarantee was expanded by this closure.

### Deferred external acceptance gates

| Gate | Status and limitation |
|---|---|
| OpenAI | **Deferred — live provider interoperability validation**; failed HTTP 429 history below retained; no successful complete live workflow |
| Anthropic | **Deferred — live provider interoperability validation**; deterministic HTTP only, no successful complete live workflow evidenced |
| Dedicated remote Podman | **Deferred — dedicated remote infrastructure validation**; PR #3 preparation integrated, historical local isolation retained, no remote run |
| Package distribution / formal release | Not performed; npm unverified and no GitHub Release found; version stays 0.8.0 |

These unpassed gates do not block the experimental offline read-only scope.
Remote isolation remains mandatory before future untrusted-code execution,
subject to a separate threat model. Phase 9 is **Not started — design pending**;
see [the design handoff](ROADMAP.md#phase-9-readiness--design-handoff-only).

---

## Phase 8 source — historical local evidence

Initial Phase 8 snapshot: `d9ecbf49597c5c22784257d519a6a217c2c9e73f`; the
source at the diagnostics snapshot was `5991799d278e88c69abe4f1fdc27b7cf405469de`.
Environment: Node.js 24 and pnpm 12.21.0 on the local development machine.

- pnpm clean: passed.
- pnpm build: passed.
- pnpm test: passed, **417/417 tests**, zero failed, cancelled or skipped.
  This includes 16 new offline application/CLI integration tests; provider
  protocol coverage uses mocked HTTP and no live credentials.
- pnpm harness --help: passed and lists the inspection workflow and opt-in
  controls.
- pnpm harness version: reports **ai-harness 0.8.0 (experimental)**.
- pnpm harness eval run --suite deterministic: **19/19 scenarios and 42/42
  assertions passed**; these are host-authored deterministic fixtures.
- git diff --check: passed on the Phase 8 source tree before finalization.
- `pnpm clean`, `pnpm build`, `pnpm test`, CLI help/version and deterministic
  evaluation were rerun during finalization; all passed on the integrated
  source commit; that suite had 417 tests. The diagnostics follow-up at `5991799`
  passed locally with **421/421 tests** before the subsequent runner-preparation work
  added three deterministic tests (integrated by PR #3). Four diagnostics tests cover safe category
  mapping, telemetry retention, unknown codes and bounded error bodies. No live
  calls were part of the diagnostics suite.

The new E2E tests use temporary local projects and the actual filesystem and
SQLite journal, including reopen/persistence, invalid-journal rejection,
cancellation, telemetry, and CLI status. OpenAI and Anthropic adapters run
through mocked HTTP only. The real OpenAI smoke was attempted with
`gpt-6-luna`, the synthetic fixture, a 128-token output ceiling and a six-call
request budget. It failed on its first request before a file read or task
completed. Two one-request diagnostics also failed with HTTP-class errors; the
last returned HTTP 429. The error body was not captured, so the cause remains
unknown. No token usage or cost estimate was returned. Three network requests
were made in total; no further retries were made. This was a failed live
provider attempt, not provider validation. See OpenAI's
[error guidance](https://developers.openai.com/api/docs/guides/error-codes).
Commit `5991799` integrates bounded allowlisted error-category capture; its
local full suite passed with 421 tests and hosted standard CI run 45082194651
passed. It does not change retries or authorization. The initial Phase 8 change
at `d9ecbf4` did not modify Podman policy, so the real isolation suite was not
run for that candidate. Standard hosted GitHub Actions CI run
[45076334502](https://github.com/fjmedina21/ai-harness/actions/runs/45076334502)
completed successfully for commit `d9ecbf49597c5c22784257d519a6a217c2c9e73f`
(install, build, test and CLI smoke). This does not validate live provider
behavior or the separate real isolation workflow. No reproducible performance
benchmark was run, so no runtime performance improvement is claimed.

## Dedicated runner preparation — historical branch evidence, now integrated

On `ci/dedicated-podman-isolation-validation`, `pnpm clean`, `pnpm build`,
`pnpm test`, `pnpm harness --help`, `pnpm harness version` and
`git diff --check` passed; **424/424 tests passed**. Three new tests cover
public evidence redaction, GitHub context allowlisting and strict network-denial
classification. These are deterministic checks and do not execute Podman.
The workflow/docs/source changes were subsequently integrated into `main` by
PR #3 at `c87d22f2de3a09eed85938c4d955a54f4f00cd7c`; standard CI run
[45095776893](https://github.com/fjmedina21/ai-harness/actions/runs/45095776893)
passed. No real isolation suite or remote workflow was run for that preparation.
Its three tests are deterministic, not evidence of real remote isolation.

## Published Phase 7 baseline — historical evidence

Phase 7 was merged and pushed to `main` at `c390459609d262b66023deeb7ec3e594fe1ca693`.
The hosted GitHub Actions CI run [45035585620](https://github.com/fjmedina21/ai-harness/actions/runs/45035585620)
completed successfully for that exact commit; install, build, test and CLI smoke
steps passed.

Local validation on `feat/phase7-observability-evaluations` before publication:
`pnpm clean`, `pnpm build`, `pnpm test` passed; 401/401 tests. CLI help and
deterministic evaluation passed: 19/19 scenarios, 42/42 assertions.
`git diff --check` passed. Logs are under excluded
`harness-development/phase7/`.

No live provider calls or live tariff checks were part of validation. Podman
controls were unchanged and not retested. The standard hosted CI above passed;
the separate dedicated remote Podman isolation workflow has no passing run
recorded in this report. The local microbenchmark measured
memory sink 3.47 μs median, JSONL sink 141.31 μs, SQLite list-100 787.77 μs
and unique registration 31.29 μs (9×2,500, Node 24.18.0/macOS arm64).
These environment-specific figures did not justify optimization. Evaluations cover
known fixtures only. Cost values are estimates. Telemetry is lossy and best
effort, not a durable journal. See phase7-observability.md,
phase7-evaluations.md and phase7-security.md.

---

# Historical local verification — Podman-only runtime

The following sections are preserved snapshots from their named phase/candidate.
Statements about publication or CI below describe only that snapshot and do not
override the current source state above.

Owner-directed local change on feat/phase6-durable-execution-recovery.
Docker daemon/context execution and implicit backend selection have been removed.
At that snapshot, this candidate had not been published and remote CI had not
been run for the change.
Older sections below preserve historical evidence from earlier implementations.

## Local checks after Docker removal

- pnpm clean, pnpm build, pnpm test: success, **350/350 tests passed**,
  zero failed/cancelled/skipped.
- pnpm harness --help and git diff --check: success.
- Former Docker runtime regression cases now use native Podman fixtures.
  Five new tests reject explicit Docker, legacy implicit Docker, mixed options,
  unknown backends and former/missing-backend profile configurations without
  making process calls.
- The 348-test starting suite had three Docker-only daemon capability cases
  superseded by native Podman capability coverage; five rejection tests were added.
- No package manager, external dependency, credential or privileged tool added.
- Existing owner CLI/fixture/report edits are preserved.

## Real Podman evidence after removal

pnpm test:isolation returned exit 0 and status=passed at
2026-11-22T13:45:09.951Z, using the updated source and private Podman-only profile.

- Dedicated disposable rootless VM ai-harness-isolation; Linux/arm64,
  Podman client/server 6.1.4, kernel 7.2.7-200.fc44.aarch64.
- Host Node v24.18.0, container Node v24.22.3.
- Image docker.io/library/node@sha256:b4955566e9320d2b70ddbd933053c216ae4b1d83f6bf947184e4d7de504059c2,
  ID 9ca3f7b76099c042f1e655ca8936e0a1ccda68b3c74a8a36375428ef76476d4e.
- Actual UID 65534; effective capabilities empty; seccomp=2;
  no-new-privileges=true; root filesystem read-only.
- Empty bounded 16 MiB tmpfs; no host shares/socket/workspace exposure;
  container network denied.
- Actual memory 256 MiB, swap 0, PID limit 64, CPU quota 0.5.
- Cancellation after observed Running, timeout and cleanup all confirmed.
- Independent final container query returned an empty list. VM stopped afterward.
- No runtime installation, image pull, daemon/context change or Docker command
  was performed. The OCI registry name docker.io is retained as image provenance,
  not a supported execution backend.

Supporting scripts, complete logs, owner snapshots and machine-readable evidence
are under excluded harness-development/docker-removal/. No generated build
files belong in Git. No new commit, push or merge was part of this removal.

## Migration and remaining limits

ContainerExecutor/result names stay neutral; option contracts now require
explicit backend=podman, podmanExecutable, machineName, qualified digest-pinned
image and approved security profile. Docker/legacy callers must migrate
explicitly; no compatibility execution path or automatic conversion remains.
See [current runtime migration/security](phase5-security.md).

Remote dedicated-runner evidence is pending. Passing these fixed-workload probes
does not establish protection against arbitrary code/kernel escapes or a
compromised host. Filesystem TOCTOU, uncertain external effects and manual
reconciliation limitations remain.

---

# Historical local verification — Phase 6

Local candidate on feat/phase6-durable-execution-recovery, starting from clean
main/origin/main 959f20f5fb7cd70790ccd492a06a3ad2f4fd6f16 (version 0.5.0).
The starting build and 282 tests passed before implementation.

## Final local evidence

- pnpm clean, pnpm build, pnpm test: success, **348/348 tests passed**,
  zero failed/cancelled/skipped; 282 baseline tests plus 66 new tests.
- Focused durable suite: **66/66 passed** on the actual SQLite backend.
- pnpm harness --help and git diff --check: success.
- Environment: Node 24.18.0, pnpm 12.21.0, TypeScript 5.8.3, local macOS.
- No real credentials, paid model calls, external database or new external
  dependency were used. Providers were deterministic fixtures/mocked HTTP.
- Local supporting plans, logs and machine-readable results are exclusively
  under excluded harness-development/phase6/. AGENTS.md and the local handoff
  remain excluded and untracked. No generated build output belongs in commits.

| Coverage | New tests | Evidence type |
| --- | --- | --- |
| State machine, journal, approvals, corruption, bounds, recovery | 30 | Unit/domain checks plus actual SQLite/filesystem integration, interprocess races and SIGKILL/reopen |
| Dispatcher and verified approval service | 24 | Real SQLite integration; selected port failures injected to cover acknowledgement windows |
| Orchestrator, both tool agents and read-only factory | 10 | Real SQLite/filesystem/checkpoints with fixture model sessions |
| Canonical digest semantics and input budgets | 2 | Deterministic unit tests |

Actual backend/process evidence includes:
- Reopen persistence for operation, grant and full event history.
- Old Created/PendingApproval/Approved/Prepared/Running sessions cannot execute.
- Real independent Node processes race the same request and same call ID under
  different request IDs; exactly one fixed local fixture effect is observed.
  This is bounded duplicate-prevention evidence, not external exactly-once.
- Parent-confirmed SIGKILL at Prepared, Running, after a flushed local effect
  but before completion persistence, and inside an uncommitted SQLite update.
  A new store recovers the journal without replay; Running/Prepared need host
  reconciliation. The existing flushed effect remains single.
- Actual SQLite lock contention, event-insert failure/transaction rollback and
  SQLITE_FULL using a lowered database page cap. Approval/state/event changes
  roll back together; a storage failure retires execution for that store.
- Physical corruption, bad payload/checksum/state/schema, missing grant/events,
  unsafe filesystem modes, symlinks and hardlinks fail closed without recreation.
- Expiry is tested at decision, prepare and start. Revocation/denial/consumption,
  repeated requests, changed scope, stale versions and concurrent decisions fail closed.

Injected storage-port failures additionally cover pre-start errors, failed
completion persistence and a committed completion whose acknowledgement is
lost. These are fault-window tests alongside real backend tests, not substitutes
for durability/concurrency tests. Handler failures/cancellation preserve
Uncertain where possible; a failed commit can leave Running/Completed for
inspection. No success is fabricated and no failed authorization is reused.

The clean regression run initially found that a new checkpoint changed the
legacy callback sequence; the additional task-Running save now applies only
to explicit orchestrator durable opt-in. Final baseline regressions pass.

## Publication, user changes and limits

At the Phase 6 candidate snapshot, it had not yet been pushed or merged; the
workspace was then 0.5.0 pending release alignment. Phase 6 was subsequently
integrated as part of 0.6.0. The Phase 7 standard CI run validates the final
combined `main` tree; it is not retroactive CI evidence for the earlier Phase 6
candidate commit.

The owner concurrently edited CLI help formatting, the Podman fixture machine
name/formatting and the historical Podman machine name below. Those changes are
preserved separately from Phase 6 commits. At the owner request, the helper is
now computePodmanMachineFingerprint, without the former alias; it computes the
same digest and changes no runtime policy.

No container runtime controls were functionally changed, so the live Podman
isolation suite was not rerun. Existing deterministic container regressions
pass. Historical real Podman evidence below remains distinct from this phase;
live Docker and dedicated remote isolation validation remain unverified.

Residual limits: trusted host/verifier/clock and local filesystem, no same-user
tamper or database rollback resistance, no deployed IdP, no hardware power-loss
proof, no distributed fencing, no atomic external effect/SQLite commit, no
durable provider transcript or automatic task/model-session continuation.
Independent request IDs can describe the same real-world effect: the host must
not create fresh IDs to bypass uncertainty. Manual recovery requires authentic
external evidence and quiescence. See [architecture/runbook](phase6-durable-execution.md)
and [security](phase6-security.md).

---

# Historical verification report — Phase 5

Phase 5 was integrated and pushed to `main` at `fdd5c3b`.

Implementation and real isolation are **locally verified on Podman**. The
dedicated GitHub workflow is prepared but has not produced remote isolation
evidence; its runner and approved profile must first be configured. The GitHub
combined-status lookup returned no status records for `fdd5c3b`, so this report
does not assert that commit's hosted build/test job passed.
Reference baseline: Phase 4 merged at `25fdb68`, 198 tests, successful published CI.
Local environment: Node 24.18.0, pnpm 12.21.0, TypeScript 5.8.3.

## Local checks

- `pnpm clean`, `pnpm build`, `pnpm test`: successful; **282 tests passed**,
  0 failed/cancelled/skipped. This comprises 198 prior regressions and 84 new tests.
- Six existing container regression cases retain their purpose with updated
  protocol-aware fixtures for mandatory preflight and sanitized errors.
- `pnpm harness --help`: successful; default CLI/SDD fixture behavior unchanged.
- `git diff --check`: no whitespace errors. No generated artifacts staged.
- Exclusive local development documents/directories remain outside the index.

New coverage: process runner and process-group termination/environment isolation (9), dispatcher
cancellation (2), container preflight/effective policy/owned cleanup (28),
bounded file reads and controlled races (10), isolated-suite/profile loader
and fixed probe syntax/immutability (6), agent cancellation/confinement (2),
native Podman selection/preflight/translation/cleanup/security conformance (27).

Process and filesystem fixtures run on actual temporary local resources; Podman
execution in mandatory tests uses fixtures. No credentials are used for tests.
Local process-group tests do not establish a container or OS sandbox.

## Real isolation gate

`pnpm test:isolation` returned exit **0**, JSON `status: passed`, at
`2026-11-22T02:49:47.473Z`. This run used real containers, not fixtures:

- Dedicated disposable Podman Machine `harness-isolation`, 2 CPUs, 2048 MiB RAM,
  16 GiB disk; rootless Linux/arm64, no host shares (configuration and guest
  `findmnt` checked), no privileged containers or workspace/socket binds.
- Podman client/server 6.1.4, kernel `7.2.7-200.fc44.aarch64`;
  cgroup v2/systemd, delegated cpu/memory/pids, seccomp enabled.
- Node image `docker.io/library/node@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5`,
  resolved ID `9ca3f7b76099c042f1e655ca8936e0a1ccda68b3c74a8a36375428ef76476d4e`,
  container Node v24.22.3. Bootstrap pulled anonymously; executor pulls never.
- Guest probes verified UID/GID 65534, empty effective/bounding capabilities,
  seccomp mode 2, no-new-privileges, read-only root, empty bounded 16 MiB tmpfs
  with nosuid/nodev/noexec, socket absence and external network denial.
- Actual cgroup values: memory 256 MiB, swap 0, pids 64 and CPU quota 0.5.
- Cancellation occurred only after read-only daemon inspection confirmed
  `State.Running=true`. Cancellation and timeout both required confirmed removal.
- A final independent container listing was empty; the owned VM was then
  stopped successfully. The VM/image remain available locally for another run.

Initial real attempts exposed macOS temp/socket identity and native Podman
metadata/tmpfs/stop-time differences; these were corrected with regression
coverage. Early removals exceeded the deadline and correctly reported uncertain
cleanup; subsequent read-only reconciliation confirmed absence. No operation
with effects was automatically retried. No Lima or additional runtime was installed.

Detailed private profiles, bootstrap metadata and machine-readable results remain
under excluded `harness-development/runtime/` and `harness-development/reports/`.
The executor never creates a VM or installs a runtime automatically. This host's
command sessions terminate helper processes on exit, so bootstrap kept its
control session open through validation and closed the VM explicitly afterward.

Docker Desktop `desktop-linux` was preserved: its cgroupfs/non-rootless daemon
was not used for probes. **Live Docker isolation is not established.** No global
Docker settings were changed. The standard hosted CI job does not run the
dedicated suite. `.github/workflows/phase5-isolation.yml` now provides a manual
job restricted to a self-hosted `ai-harness-phase5-isolation` Linux runner and
the `phase5-isolation` GitHub Environment. The runner, environment approval
rules and `HARNESS_ISOLATION_PROFILE_PATH` still need to be configured; until a
run passes, remote isolation validation remains pending.

## Git and delivery

The Phase 5 delivery commit is `fdd5c3b` on `main` and `origin/main`. Its
publication is complete. This report's current combined-status lookup returned
no status records for that SHA; inspect GitHub Actions before treating the
standard build/test run as green. No new commit or push is part of this report
update.

## Remaining risks

Descriptor checks and incremental reads do not provide race-free rooted
filesystem confinement. Hardlinks/concurrent mutations are rejected; create-only
writes can remain partial. Cancellation cannot roll back effects or prove a
late daemon request was never processed; uncertain resources need host review.
The host/daemon/profile remain trusted. No kernel-escape, durable journal,
transactional approval, automatic recovery or exactly-once guarantee is established.
See [Phase 5 security and migration](phase5-security.md).
The workspace version is `0.5.0`; see the [versioning policy](VERSIONING.md).
