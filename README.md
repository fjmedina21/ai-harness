# AI Harness

Local-first, provider-agnostic TypeScript harness for role-based software tasks.
The source on `main` is version 0.8.0 and integrates a bounded read-only
engineering review workflow into the CLI. This is an experimental source
milestone, not a formal release announcement. The hosted GitHub release API
has no release record for this commit; npm publication has not been verified.
The project is experimental and is **not a production-ready autonomous agent**.

Phase 8 status: **Implemented — offline E2E validated; external validation gates deferred**.
The integrated baseline is `c87d22f` (PR #3), with successful
[standard CI](https://github.com/fjmedina21/ai-harness/actions/runs/45095776893).
The final closure on `chore/phase8-final-closure` is local candidate evidence:
427 tests and 18 focused E2E tests passed; it has not been merged or run in CI.
Live providers are **Deferred — live provider interoperability validation**;
remote Podman is **Deferred — dedicated remote infrastructure validation**.
Neither gate blocks this offline read-only scope; both remain unvalidated.
Phase 9 is **Not started — design pending**; see the [handoff](docs/ROADMAP.md#phase-9-readiness--design-handoff-only).

## Quick start

Requirements: Node.js >=22 (CI uses Node 24), pnpm 12.21.0. Durable SQLite mode
requires Node 22.13+ or Node 24.

```sh
pnpm install
pnpm build
pnpm harness --help
pnpm harness init --path ./my-project
pnpm harness run --path ./my-project --request "Review the project"
pnpm harness run --workflow inspect --path ./my-project \
  --request "Review API validation" --provider fixture --fixture-file README.md
pnpm test
```

The existing default `run` command continues to use the fixture-backed SDD
proposal workflow. The explicit `--workflow inspect` command runs three
sequential roles (planner, code reviewer and validator), requires each to use a
bounded read-only file operation, and writes an internal execution checkpoint
under `.ai/state`. It does not write source files, run tests or claim that work
was implemented.

## What is implemented

| Area | Current behavior |
|---|---|
| Workflow | Sequential dependency-aware SDD proposals and a bounded read-only CLI inspection workflow |
| Providers | Fixture offline mode; explicitly selected OpenAI Responses and Anthropic Messages for inspection |
| Tools | Host-owned registry/dispatcher, schema validation, Default Deny and scoped approvals |
| Durable operations | Opt-in local SQLite journal, transactional one-use approvals and conservative host reconciliation |
| Isolation | Explicit rootless Podman Machine profile; Docker runtime execution was removed in 0.6.0 |
| Observability | Opt-in bounded telemetry, in-memory/private rotating JSONL sinks, traces and metrics |
| Evaluations | 19 deterministic host-fixture scenarios and 42 assertions; known scenarios only |

Real provider calls and tool calling are programmatic and opt-in through host
APIs and the explicit inspection CLI mode. No provider is selected from
repository configuration. Mandatory tests use fixtures or mocked HTTP and no
live credentials.
`createReadOnlyToolCallingAgent()` exposes `file.read` and, with a host-selected
executable, `git.status`; it registers no privileged handlers.

## CLI inspection workflow

```sh
pnpm harness init --path ./my-project
pnpm harness run --workflow inspect --path ./my-project \
  --request "Review API validation" --provider fixture --fixture-file README.md
pnpm harness status --path ./my-project --id EXECUTION_ID
```

The fixture provider makes no network calls and reads only the host-selected
`--fixture-file` (default `README.md`). Real providers require an explicit model,
confirmation, finite output-token budget and finite provider-request budget; for
example:

```sh
pnpm harness run --workflow inspect --path ./my-project \
  --request "Review API validation" --provider openai --model HOST_SELECTED_MODEL \
  --max-output-tokens 256 --max-provider-requests 6 --confirm-provider-call
```

Provide `OPENAI_API_KEY` through the host's secure environment/configuration
before running the command; do not put its value in shell history or project
configuration.

Anthropic uses `ANTHROPIC_API_KEY` and `--provider anthropic`. The CLI does not
print or persist credentials. The token limit bounds output tokens per provider
request and the request limit caps requests per execution; neither is an exact
dollar cap because input-token pricing and provider rates vary. A host can
provide a private tariff JSON with `--rates FILE`. To opt into durable operation
records, `--journal` must point to a file in an existing private `0700`
directory. `--telemetry-dir` has the same private-directory requirement. The
`status --journal FILE` option reports operation metadata without arguments or
results.

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

An optional live-provider smoke test is separate from `pnpm test` and requires
explicit host environment selection and confirmation. It uses a generated
synthetic fixture and has a strict output-token/request budget:

```sh
HARNESS_REAL_PROVIDER=openai \
HARNESS_REAL_PROVIDER_CONFIRM=YES \
HARNESS_REAL_MODEL=HOST_SELECTED_MODEL \
HARNESS_REAL_OUTPUT_TOKEN_BUDGET=128 \
HARNESS_REAL_REQUEST_BUDGET=6 \
pnpm smoke:real-provider
```

Set `HARNESS_REAL_PROVIDER=anthropic` for Anthropic. This command can incur
charges. An OpenAI smoke was attempted with `gpt-6-luna` but failed with HTTP
429 before reading the synthetic fixture; live-provider validation is not
achieved. See [verification](docs/VERIFICATION.md). The smoke command reads
credentials from the process environment; `.env.local` is not loaded
automatically. Its budget limits output tokens and request count; it does not
guarantee a dollar ceiling.

## Documentation

Dedicated remote Podman isolation setup and its pending acceptance gate are
documented in [DEDICATED-PODMAN-RUNNER.md](docs/DEDICATED-PODMAN-RUNNER.md).

- [Architecture](docs/ARCHITECTURE.md) — implemented foundations and target design
- [Repository map](docs/REPOSITORY.md) — implemented workspace packages
- [Roadmap](docs/ROADMAP.md) — status through implemented Phase 8
- [Verification](docs/VERIFICATION.md) — local evidence, hosted CI and isolation status
- [Versioning](docs/VERSIONING.md) — pre-1.0 policy
- [Phase 8 integration](docs/phase8-integration.md) · [security](docs/phase8-security.md) · [E2E](docs/phase8-e2e.md) · [release checklist](docs/RELEASE-CHECKLIST.md)
- [Phase 4 providers](docs/phase4-security.md) · [Phase 5 Podman](docs/phase5-security.md)
- [Phase 6 durable operations](docs/phase6-durable-execution.md) · [Phase 6 security](docs/phase6-security.md)
- [Phase 7 observability](docs/phase7-observability.md) · [evaluations](docs/phase7-evaluations.md) · [security](docs/phase7-security.md)
- [Phase 2 security history](docs/phase2-security.md) · [Phase 3 security history](docs/phase3-security.md)
