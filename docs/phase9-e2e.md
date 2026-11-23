# Phase 9 verification and delivery report

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
