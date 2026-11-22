# AI Harness — implementation roadmap

This status follows the implemented code. Earlier broad architecture proposals
are targets, not evidence that those capabilities were delivered.

| Phase | Implemented scope | Status |
|---|---|---|
| 0 | Monorepo, configuration, project initialization, role declarations, CLI | Foundation |
| 1 | Sequential task orchestration, fixture/text providers, SDD, checkpoints | Experimental foundation |
| 2 | Registry, Default Deny dispatcher, scoped approvals, restricted reads/subprocesses | Experimental foundation |
| 3 | Tool-calling contracts/agent, container mock tests, audit interfaces, controlled handlers, recovery inspection | Experimental foundation |
| 4 | Native OpenAI/Anthropic tool calling, isolated sessions, bounded/cancellable HTTP, opt-in read-only integration | Implemented and locally validated with mocked HTTP |

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

## Proposed phases 5–8

Phases 5–8 remain proposed, without an approved implementation specification.
Execution isolation, transactional approvals/audit, recovery and broader
orchestration are unresolved areas, not commitments or new acceptance criteria
for Phase 4. Each expansion requires a separate specification and approval.

No production-readiness, distributed-runtime or exactly-once promise follows
from completion of experimental Phase 4. Git publication and CI require a
separate authorized publication workflow.
