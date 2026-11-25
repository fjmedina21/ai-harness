# AI Harness

Local-first, provider-agnostic TypeScript harness for role-based software tasks.
Version **0.8.0**, experimental; **not production-ready autonomy**. Current work
starts at `6dbdc98797d3` on `feat/phase9-personal-approval-mode`.

## Phase 9A.4 — Personal Mode and Team Mode

Team remains the default: requester and approver must be different stable GitHub
identities. An explicit, strictly validated host policy can select Personal Mode
and explicitly assign all four scoped roles to one account. Personal approval
requires exact diff review, typed `APPROVE` in an interactive terminal and fresh
macOS device-owner authentication. A session, pipeline, model response or
`continue` command cannot approve. The existing durable services record the exact
decision and retain expiry, single use, CAS and fenced continuation.

Sandbox execution needs a second, independently scoped approval. Its CLI remains
blocked pending Gate C. SQLite v3 migrates existing records conservatively; old
approvals remain Team approvals. An owner-confirmed native Personal approval and
single-account L2 fixture passed locally; automated tests use mocked verifiers.
Team's real two-account acceptance remains pending. See
[Personal Mode, configuration and migration](docs/phase9-personal-mode.md).

## Phase 9A.3 and Phase 9B — current boundary

Isolated requests now preserve exact proposals and diffs in private host-authenticated
artifacts with SQLite bindings. An embedding host can independently approve and
resume the exact patch across processes through the existing dispatcher, with CAS
leases, monotonic fencing and complete source/workspace/policy revalidation.
Continuation makes **zero provider calls**, executes no generated code and changes
only the private workspace. Completed/uncertain effects are never automatically replayed.

GitHub App Authorization Code + PKCE S256 now supplies developer identity to the
durable lifecycle. The CLI verifies app-bound user tokens online, stores sessions
in macOS Keychain and enforces explicit numeric-account/resource role assignments.
`auth login|whoami|status|refresh|logout` and authenticated
`engineering status|diff|approve|reject|revoke|continue --id ID` are implemented.
New isolated requests require `harness:requester`; Team approval requires a second
authorized stable GitHub identity. Tokens/credentials are never accepted
in arguments. See [GitHub App setup](docs/phase9-github-app-setup.md),
[authentication](docs/phase9-github-authentication.md) and
[Operational L2](docs/phase9-operational-l2.md).

**Operational L2 Personal: verified for the tested synthetic local scope.** Actual
GitHub login, Keychain-backed recovery, refresh and logout were observed with owner
authorization. Team's real two-account approval remains pending. Mocked GitHub
HTTP, real SQLite/filesystem and independent processes do not replace an explicitly
authorized actual GitHub/native Keychain smoke. Linux/Windows native credential
adapters are not supplied and fail closed. No legacy requester identity migration
or implicit approval is introduced. Personal Mode is an explicit host policy.

Phase 9B adds closed snapshot transfer by bounded stdin, a host action registry,
separate durable action approval, Podman-only runtime and private bounded evidence.
The first profile retains network denial, rootless execution, no host mounts and
the existing 10-second/resource limits; it supports restricted Node actions, not
general dependency builds. Both authorized fixed local Podman suites passed;
durable authenticated coordinator acceptance remains pending. **Full Podman acceptance is pending; the validation CLI
remains blocked.** See [runtime](docs/phase9b-validation-runtime.md),
[snapshot transfer](docs/phase9b-snapshot-transfer.md) and
[verification](docs/VERIFICATION.md#phase-9a3-and-phase-9b). Phase 9C autonomous repair,
Phase 9D portal, Anthropic engineering and publication remain deferred.

The preceding stabilization milestone has 592 local tests and a separately authorized
synthetic OpenAI run in 262.44s under a 360s/180s/180s host profile. That historical
live result does not validate these new continuation changes or the default 120s
slow-model profile. No live provider calls are part of this work. Deadline defaults
remain 120s global / 30s HTTP, with explicit finite host ceilings of 900s/300s.
See [time/budget policy](docs/phase9a-timeout-budget-policy.md).

## Phase 9 opt-in engineering

The original `run --workflow implement` fixture recipe remains available:
`--autonomy propose` reads host-selected files and returns structured patches;
`--autonomy isolated` creates a private external copy and pauses for scoped human
SQLite approval (independent accounts by default). A trusted host API can apply approved changes and exercise the
bounded repair loop with fixture validation. The original project stays unchanged.
OpenAI engineering is integrated in the audited `main` and offline E2E tested.
Anthropic engineering is deferred; sandbox validation components are implemented
behind the unpassed real acceptance gate. Existing inspection provider support is unchanged.
No arbitrary request implementation or production autonomy is established by fixtures.
See [CLI examples](docs/phase9-e2e.md), [design](docs/phase9-architecture.md) and
[security](docs/phase9-security.md). Version remains **0.8.0**.

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
| Developer identity | GitHub App OAuth + PKCE, online account verification, macOS Keychain and scoped host RBAC; live smoke pending |
| Providers | Fixture offline mode; explicit OpenAI engineering/inspection; Anthropic Messages inspection retained |
| Tools | Host-owned registry/dispatcher, schema validation, Default Deny and scoped approvals |
| Durable operations | Opt-in local SQLite journal, transactional one-use approvals and conservative host reconciliation |
| Isolation | Explicit rootless Podman Machine profile; Docker runtime execution was removed in 0.6.0 |
| Sandbox validation | Bounded snapshot transfer, restricted host Node profiles, separate action approval and private evidence; real fixed suites passed, full gate pending, CLI disabled |
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

Dedicated remote Podman isolation setup and its pending acceptance gate are
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
