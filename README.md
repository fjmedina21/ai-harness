# AI Harness

Local-first, provider-agnostic TypeScript harness for role-based software tasks.
Phases 1–6 are **experimental foundations**, not production-ready autonomous execution.

## Requirements and verification

- Node.js >= 22 (development and CI: Node 24); durable opt-in needs Node 22.13+.
- pnpm **12.21.0**, pinned in `package.json`.

```bash
pnpm install
pnpm build
pnpm test
pnpm harness --help
```

## Implemented

- Versioned project configuration, safe initialization, 15 agent roles.
- Sequential dependency-aware orchestration, five-stage SDD proposals, JSON checkpoints.
- Default Deny tool dispatch, argument validation and scoped in-memory approvals.
- Bounded tool-calling agent, conservative recovery inspection and restricted handlers.
- OpenAI Responses and Anthropic Messages tool-calling adapters with isolated,
  explicitly closed sessions, native ID correlation and bounded HTTP transport.
- Explicit host API `createReadOnlyToolCallingAgent()` exposing `file.read` and,
  only with a host-selected executable, `git.status`.

The default CLI `run` continues to use the fixture provider and text-only SDD;
it does not automatically execute model tools. Real-provider tool calling is
programmatic and opt-in. See [Phase 4 usage and security](docs/phase4-security.md).
No privileged handlers are registered by the read-only factory.

## Package layout

`packages/contracts`, `config`, `core`, `orchestrator`, `providers`, `agents`,
`sdd`, `security`, `checkpointing`, `tools`; executable commands in `apps/cli`.
TypeScript strict / NodeNext ESM, project references and `node:test`.

## Phase 5 — execution isolation

Phase 5 was merged and pushed to `main` as `fdd5c3b`. It adds host cancellation,
runtime preflight, owned-resource cleanup and incremental file reads. The real
isolation suite **passed on a dedicated rootless Podman Machine**, including
effective limits, running cancellation, timeout and confirmed cleanup. The
default CLI/SDD stays unchanged. `pnpm test:isolation` fails closed without an
explicit private host profile. No runtime installation is automatic.

The regular GitHub Actions workflow runs build and deterministic tests. A
separate manual workflow targets a dedicated isolation runner; it is not evidence
until that runner and its approved profile are configured and the job passes.
Live Docker isolation remains unverified. See [verification](docs/VERIFICATION.md)
and [Phase 5 security](docs/phase5-security.md).

## Phase 6 — durable execution (local, unpublished)

Optional SQLite journal with stable operation/request/call identities, validated
state transitions, transactional single-use approvals and versioned host
reconciliation. Approval consumption and Prepared commit together; Running is
durable before a handler begins. Reopening never reuses a previous store-session
grant or preparation. No automatic replay/resume is introduced.

The host opts in through ToolDispatcher, the read-only factory or Orchestrator.
The default CLI/SDD remain unchanged; no privileged tools are enabled.
Actual SQLite tests cover interprocess races, abrupt SIGKILL/reopen, rollback,
corruption, lock failures and SQLITE_FULL. Local verification is distinct from
remote CI, which is pending publication.
See [architecture, schema and recovery runbook](docs/phase6-durable-execution.md),
[security](docs/phase6-security.md) and [verification](docs/VERIFICATION.md).

## Current limits

No automatic resume, durable exactly-once execution, arbitrary shell, Git-writing
or deployment integration. Filesystem guards have TOCTOU limitations; approvals
remain in-memory on the legacy path; durable mode needs a trusted private local
SQLite store and host identity verifier. Live Docker isolation remains unverified. Tool outputs
and model content remain untrusted. Unit tests do not establish production safety.

[Roadmap](docs/ROADMAP.md) · [Verification](docs/VERIFICATION.md) ·
[Phase 2 security](docs/phase2-security.md) · [Phase 3 security](docs/phase3-security.md) ·
[Continuation contract](docs/phase4-security.md#continuation-contract) ·
[Versioning policy](docs/VERSIONING.md)
