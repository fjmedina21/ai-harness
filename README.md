# AI Harness

Local-first, provider-agnostic TypeScript software-engineering harness.
Version **0.8.0**, experimental; not production-ready autonomous execution.

**Single Developer + Single GitHub Identity + Explicit Project Authorization +
Human-Confirmed Personal L2 + Durable Podman Validation.**

Phase 9C adds **Language-Agnostic Validation Contracts + Provider-Agnostic Repair +
Finite Autonomous Repair**, with approval at each patch and sandbox action. Generic
contracts and synthetic adapters do not imply operational support for every toolchain.

GitHub App OAuth + PKCE verifies one numeric installation owner. The private host
registry independently authorizes multiple projects with their own canonical source
and private workspace trees, file/operation policies, tool capabilities, budgets
and validation profiles. Login never grants global filesystem or execution access.
No multiuser administration or operational Team approval remains.

Personal L2 requires exact diff review, typed `APPROVE` and fresh native macOS
authentication. The existing SQLite approval broker/dispatcher retain expiry, revocation,
single use, CAS and fenced cross-process continuation. Only the private workspace
is modified; continuation makes zero model calls. Historical grants are not rebound.

Sandbox execution requires another exact human approval and durable grant.
ValidationCoordinator reuses the rootless Podman runtime, closed snapshot transfer,
private evidence and the existing lease/fencing mechanism. Offline multiprocess
recovery and evidence inspection are implemented. **Gate C is LIVE VERIFIED only
for the registered gatec-synthetic project and exact local-podman fixed Node profiles.**
The actual CLI test passed with fresh native patch and sandbox confirmations.
All other/unaccepted scope retains validation_acceptance_pending. Acceptance is
private, domain-HMAC protected and tied to owner/project/code/runtime/evidence;
changes or expiry block it. Cancellation preserves Uncertain state for reconciliation.
Phase 9C adds finite repair foundations with fresh approval at each effect; its real
acceptance remains BLOCKED. No Phase 9D, production autonomy or release is included.
See [Phase 9C architecture](docs/phase9c-architecture.md) and
[repair acceptance](docs/phase9c-e2e.md).

Read [architecture](docs/ARCHITECTURE.md), [project policy](docs/project-authorization.md),
[Personal approval](docs/phase9-personal-mode.md), [manual configuration migration](docs/single-developer-migration.md),
[GitHub setup](docs/phase9-github-app-setup.md), [Podman](docs/phase9b-validation-runtime.md)
and [verification](docs/VERIFICATION.md). Private profiles are never migrated automatically.

## CI and isolation status

| Scope | Verified state |
| --- | --- |
| Ordinary remote CI | **VERIFIED** for `6148e9e`: [run 45708916081](https://github.com/fjmedina21/ai-harness/actions/runs/45708916081), build-test / Build / Test / CLI smoke passed |
| Local Gate C | **LIVE VERIFIED** for the documented gatec-synthetic/local-podman fixed Node scope; current execution still requires valid owner/session/policy and unexpired exact acceptance |
| Dedicated remote Podman isolation | **DEFERRED**; no registered repository runner or isolation workflow run observed at this closeout |

This single-developer local-first tool does not require new remote infrastructure
for its separately accepted local scope. Remote workloads still require their own
explicitly authorized dedicated setup and real acceptance. See
[verification](docs/VERIFICATION.md#ci-and-dedicated-remote-isolation) and
[remote prerequisites](docs/DEDICATED-PODMAN-RUNNER.md). The manual workflow remains
available without provisioning or dispatching it automatically.

## Phase 9A OpenAI engineering

```sh
pnpm harness run --workflow implement --path /ABSOLUTE/PROJECT \
  --request "Add pagination to the users API" --provider openai \
  --model HOST_SELECTED_MODEL --autonomy propose --files src/users/service.ts \
  --max-provider-requests 6 --max-output-tokens 512 \
  --confirm-provider-call --allow-uncertain-cost \
  --timeout-ms 360000 --request-timeout-ms 180000 --role-timeout-ms 180000 --json
```

Requires OPENAI_API_KEY in the host environment; no project .env is loaded
implicitly. L1 returns an actual structured proposal and reviewed diff without
writing files. L2 uses private copies and exact policy-bound durable approval;
CLI remains pending approval. Calls are bounded and cancellable, with actual
reported tokens and optional host-rate estimates. Unknown cost is null/unknown,
not zero; --allow-uncertain-cost explicitly acknowledges billing uncertainty.
No automatic fallback, retry, original-project write or generated-code execution.

The direct historical smoke, the 120s/160s timeouts and the temporary 600s pass
remain in the [evidence ledger](docs/phase9-live-smoke.md). The stabilized four-role
synthetic workflow passed with four HTTP 200s, valid expected patch/diff and
completed advisory review, using the explicitly selected 360s/180s/180s profile.
Source stayed unchanged and cleanup was confirmed. That proves neither arbitrary
task correctness nor real L2 approved application or L3. Version remains 0.8.0.

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
| Workflow | Existing SDD/inspection plus opt-in fixture/OpenAI engineering; GitHub-authenticated private L2 approval/resume |
| Developer identity | One GitHub owner, App OAuth + PKCE, online verification and macOS Keychain; actual local login and native workflow verified |
| Providers | Fixture offline mode; explicit OpenAI engineering/inspection; Anthropic Messages inspection retained |
| Tools | Host-owned registry/dispatcher, schema validation, Default Deny and scoped approvals |
| Durable operations | Opt-in local SQLite journal, transactional one-use approvals and conservative host reconciliation |
| Isolation | Explicit rootless Podman Machine profile; Docker runtime execution was removed in 0.6.0 |
| Sandbox validation | Durable snapshots, separate native action grants and scoped local-podman acceptance; actual CLI test passed; unaccepted scope blocked |
| Observability | Opt-in bounded telemetry, in-memory/private rotating JSONL sinks, traces and metrics |
| Evaluations | Existing deterministic suite plus independent phase9 offline filesystem/SQLite/repair scenarios; known fixtures only |

Real provider calls and tool calling are programmatic and opt-in through host
APIs and explicit inspection/OpenAI engineering CLI modes. No provider is selected from
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
pnpm harness eval run --suite phase9
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
charges. The historical Phase 8 inspection smoke with `gpt-6-luna` failed with
HTTP 429 before reading the synthetic fixture; that inspection workflow was not
live-validated. Its evidence is separate from Phase 9A direct and full-workflow
engineering smokes. See [verification](docs/VERIFICATION.md). The smoke command reads
credentials from the process environment; `.env.local` is not loaded
automatically. Its budget limits output tokens and request count; it does not
guarantee a dollar ceiling.

## Documentation

Dedicated remote Podman isolation setup and its explicitly **DEFERRED** acceptance gate are
documented in [DEDICATED-PODMAN-RUNNER.md](docs/DEDICATED-PODMAN-RUNNER.md).

- [Architecture](docs/ARCHITECTURE.md) — implemented foundations and target design
- [Repository map](docs/REPOSITORY.md) — implemented workspace packages
- [Roadmap](docs/ROADMAP.md) — status through partial Phase 9
- [Verification](docs/VERIFICATION.md) — local evidence, hosted CI and isolation status
- [GitHub authentication](docs/phase9-github-authentication.md) · [App setup](docs/phase9-github-app-setup.md) · [Operational L2](docs/phase9-operational-l2.md)
- [Phase 9B runtime](docs/phase9b-validation-runtime.md) · [snapshot transfer](docs/phase9b-snapshot-transfer.md) · [security](docs/phase9b-security.md) · [acceptance](docs/phase9b-e2e.md)
- [Versioning](docs/VERSIONING.md) — pre-1.0 policy
- [Phase 8 integration](docs/phase8-integration.md) · [security](docs/phase8-security.md) · [E2E](docs/phase8-e2e.md) · [release checklist](docs/RELEASE-CHECKLIST.md)
- [Phase 4 providers](docs/phase4-security.md) · [Phase 5 Podman](docs/phase5-security.md)
- [Phase 6 durable operations](docs/phase6-durable-execution.md) · [Phase 6 security](docs/phase6-security.md)
- [Phase 7 observability](docs/phase7-observability.md) · [evaluations](docs/phase7-evaluations.md) · [security](docs/phase7-security.md)
- [Phase 2 security history](docs/phase2-security.md) · [Phase 3 security history](docs/phase3-security.md)
