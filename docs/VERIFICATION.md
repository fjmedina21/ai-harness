# Verification report — Phase 6

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

This candidate has not been pushed, merged, released or remotely validated.
No GitHub Actions result for Phase 6 exists as part of this work. Standard CI
must pass after authorized publication. Version remains 0.5.0 pending release
review/alignment; do not treat this as published version 0.6.0.

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

- Dedicated disposable Podman Machine `harness-phase5`, 2 CPUs, 2048 MiB RAM,
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
