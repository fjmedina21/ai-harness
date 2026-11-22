# AI Harness — implementation roadmap

This status follows the implemented code. Earlier broad architecture proposals
are targets, not evidence that those capabilities were delivered.

| Phase | Implemented scope | Status |
|---|---|---|
| 0 | Monorepo, configuration, project initialization, role declarations, CLI | Implemented; superseded by later phases |
| 1 | Sequential task orchestration, fixture/text providers, SDD, checkpoints | Implemented; experimental |
| 2 | Registry, Default Deny dispatcher, scoped approvals, restricted reads/subprocesses | Implemented; experimental |
| 3 | Tool-calling contracts/agent, container mock tests, audit interfaces, controlled handlers, recovery inspection | Implemented; experimental; runtime limitations superseded by later phases |
| 4 | Native OpenAI/Anthropic tool calling, isolated sessions, bounded/cancellable HTTP, opt-in read-only integration | Integrated; deterministic validation |
| 5 | Podman cancellation/preflight/cleanup, bounded filesystem reads, opt-in real suite | Integrated in `main` at `fdd5c3b`; local Podman gate passed; dedicated GitHub runner validation pending |
| 6 | Durable SQLite operation journal, transactional host approvals, stable identities, conservative reconciliation and real crash/concurrency tests | Included in 0.6.0; local durable tests passed |
| 7 | Opt-in telemetry, bounded private sinks, traces/metrics, provider usage, deterministic evaluations and CLI reports | Integrated on `main` at `c390459`; 401 local tests and 19 scenarios passed; hosted CI run 45035585620 passed |

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

Phase 5 was merged and pushed to `main` at `fdd5c3b`. Its real isolation gate
passed locally on a dedicated, disposable rootless Podman Machine. Effective
isolation, running cancellation, timeout and confirmed cleanup were exercised;
the VM was stopped afterward. A separate manual GitHub Actions workflow targets
a dedicated runner, but its runner and approved profile still require setup and
a passing run. Version 0.6.0 removes the Docker backend; only
explicit Podman Machine profiles are supported. No privileged tools
were enabled. See [verification](VERIFICATION.md) and
[Phase 5 security](phase5-security.md).

## Phase 6 acceptance and Phase 8 status

Phase 6 is included in version 0.6.0 behind explicit host opt-in. It adds a private local SQLite journal,
unique request/call identities, version-checked states, scoped transactional
approvals, session-bound execution and journaled conservative host recovery.
Real backend tests exercise process interruption/reopen, interprocess races,
transaction rollback, corruption, lock contention and capacity exhaustion.
No provider gains storage authority, no privileged handler is newly enabled and
no uncertain operation is automatically replayed. Original CLI/SDD regressions
remain required. See [design and runbook](phase6-durable-execution.md),
[security](phase6-security.md) and [verification](VERIFICATION.md).

Local test evidence is distinct from the per-commit hosted CI result and from
the dedicated remote isolation gate. All manifests and CLI identify version
0.6.0. Phase 7 has since been implemented and integrated as 0.7.0. Phase 8 remains proposed and was not started. Broader orchestration,
automatic workflow recovery, distributed fencing and production acceptance
require separate design and authorization.

No production-readiness or external exactly-once promise follows from these
experimental foundations. Phase 5 publication remains recorded at fdd5c3b;
Phase 7 is integrated at c390459. Commit 959f20f is an earlier 0.5.0 historical
reference, not the current starting point.

## Runtime backend removal (0.6.0 migration)

Docker execution, context validation and the implicit backend were removed.
Legacy/mixed Docker options are rejected before process calls. Neutral executor
results remain; option types now require explicit Podman Machine configuration.
Historical phase reports record earlier Docker fixtures, not current support.
See [migration and security](phase5-security.md). Publication and remote CI remain
separate from local validation. No host Docker software is uninstalled.

## Phase 7 acceptance

Phase 7 adds neutral opt-in telemetry across orchestration, agents, providers and tools; bounded in-memory and rotating private JSONL sinks; trace/metrics reconstruction; host-supplied versioned rate estimates; offline deterministic evaluations and explicit CLI reports. Local clean, build, all tests, CLI help and deterministic suite passed. The standard GitHub Actions CI run 45035585620 passed for published commit c390459. The separate remote Podman isolation workflow was not shown as run by the verified workflow history. Benchmarks did not justify runtime optimization.
