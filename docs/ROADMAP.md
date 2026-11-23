# AI Harness — implementation roadmap

This status follows the implemented code. Earlier broad architecture proposals
are targets, not evidence that those capabilities were delivered.

## Current source state

The starting `main` is version **0.8.0** at **fdcb1130e91a**, verified clean and
synchronized with origin before creating the Phase 9 branch. Phases 0–8 are
integrated experimental foundations; baseline build/tests passed 427/427 locally.
Phase 9 is partially implemented on its feature branch, with **512/512** current
local tests. No hosted CI was run for the new branch. Earlier c87d22f / PR #3 and
Phase 8 closure CI/results remain historical evidence for their respective SHAs.

Live providers: **Deferred — live provider interoperability validation**.
Remote Podman: **Deferred — dedicated remote infrastructure validation**.
The remote workflow has no run in the verified 18-run Actions history; see
[its runner runbook](DEDICATED-PODMAN-RUNNER.md). These are acceptance limitations,
not passed gates. They do not block the offline Phase 8 scope because inspection
does not execute agent code in containers. The remote gate remains required
before future untrusted-code execution, with its own risk review. No GitHub
Release was found; npm publication was not independently verified. `0.8.0`
remains an experimental source milestone.

| Phase | Implemented scope | Status |
|---|---|---|
| 0 | Monorepo, configuration, project initialization, role declarations, CLI | Implemented and integrated; experimental foundations |
| 1 | Sequential task orchestration, fixture/text providers, SDD, checkpoints | Implemented and integrated; experimental foundations |
| 2 | Registry, Default Deny dispatcher, scoped approvals, restricted reads/subprocesses | Implemented and integrated; experimental foundations |
| 3 | Tool-calling contracts/agent, container mock tests, audit interfaces, controlled handlers, recovery inspection | Implemented and integrated; experimental foundations; later phases supersede runtime limits |
| 4 | Native OpenAI/Anthropic tool calling, isolated sessions, bounded/cancellable HTTP, opt-in read-only integration | Implemented and integrated; experimental foundations; mocked HTTP validation |
| 5 | Podman cancellation/preflight/cleanup, bounded filesystem reads, opt-in real suite | Implemented and integrated; experimental foundations; local Podman history retained; remote validation deferred |
| 6 | Durable SQLite operation journal, transactional host approvals, stable identities, conservative reconciliation and real crash/concurrency tests | Implemented and integrated; experimental foundations; real local SQLite tests passed |
| 7 | Opt-in telemetry, bounded private sinks, traces/metrics, provider usage, deterministic evaluations and CLI reports | Implemented and integrated; experimental foundations; historical CI/evaluations retained |
| 8 | Read-only CLI, three-agent integration, explicit providers, authorized tools, optional persistence/diagnostics, offline E2E, standard CI and documented security | **Implemented — offline E2E validated; external validation gates deferred** |
| 9 | Private workspaces, controlled patches/approvals, bounded fixture repair and opt-in CLI | **Partial — L1/L2 local evidence; L3 real gate blocked** |

Phase 4 retains `complete()` and legacy scripted tool providers. The default CLI
and SDD remain fixture/text workflows. Read-only provider integration is through
an explicit host API, not automatic repository-selected configuration.

## Phase 4 acceptance

- Neutral and provider-native histories are separate; sessions are scoped to execution/task.
- Call IDs and whole result batches are checked against the session's actual history.
- Bounded requests, streamed bodies, output tokens, retained histories, turns and calls.
- Cancellation/close prevents new work and aborts HTTP without promising rollback.
- Fail closed on refusal, truncation, malformed/unknown calls, unsupported blocks and errors.
- Deterministic HTTP fixtures, dispatcher/file/Git integration, existing regressions pass.
- No privileged tools enabled, no live credentials in tests, no automatic retries/resume.

Live API compatibility and remote CI are separate acceptance evidence; they are
not established by local mocked-HTTP tests. See [verification](VERIFICATION.md).

## Phase 5 acceptance

Historical Phase 5 snapshot: that phase was merged and pushed to `main` at
`fdd5c3b`. Its real isolation gate
passed locally on a dedicated, disposable rootless Podman Machine. Effective
isolation, running cancellation, timeout and confirmed cleanup were exercised;
the VM was stopped afterward. A separate manual GitHub Actions workflow targets
a dedicated runner, but its runner and approved profile still require setup and
a passing run. The 0.6.0 migration removed the Docker backend; only
explicit Podman Machine profiles are supported. No privileged tools
were enabled. See [verification](VERIFICATION.md) and
[Phase 5 security](phase5-security.md).

## Phase 6 acceptance — historical source milestone

The 0.6.0 source snapshot included Phase 6 behind explicit host opt-in. It added a private local SQLite journal,
unique request/call identities, version-checked states, scoped transactional
approvals, session-bound execution and journaled conservative host recovery.
Real backend tests exercise process interruption/reopen, interprocess races,
transaction rollback, corruption, lock contention and capacity exhaustion.
No provider gains storage authority, no privileged handler is newly enabled and
no uncertain operation is automatically replayed. Original CLI/SDD regressions
remain required. See [design and runbook](phase6-durable-execution.md),
[security](phase6-security.md) and [verification](VERIFICATION.md).

Local test evidence for that historical phase is distinct from its per-commit hosted CI result and from
the dedicated remote isolation gate. At that snapshot manifests and CLI identified version
0.6.0. Phase 7 was subsequently implemented and integrated as 0.7.0. Phase 8
was subsequently implemented on its feature branch and integrated into `main`
as source version 0.8.0. Broader orchestration,
automatic workflow recovery, distributed fencing and production acceptance
require separate design and authorization.

No production-readiness or external exactly-once promise follows from these
experimental foundations. Phase 5 publication remains recorded at fdd5c3b;
Phase 7 was integrated at c390459; the former 0.7.0 snapshot at 6dcb0e7 is
historical. Phase 8's initial source snapshot is d9ecbf4; integrated closure baseline is
c87d22f (PR #3). Commit 959f20f is an earlier 0.5.0 historical reference, not the
current starting point.

## Runtime backend removal (0.6.0 migration)

Docker execution, context validation and the implicit backend were removed.
Legacy/mixed Docker options are rejected before process calls. Neutral executor
results remain; option types now require explicit Podman Machine configuration.
Historical phase reports record earlier Docker fixtures, not current support.
See [migration and security](phase5-security.md). Publication and remote CI remain
separate from local validation. No host Docker software is uninstalled.

## Phase 7 acceptance

Phase 7 adds neutral opt-in telemetry across orchestration, agents, providers and tools; bounded in-memory and rotating private JSONL sinks; trace/metrics reconstruction; host-supplied versioned rate estimates; offline deterministic evaluations and explicit CLI reports. Local clean, build, all tests, CLI help and deterministic suite passed. The standard GitHub Actions CI run 45035585620 passed for published commit c390459. The separate remote Podman isolation workflow was not shown as run by the verified workflow history. Benchmarks did not justify runtime optimization.

## Phase 9 readiness — design handoff only

> Historical Phase 8 handoff. Superseded for current Phase 9 status by the
> [implementation/gate matrix](phase9-autonomy-levels.md); the table below records
> questions that existed before this branch, not current absence of L1/L2.

**Not started — design pending.** This section identifies prerequisites and open
questions; it enables no writes, validation commands or container workloads.
The existing SDD implementation stage generates proposals, not source changes.

| Design topic | Dependency / decision still required |
|---|---|
| Isolated workspaces | Choose lifecycle/ownership for private copies or worktrees, trusted canonical roots, cleanup and concurrency locks; decide what is copied and how symlinks/hardlinks are handled. |
| Controlled writes | Define bounded, explicit host-authorized modification tools, allowed paths, permissions and outside-workspace denial. Existing create-only handlers are not a general patch engine. |
| Diff review and human approval | Bind approval to exact base revision, diff digest, affected paths, tool arguments and expiration; decide how changed bases invalidate approval and who authenticates the reviewer. |
| Container validation | Require the dedicated remote Podman gate and a new workload threat model before untrusted generated code; design fixed validation commands, mount/network/resource policy and cancellation/cleanup evidence without weakening current preflight. |
| Partial changes | Specify staging/atomicity where possible, what remains after interruption and how the human reviews partially applied changes; no blanket rollback promise. |
| Validation evidence | Bind tests, exit codes, reviewed artifacts, policy/version and workspace revision to the exact proposed change. Decide retention and secret handling for generated logs. |
| Conservative recovery | Reconcile checkpoints, journal state and actual workspace before any authorized continuation; never replay uncertain effects automatically. Define ownership/fencing and manual resolution for mismatches. |
| AI-generated code risks | Review prompt injection, dependency scripts, exfiltration, hostile build configuration, filesystem races and runtime/host compromise; model output never grants authority. |

Live OpenAI and Anthropic interoperability remains an external evidence gate;
fixture success cannot establish it. Formal design/spec approval, a revised
threat model and concrete acceptance tests must precede Phase 9 implementation.
No `0.9.0` bump, release, write tool exposure or execution capability is included
in this Phase 8 closure.

## Phase 9 implementation — partial, Gate C blocked

Based on fdcb1130e91a, the feature branch adds experimental local L1/L2, durable
exact patch approvals, private workspace lifecycle, sequential existing roles,
bounded fixture repair, separate implement CLI and offline evaluations. Keep 0.8.0.
No new phase is started. [Gate matrix](phase9-autonomy-levels.md),
[security](phase9-security.md), [sandbox blocking conditions](phase9-sandbox-validation.md)
and [E2E evidence](phase9-e2e.md) distinguish implementation from authorized real use.
No live model/real generated-code sandbox/remote CI gate is passed by these fixtures.
