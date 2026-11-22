# AI Harness

Local-first, provider-agnostic TypeScript harness for role-based software tasks.
Version 0.7.0 contains experimental foundations through Phase 7; it is **not a
production-ready autonomous agent**.

## Quick start

Requirements: Node.js >=22 (CI uses Node 24), pnpm 12.21.0. Durable SQLite mode
requires Node 22.13+ or Node 24.

```sh
pnpm install
pnpm build
pnpm harness --help
pnpm harness init --path ./my-project
pnpm harness run --path ./my-project --request "Review the project"
pnpm test
```

The default CLI uses the fixture provider. It does not call paid model APIs or
automatically dispatch model-requested tools.

## What is implemented

| Area | Current behavior |
|---|---|
| Workflow | Sequential dependency-aware orchestration, five-stage SDD proposals and JSON checkpoints |
| Providers | Fixture by default; opt-in OpenAI Responses and Anthropic Messages adapters |
| Tools | Host-owned registry/dispatcher, schema validation, Default Deny and scoped approvals |
| Durable operations | Opt-in local SQLite journal, transactional one-use approvals and conservative host reconciliation |
| Isolation | Explicit rootless Podman Machine profile; Docker runtime execution was removed in 0.6.0 |
| Observability | Opt-in bounded telemetry, in-memory/private rotating JSONL sinks, traces and metrics |
| Evaluations | 19 deterministic host-fixture scenarios and 42 assertions; known scenarios only |

Real provider calls and tool calling are programmatic and opt-in through host
APIs. Mandatory tests use fixtures or mocked HTTP and no live credentials.
`createReadOnlyToolCallingAgent()` exposes `file.read` and, with a host-selected
executable, `git.status`; it registers no privileged handlers.

Durable approvals and telemetry are not enabled by the default CLI. Cancellation
does not roll back external effects. Uncertain operations require host inspection
and reconciliation; provider sessions are not durably resumed, and no external
exactly-once guarantee exists. Evaluation results characterize only the listed
fixtures. Cost estimates use host-supplied rates and are not invoices.

## Isolation and verification

The supported container backend is explicit Podman Machine with a private host
profile. `pnpm test:isolation` fails closed without an approved profile. Local
real Podman evidence and the state of the separate dedicated remote isolation
workflow are recorded in [verification](docs/VERIFICATION.md). Docker Hub image
references identify OCI image provenance; they do not indicate Docker runtime
support. See [Phase 5 security and migration](docs/phase5-security.md).

## Diagnostics and evaluations

```sh
pnpm harness trace --input ./private-telemetry.jsonl --id EXECUTION_ID
pnpm harness metrics --input ./private-telemetry.jsonl --id EXECUTION_ID
pnpm harness eval run --suite deterministic
pnpm harness eval report --input ./private-report.json
```

These commands are explicit and local. Telemetry is best-effort diagnostics and
cannot grant authority or modify journal state.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — long-term design; proposals are labeled
- [Repository map](docs/REPOSITORY.md) — implemented workspace packages
- [Roadmap](docs/ROADMAP.md) — status through Phase 7; Phase 8 pending
- [Verification](docs/VERIFICATION.md) — local evidence, hosted CI and isolation status
- [Versioning](docs/VERSIONING.md) — pre-1.0 policy
- [Phase 4 providers](docs/phase4-security.md) · [Phase 5 Podman](docs/phase5-security.md)
- [Phase 6 durable operations](docs/phase6-durable-execution.md) · [Phase 6 security](docs/phase6-security.md)
- [Phase 7 observability](docs/phase7-observability.md) · [evaluations](docs/phase7-evaluations.md) · [security](docs/phase7-security.md)
- [Phase 2 security history](docs/phase2-security.md) · [Phase 3 security history](docs/phase3-security.md)
