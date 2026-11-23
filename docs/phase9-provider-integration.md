# Phase 9A provider integration — OpenAI scope

Design recorded before implementation; OpenAI composition, CLI and offline E2E
are integrated in audited `main` at **9ce59e8b4b6b97757a3104aaed4684c91cbbeef5**.
Version remains 0.8.0. Current owner scope
is OpenAI only; Anthropic engineering is deferred, while existing inspection
support remains unchanged. Real L3 remains disabled.

The application adds a provider-neutral EngineeringAgentPort bridge around the
existing ModelProviderAdapter.complete(). OpenAI construction stays in a trusted
application factory; HTTP, native Responses protocol, safe classifications and
cancellation remain in providers. No second HTTP client or model-owned tool is
introduced. Each role receives a stateless request with stable host execution,
workspace, task and turn identity. No provider conversation is resumed or shared.

Only host-selected UTF-8 file contents and current hashes, bounded advisory
requirements/plan/review context and explicit relative-path policy enter a request.
No root paths, journal handles, approval callbacks, keys or .env contents enter
model prompts. Context, file/operation counts, output and retained result sizes
are bounded before calls. Sources and model text remain untrusted data.

Existing complete() exposes bounded text rather than a provider-native JSON
schema option. Therefore responses must be exactly one JSON object, parsed as
JSON without code-fence extraction or repair. Advisory roles return summary only;
implementation returns summary and the existing {baseRevision, changes} shape.
Change fields are unchanged: path, operation, baseHash, content, resultHash.
The model may leave resultHash null for text results; the host materializes that
hash deterministically. A supplied incorrect hash is rejected, never repaired.
All other base/path/operation/size/conflict checks remain in EngineeringPatchEngine.
No hash, JSON, planner or reviewer output can authorize application.

Workflow requests and agent turns are counted, actual reported input/output
usage is retained, unknown usage stops further work, and host rates produce
optional estimates. No monetary estimate is an invoice or enforceable billing
cap. Since a universal tokenizer/billing bound is unavailable, real CLI calls
require --allow-uncertain-cost in addition to explicit provider/model/confirmation
and finite request/output/context/total-token budgets. Host rates and estimated
spend ceilings add conservative reservations and post-call checks, not billing
certainty. Missing rates are represented as unknown, not zero.

L1 proposes and reviews without source/workspace writes. L2 uses the same real
proposal and existing exact durable independent approval; CLI remains pending
because it cannot authenticate/resume an independent approver. No L3, shell,
container, original-project write, deployment, Git integration or self-approval
surface is added. Raw errors and outputs are not telemetry. Failure never falls
back to fixture or another model and never automatically retries.

Acceptance: offline real-adapter protocol tests, actual filesystem/SQLite L1/L2
integration, real CLI subprocess tests with mocked HTTP, budget/error/cancellation
regressions, retained fixture/inspection behavior, full required checks, opt-in
synthetic live smoke, documentation and local commits only. Live evidence is
reported separately from mocked HTTP and does not establish L3 or production safety.

## CLI and host configuration

```sh
pnpm harness run --workflow implement --path /ABSOLUTE/PROJECT \
  --request "Add pagination to the users API" --provider openai \
  --model HOST_SELECTED_MODEL --autonomy propose --files src/users/service.ts \
  --max-provider-requests 6 --max-output-tokens 512 \
  --confirm-provider-call --allow-uncertain-cost --json
```

OPENAI_API_KEY must already be in the host environment. The CLI never reads .env
or .env.local automatically. A host can explicitly load its chosen file with
`node --env-file=.env apps/cli/dist/index.js ...`; never put key values in arguments.
No model is selected by default. Fixture options remain compatible, and fixture
mode rejects real-provider billing/model options. Anthropic implement selection
fails explicitly as deferred, without requests or fallback; inspect is unchanged.

Default source context is at most 16 selected files / 8192 content bytes. The
bridge also caps the whole serialized system+context request (default 16384 bytes)
and uses a conservative UTF-8 byte admission guard against the host context-token
allowance (default 8192, including an overhead reserve). This guard is not a model
specific tokenizer or proof of input-token billing bounds. Actual reported totals
are checked after each request and unknown/partial usage blocks further roles.
Cancellation may leave provider usage/billing unknown even though local work stops.

`--allowed-paths CSV` defaults to the selected files; it can authorize explicitly
named new files. `--operations CSV` defaults to create,replace; deletion requires
an explicit host operation selection. Both remain subject to the patch engine.
`--max-total-tokens` defaults to the request count times per-turn token allowance,
capped at 100000. `--max-agent-turns` can lower the request ceiling because each
role makes exactly one request. `--max-context-bytes`, `--max-context-tokens`,
`--timeout-ms` and `--sensitive` configure bounded host behavior. Global engineering timeout
is at most **120000 ms** in the restored code. Temporary local 160/600-second
profiles were used only for the specifically authorized evidence runs. Provider
default remains 30000 ms. No automatic retry, malformed-output repair or real L3
repair loop is enabled. Native tool calls/refusals are not treated as patches.

Host private tariffs use existing `--rates FILE` plus `--max-cost-usd N` (0..10,
USD only). Conservative reservations use the most expensive configured input/cache
rate and maximum output allowance. These are estimates under host assumptions,
not guaranteed provider bills; uncertain-cost opt-in remains required. With no
rates, cost is unknown and usage.estimatedCostUsd is null; it is never presented
as a zero-dollar real request. Checkpoints retain a known subtotal for compatibility,
not complete billing authority. Existing fixture cost behavior remains unchanged.

L1 returns model/provider, analyzed paths/hashes, structured proposals/digests,
validation outcome, final diff scope, advisory reviews, actual reported usage,
optional cost estimate, fixed diagnostics and final state. L2 additionally requires
`--autonomy isolated --authorize-workspace --workspace-dir PRIVATE_DIR --journal
PRIVATE_FILE --checkpoint-dir PRIVATE_DIR`; those directories must exist, be private
and outside the original project. CLI exits 2 with an exact durable pending approval.
It cannot approve or resume a previous session. Trusted host embedding supplies
requestApproval and a real authenticated DurableApprovalService/verifier separately.
No model receives those callbacks or journal ports. A reviewed proposal is never
labelled applied; isolated application is never labelled integration.

## Architecture and compatibility

- contracts adds optional normalized ModelResponse.tokenUsage and fixed
  EngineeringProviderError metadata without changing complete()'s signature.
- tools parses a bounded closed JSON envelope and materializes null result hashes;
  the existing engine independently validates every final patch.
- application provides ModelEngineeringAgent and createOpenAIEngineeringAgent;
  instances bind to one execution and close on every workflow outcome.
- OpenAI's text adapter now serializes max_output_tokens. Tests discovered that
  the previous text path accepted the option but omitted the wire field. Existing
  native tool calling already handled its own budget; Anthropic code is unchanged.
- application reports real cost as nullable and records usage even for rejected
  or incomplete outputs when the provider supplies it. Consumers must handle null.
- observability adds bounded context, budget and proposal-validation events plus
  a validated patch-digest attribute; payloads/keys/approval credentials are absent.
- CLI is composition only; no HTTP, patch language, auth or provider fallback is added.

## Verification and closure

Real-adapter mocked HTTP tests cover L1, real SQLite pending/approved L2, base/hash/
path/operation/schema/size/duplicate failures, refusals/native calls, session and
execution identity, budgets, usage gaps, incomplete/error responses, cancellation,
timeout, prompt injection and telemetry. Actual CLI subprocesses cover JSON/text,
configuration errors, original .env non-loading, scoped context, finite budgets,
exit codes and fixture compatibility. The opt-in smoke is separately tested with
mocked HTTP, including semantic acceptance beyond an HTTP success.

See [verification](VERIFICATION.md#phase-9a-openai-local-closure) for final counts
and [live evidence](phase9-live-smoke.md) for the narrower real API result. This
records the owner-approved OpenAI/offline integration scope. Standard CI for
9ce59e8b4b6b subsequently passed; see [the current audit](VERIFICATION.md#phase-9a-evidence-audit).
It does not close Anthropic engineering, full Phase 9, real L3 or production acceptance.
The audit branch restores the 120-second maximum after temporary live-run profiles
and retains boundary regressions, with 570/570 local tests at closure 5bb6317.
Hosted CI had not run for that pre-publication snapshot; subsequent CI must be
associated with its own SHA. No key write,
container workload, push, merge, release or version bump is included in this audit.

## Historical implementation delivery report — 2026-11-23

| Item | Result |
| --- | --- |
| Starting commit | 463b3255390eab90cdb06d6f07adb9a35e3575f8 |
| Development branch | feat/phase9-real-provider-engineering |
| Architecture | Generic role bridge → existing provider; strict host parser → existing patch engine/dispatcher; CLI only composes |
| Neutral contracts | Optional normalized ModelResponse.tokenUsage, fixed EngineeringProviderFailure/Error, scoped identity and nullable real-cost reporting |
| OpenAI integration | Existing Responses complete() reused; native max_output_tokens fixed; no duplicate HTTP implementation |
| Anthropic | Engineering deferred by owner; inspection/native adapters retained |
| CLI | implement provider openai, host model/scope, confirmation, finite budgets, explicit uncertain-cost policy; fixture behavior retained |
| Structured protocol | Strict JSON summary/proposal envelope; existing change fields/operations; null result hash materialized by host; incorrect supplied hashes rejected |
| L1 | Natural request to advisory plan, valid structured proposal/digest and reviewed diff; no source/workspace writes |
| L2 | Real proposal routed through existing exact SQLite independent approval; trusted host may apply in private copy; CLI stays pending |
| Security verification | Filesystem/SQLite and protocol/E2E tests; model has no keys/approval/store authority; no fallback, replay, host shell or L3 |
| Token/cost behavior | Requests/turns/context/output/total actual usage bounded; unknown usage stops; cost nullable, optional host tariffs/reservations, uncertainty explicit |
| Automated tests | 568/568 full tests; 69/69 focused; original eval 19/19 and phase9 eval 10/10 |
| Real-provider evidence at original closure | Direct smoke pass was recorded; full workflow had not run then. Later real attempts and long-profile pass are recorded below |
| Known limits | Same-UID TOCTOU, partial multi-file effects, no exact billing guarantee, no independent approval CLI/resume, no general semantic/model or production proof |
| Source files changed | application/engineering-provider.ts and engineering.ts; tools/engineering-model-output.ts; contracts; existing provider/transport/telemetry; CLI engineering command, smoke and tests; package script/exports |
| Docs updated | README, architecture, repository map, roadmap, verification, versioning, phase9 architecture/security/autonomy/E2E plus provider integration and live smoke |
| Integration commits | Implementation: 2cfc4a92aadcd16f6ae75b96e283a183b04f7113; documentation: 9ce59e8b4b6b97757a3104aaed4684c91cbbeef5; both are already in audited main |
| Historical Git / current audit | Earlier delivery was local; subsequent publication is confirmed by main and its exact-SHA CI. The audit closed locally at 5bb6317 on docs/phase9a-openai-live-validation; the owner subsequently authorized merge/push |
| Remaining before L3 | Approved digest-bound snapshot transport, dedicated current real Podman isolation/resource/cleanup E2E and separate operational authorization |

Implemented and offline-tested OpenAI integration is the closure scope. Prior
live-tested direct API evidence was deliberately narrower. Full-workflow execution
was pending authorization at that original closure; later authorized results are
recorded below. Anthropic is deferred; real L3 is blocked.
No statement here declares full Phase 9 complete or experimental software ready
for production. Version recommendation remains 0.8.0.

## Current live acceptance — evidence audit

The four-role synthetic workflow passed with OpenAI gpt-5.5-pro at
2026-11-23T16:07:36.021Z on **1c3755a494895d071937c8f12f9c1da6e8cf2fb0**:
four HTTP 200 responses, expected host-validated proposal, nonempty diff and completed
advisory review. Total elapsed **240770 ms**; reported usage **2132 input / 874 output**
with **598 reasoning included in output**. Source unchanged and cleanup confirmed;
patchApplied=false and executedGeneratedCode=false. Cost remains unknown without rates.

This pass used a temporary **600-second** profile. The **120-second maximum was
restored** afterward. Earlier real runs at 120 seconds and 160 seconds timed out;
the latter validated a proposal but did not complete review. Their cancelled
requests have unknown usage/cost, and their reported subtotals are incomplete.
A pass under the restored deadline is still pending. See the exact dates, commits,
HTTP observations, historical direct-smoke provenance and [live ledger](phase9-live-smoke.md).

The passing smoke invokes the exported application smoke function, not an actual
live interactive CLI subprocess. CLI subprocess E2E remains mocked HTTP evidence.
No general task correctness, production readiness, live L2 approved application or
L3 gate follows. L2 still requires an independent trusted approver; the CLI remains
pending approval. No model can promote proposed changes into the original project.
