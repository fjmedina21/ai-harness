# Phase 9 verification and delivery report

## Phase 9A.3 and Phase 9B — current evidence

Starting commit `fff4932f13f0`; development branch
`feat/phase9-github-auth-podman-validation`; version **0.8.0**. The baseline build
and **647/647** tests passed. Current final command results are in
[verification](VERIFICATION.md#phase-9a3-and-phase-9b).

GitHub tests exercise authorization URL/PKCE, state/path/Host checking, one-use
callback/timeout/cancellation/concurrent login, sanitized token errors, missing/
expired/revoked/wrong identity, secure-storage port behavior and current scoped
roles. Actual CLI worker processes compose the real OAuth client with mocked
GitHub app/user responses, real SQLite/private artifacts and exact continuation.
They check stable-account self-approval rejection, independent approval, wrong
scope/role/account, denial/revocation/replay, original unchanged and zero provider
calls during resume. Provider-generation HTTP is mocked; no paid call is made.

Phase 9B tests cover closed manifest/bytes, canonical path/link/digest checks,
profile selection, separate dispatcher approval, changed workspace, replay,
claims, bounded output and conservative cleanup/evidence. Podman calls are mocked.
This is offline composition evidence only: real GitHub/native Keychain and real
Podman workloads have **not run**. The validation CLI remains gated. No skipped
opt-in run is a pass; Phase 9C autonomous repair is not implemented.

```sh
pnpm harness auth login
pnpm harness auth whoami
pnpm harness engineering diff --id EXECUTION_ID
pnpm harness engineering approve --id EXECUTION_ID
pnpm harness engineering continue --id EXECUTION_ID
```

These are owner-operated live commands after [App registration](phase9-github-app-setup.md),
not commands executed by offline tests. Approval needs a second authorized stable
GitHub identity. Follow [Operational L2](phase9-operational-l2.md) for prerequisites,
TTL and exact private host policy. Real smokes require separate authorization:

```sh
pnpm smoke:github-auth --authorize-live-github-oauth
HARNESS_AUTHORIZE_PHASE9B_SMOKE=1 HARNESS_ISOLATION_PROFILE=/PRIVATE/approved-profile.json \
  pnpm test:phase9b-podman
```

The flags are explicit owner consent for those integrations, not identity or
approval credentials. Do not run these in ordinary CI. The Podman test does not
bootstrap a Machine; its profile must already be reviewed. See the
[real acceptance procedure](phase9b-e2e.md). Historical sections below concern
their named earlier phases and do not supersede the current implementation.

## Phase 9A.2 — cross-process durable L2 evidence

Starting commit `2746500e6787`; development branch feat/phase9-l2-durable-approval-resume;
version 0.8.0. New application tests use an actual private temporary source,
workspace, HMAC artifact store and SQLite journal. Process A invokes the existing
OpenAI adapter against mocked native HTTP (four calls), persists the validated exact
patch/diff and exits. Process B independently verifies fixture approval. Process C
reopens the journal/artifact, acquires a fenced lease and applies through dispatcher
with **zero provider calls**. The original selected files and unselected secret fixture
remain unchanged. No generated project code is imported or executed.

Other real-process cases race approvers/continuers, keep an obsolete owner alive,
SIGKILL after artifact publication/before SQLite commit and at Prepared/Running/
after-effect boundaries, then verify blocked replay. Core tests cover artifact modes,
MAC/digest/incomplete/missing/corrupt data, changed policy/source/workspace/receipt/root,
identity signature/audience/expiry/role/scope, self-approval, denial/revocation/expiry,
lease expiry/fencing, partial effects, ambiguous commit acknowledgments, cancellation,
timeout, key loss, SQLite migration/corruption and metadata-only telemetry. Existing
journal tests additionally cover transaction rollback, locked/full SQLite and physical
corruption. CLI tests verify authentication-required gates and credential-argv rejection.

This is Core L2 evidence using deterministic fixture authentication, not Operational
L2 acceptance or deployed IdP/IPC validation. No paid calls, generated-code execution,
Podman, L3 or source integration runs here. [Current command results](VERIFICATION.md#phase-9a2-durable-l2-resume)
and the [implemented protocol](phase9-l2-approval-resume-design.md) describe limits.
Earlier entries below retain historical Phase 9 evidence.


Date: 2026-11-23. Starting commit:
`fdcb1130e91ac37212e41253103b7b01f6415040`.
Branch: `feat/phase9-autonomous-engineering-runtime`.
Baseline build and full suite: **427/427** passed. Current final checks are
recorded in [verification](VERIFICATION.md#phase-9-local-verification).

## Verification categories

| Category | Scope |
| --- | --- |
| Mock/fixture validation | Real coordinator with trusted fixture proposal/validation ports; no synthetic-project code execution |
| Real filesystem | Private temporary projects/workspaces, reads, hashes, writes, links, locks, conflicts, cleanup and original unchanged assertions |
| Real SQLite | Operation registration, independent one-use approvals, expiry/mismatch, reopen and durable uncertainty |
| Real process crash | Trusted test worker exits 86 after patch effects but before journal confirmation; stale lock and Running persist; no replay |
| Real Podman | NOT RUN; stopped Machine only inspected; no current effective security or snapshot transport evidence |
| Real provider | NOT RUN; no credentials/API calls used; engineering adapter port is unverified with live models |
| Hosted CI | NOT RUN for this branch; previous Phase 8 CI is historical, not evidence for this change |

Focused suites cover schema/path/size/hash validation, source unchanged, private
ownership, source/workspace symlinks and hardlinks, executable rejection, concurrent
execution IDs and mutation locks, approval scope/expiry/self-approval/replay,
create/replace/delete, empty/no-final-newline diffs, changed snapshots, cancellation,
partial effects, process crash/reopen, recovery and safe cleanup. Application/CLI
cases cover bounded budgets/timeouts, correction success/failure, repeated errors
and snapshots, regression, unknown usage, incorrect/uncertain evidence, final human
review, role selection, terminal sanitization and telemetry redaction. Resource
exhaustion tests reject weaker descriptions; they do not exercise real cgroups.

Run focused suites after building:

```sh
node --test packages/tools/dist/__tests__/engineering*.test.js \
  packages/application/dist/__tests__/engineering.test.js \
  apps/cli/dist/__tests__/phase9-cli.test.js \
  packages/evaluations/dist/__tests__/phase9.test.js
pnpm harness eval run --suite phase9
```

## Deterministic CLI usage

On a synthetic directory containing a regular text `value.ts`:

```sh
pnpm harness run --workflow implement --path /ABSOLUTE/SYNTHETIC/PROJECT \
  --request "Fixture replacement for review" --provider fixture --autonomy propose \
  --files value.ts --fixture-file value.ts --fixture-content "fixture replacement" --json
```

This is an explicit host-authored fixture recipe, not a model interpreting the
request. It writes no project/workspace/journal/checkpoint. Isolated mode additionally
requires existing external private directories, --authorize-workspace,
--workspace-dir, --journal and --checkpoint-dir. It creates the copy and exits **2**
with pending approval. The CLI cannot approve or resume that operation; a trusted
embedding must supply approval decisions in its live session, using a real verifier
for production identities. New invocations never reuse old authorizations.
Exit codes also include 0 proposal/delivery success, 1 failure, 124 timeout and
130 pre-effect cancellation. Uncertain effects remain review-blocked.

## Delivery review checklist and final report fields

| Requested report item | Result |
| --- | --- |
| Starting commit / branch | fdcb1130e91a / feat/phase9-autonomous-engineering-runtime |
| Final architecture | Contracts → tools/checkpointing/orchestrator → application → CLI; evaluations compose application |
| New modules | Engineering workspace, patch engine/tools, validation registry/blocked Podman port, recovery/cleanup, checkpoint store, task plan, runtime/fixture and CLI |
| Contracts | Autonomy levels, engineering states, policy/budgets, changes/patches, receipt/snapshot, validation evidence, checkpoints and L4 supervision |
| Available tools | workspace.inspect/list/read, patch.propose/validate/apply, diff.inspect; mutation approval required |
| Implemented vs validated levels | See independent [L0–L3 matrix](phase9-autonomy-levels.md); L3 unavailable |
| Security | Default Deny, scoped exact approvals, private copies, no source mutation or host-generated-code execution, no arbitrary shell/privilege expansion |
| Tests / E2E | Deterministic fixtures plus real local filesystem/SQLite; final counts in VERIFICATION |
| Real tests pending / Podman | Snapshot transfer unimplemented; existing Machine stopped; no current real runtime test, live provider or hosted CI |
| Modification approval | Exact transactional independent approval required for each patch; no agent decision API |
| Repair behavior | Finite calls/tokens/estimated spend/time/files/bytes/iterations; repeated-error/snapshot and regression stop; uncertain effects stop |
| Residual risks | Same-UID TOCTOU, non-atomic multi-file changes, power-loss ordering, trusted host callbacks/IdP, secret detection limits, missing real isolation/model evidence |
| Documents | Architecture, security, workspaces, patch engine, sandbox, autonomy levels and E2E, plus README and core project docs |
| Version | Keep 0.8.0; reassess 0.9.0 only after coherent real-gate acceptance; no release |
| Local commits / final Git | Implementation: 0aca4039abf2837b9ae68533b2ae196102bc6091; documentation committed with this report. Delivery verifies the active feature branch and clean tracked working tree; no push, merge, release or private/generated files included |
| Next steps | Approve/implement concrete snapshot transport, verify dedicated local profile, authorize real synthetic workloads, run Gate C, wire/validate live engineering provider adapters separately |

Phase 9 remains partial and experimental. The pending operational gate is explicit;
fixtures cannot substitute for real isolation or model evidence.

## Phase 9A OpenAI closure evidence

The new application suite engineering-provider.test.ts exercises actual
OpenAIProvider Responses requests with mocked HTTP, then the real patch engine,
private filesystems and SQLite approval boundaries. The CLI suite
openai-engineering-cli.test.ts spawns the compiled CLI with a trusted test-only
fetch preload; it does not expose a production mock/fallback flag. It verifies
JSON/text, required configuration, no implicit .env loading, errors/usage/limits,
L1 read-only behavior, L2 pending approval, timeout/cancellation exit codes and
fixture compatibility. The separate full-workflow smoke is also exercised as an
actual process with mocked HTTP and strict semantic/cleanup acceptance.

Required commands are recorded in [verification](VERIFICATION.md#phase-9a-openai-local-closure).
Run the new suites independently after build:

```sh
node --test packages/application/dist/__tests__/engineering-provider.test.js \
  apps/cli/dist/__tests__/openai-engineering-cli.test.js \
  packages/providers/dist/__tests__/transport.test.js
```

The prior real direct-provider smoke is recorded separately in
[phase9-live-smoke.md](phase9-live-smoke.md). It is not attributed to the new CLI,
the changed budget/deadline controls, hosted CI or real Podman. No additional paid
call, key persistence, generated-code execution, original-project modification,
merge or push is part of this closure. Anthropic engineering is deferred and L3
continues blocked. Version remains 0.8.0; local commits follow successful validation.
