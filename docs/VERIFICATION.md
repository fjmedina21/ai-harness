# Verification — current source version 0.8.0

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
