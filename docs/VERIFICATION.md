# Verification

## Candidate hosted verification — 2026-11-27

[Hosted CI](https://github.com/fjmedina21/ai-harness/actions/runs/46105350756) passed **build-test** and **docs-check**
on exact candidate `f98eded1a4977c95eedd28459a2bf1f4af6e1132`. Local regression,
scoped live acceptance, sampled visual review and executable digest continuity are
recorded in [candidate verification](phase9c1-release-candidate.md).
The owner explicitly authorized version **0.9.0-beta.1**, this branch push and CI.
Only final owner approval for tag/release remains outstanding after successful CI
on the final documentation-record commit. That exact final check must be verified
on GitHub; no earlier SHA substitutes for it. No merge, tag, release or deployment
was performed. Earlier assessment sections below retain their historical status.


## Subsequent candidate preparation — 2026-11-27

The owner requested completion of the remaining checklist. The sampled real-browser
tablet/desktop visual gate now **PASSES**, with full-size captures, search/theme/menu
and code-copy checks. Local candidate manifests and CLI are aligned to
**0.9.0-beta.1**, unreleased. See [candidate verification](phase9c1-release-candidate.md).
Earlier 0.8.0/status observations below remain historical. Exact candidate hosted CI
and final owner publication approval remain pending.


## Phase 9C.1 current assessment — 2026-11-27

Source `779daab899c2ef9875dc198785ad7b33489763e9`, version **0.8.0**.
**Phase 9C LIVE VERIFIED** for a newly authorized local synthetic project/journal,
current Gate C, real OpenAI repair, nine native confirmations and actual failed →
passed Podman validation. Independent inspection verified durable evidence and
unchanged originals. The obsolete synthetic journal was subsequently archived and
[excluded from release scope](phase9c1-historical-journal-exclusion.md) after verified
inactivity and explicit owner instruction. **Beta remains BLOCKED** for new candidate
hosted CI and the remaining checklist items. See the
[current acceptance and gate decision](phase9c1-live-acceptance.md).
Earlier source/branch/status records below are historical snapshots.


## Phase 9C.1 final regression — 2026-11-27

Executed after the live run on unchanged product source `779daab` plus the local
acceptance/documentation edits. Node **v24.18.0**, pnpm **12.21.0**, macOS **27.0.1
arm64**. All 16 final commands exited 0; measured command time **103.958 seconds**.

| Final check | Result |
| --- | --- |
| clean / build | PASS |
| full tests | 993/993 |
| GitHub / Personal / Phase 9B / Phase 9C | 150/150; 43/43; 76/76; 120/120 |
| docs:build / docs:check | PASS |
| CLI help / version | PASS; 0.8.0 |
| deterministic / Phase 9 evaluations | 19/19 with 42 assertions; 10/10 |
| engineering benchmark | PASS; mocked transport, actual FS/SQLite |
| diff whitespace / Git status inspection | PASS; local documentation changes only |

Frozen-lockfile install passed in the baseline. The complete final suite took
**40.872 seconds**. Private logs and per-command timings remain excluded under
`harness-development/phase9c1/final/`. No further provider call or Podman workload
was used for these regressions. Hosted CI passed on source 779daab; it does not
certify the new uncommitted documentation candidate. Scope, live proof and blockers
are summarized in [current acceptance](phase9c1-live-acceptance.md).

## Phase 9D current documentation update

Version remains **0.8.0**. A static VitePress portal, local search, original diagrams,
offline checks, documentation CI and manual Pages deployment workflow are implemented.
See [portal architecture](phase9d-architecture.md), [content plan](phase9d-documentation-plan.md),
[candidate verification](phase9d-verification.md) and [beta readiness](phase9d-release-readiness.md).
The runtime baseline is `def9a98`; older baseline/branch/CI statements below are historical.
Real Phase 9C repair E2E remains **BLOCKED**; later isolation-only probes do not accept it.
Current runtime acceptance must revalidate exact code/project/profile; historical Gate C is not global support.
No version bump, push, merge, tag, deployment or release is included.


## Phase 9C — historical implementation verification

Version **0.8.0**, branch `feat/phase9c-language-agnostic-repair`, based on
`0ac0bd486134a3a5924bea8c4cad8086b7a7e642`. Phase 9C is **IMPLEMENTED** and
**OFFLINE VERIFIED**. The real Phase 9C repair lifecycle remains **BLOCKED** pending
explicit authorization; production use is not certified. Phase 9D is not started.

| Local command | Observed result |
| --- | --- |
| `pnpm clean` / `pnpm build` | Pass |
| `pnpm test` | **993/993** |
| `pnpm test:github-auth` | **150/150** |
| `pnpm test:personal-approval` | **43/43** |
| `pnpm test:phase9b` | **76/76** |
| `pnpm test:phase9c` | **120/120** |
| `pnpm harness --help` / `pnpm harness version` | Pass; **0.8.0** experimental |
| Existing deterministic and Phase 9 evaluations | Pass |
| `git diff --check` | Pass |

The Phase 9C suite includes bounded static discovery, trusted profiles and normalized
diagnostics, SQLite migration/integrity/CAS, finite repair, no-progress, independent
approval and sandbox gates, process recovery, provider/profile independence and
functional CLI tests. Real temporary files, SQLite, artifact stores and separate
processes are used. Providers, identity/presence verifiers and Podman are simulated.
No real credential, paid provider call, generated-code execution on macOS or live
repair acceptance was used. See [the acceptance report](phase9c-e2e.md).

Local evidence is excluded under `harness-development/phase9c/verification.json`
and `harness-development/phase9c/source-verification.json`; the latter binds the
frozen product sources to the final verification pass. Do not publish private
profiles, journals, keys, credentials, source/diffs or acceptance records.

Baseline hosted CI was verified for `0ac0bd4`: [run 45714289248](https://github.com/fjmedina21/ai-harness/actions/runs/45714289248).
It does not certify this unpushed working branch. No push, merge, tag, release or
new remote CI run is claimed. Dedicated remote Podman remains **DEFERRED**.

The existing Gate C controls and historical scoped Node evidence are preserved.
Changed critical code or policy intentionally invalidates an older signed private
acceptance; prior Gate C success does not authorize this new repair lifecycle,
project/profile, model expense or executable action.

## Historical published baseline before Phase 9C

The sections below retain the previous published snapshot and its original test
counts/live evidence. They are historical records, not current branch verification.

Version **0.8.0**. Implementation `0e0d9cd`, base `df501d8`; integrated and published
on main at `6148e9e`. The original feature branch has been removed locally.
Current architecture: Single Developer + Single GitHub Identity + Explicit Project
Authorization + Human-Confirmed Personal L2 + Durable Podman Validation.

## CI and dedicated remote isolation

These are independent evidence scopes, verified at the documentation closeout:

| Scope | State | Evidence and limits |
| --- | --- | --- |
| Ordinary remote CI | **VERIFIED** | [Run 45708916081](https://github.com/fjmedina21/ai-harness/actions/runs/45708916081), push SHA `6148e9e96493bdd63053c7ab97a991cc39da6e18`; build-test, Build, Test and CLI smoke all completed successfully |
| Local Gate C | **LIVE VERIFIED for the recorded scope** | Actual owner/native/durable/Podman and fresh CLI evidence below; this does not extend acceptance expiry or authorize a new project/profile |
| Dedicated remote Podman isolation | **DEFERRED** | Repository runner API returned zero runners; phase5-isolation.yml workflow history returned zero executions |

The ordinary CI run certifies its exact published SHA, not future documentation
commits, remote container isolation or a permanently accepted local profile.
The previous "remote CI not verified" status is superseded by this observed run.

The dedicated workflow/hardening was already integrated by squash PR #3 at
`c87d22f`. `git cherry` confirms the old local branch commit `b586e18` is equivalent;
its local branch was redundant and removed. The remote branch is retained.
There is no pending code merge for that branch.

Remote isolation resumes only for a concrete remote-execution requirement, with
explicit host/budget/setup authorization, a dedicated Linux runner, protected
Environment, valid private rootless Podman Machine profile and pre-pulled pinned
image. A separately authorized manual run must then produce real probe, timeout,
cancellation and cleanup evidence. No runner, Environment, image or workflow run
was created by this closeout. See [runner prerequisites](DEDICATED-PODMAN-RUNNER.md).

## Historical baseline commands and results

| Command | Current result |
| --- | --- |
| `pnpm clean` / `pnpm build` | Pass |
| `pnpm test` | **873/873** |
| `pnpm test:github-auth` | **150/150** |
| `pnpm test:personal-approval` | **43/43** |
| `pnpm test:phase9b` | **76/76** |
| `pnpm harness --help` / `pnpm harness version` | Pass; 0.8.0 experimental |
| `git diff --check` | Pass |
| Current actual fixed Podman isolation suite | Pass, explicitly authorized |
| Actual durable GitHub/native/Podman fixture | Four action results verified in new processes |
| Actual accepted CLI new execution | Passed and reopened without replay |

Offline suites use mocked GitHub, presence and Podman but actual private FS,
SQLite, concurrent workers and SIGKILL boundaries. Synthetic native-method metadata
in acceptance unit tests is test data, never real acceptance evidence. No ordinary
test authenticates online or executes generated code on macOS.

## Capability classification

| Capability | Classification | Evidence / boundary |
| --- | --- | --- |
| Single numeric owner; account lists/assignments rejected | IMPLEMENTED; OFFLINE VERIFIED; LIVE VERIFIED for owner | Real App-bound login for 70180651; adversarial identities/config rejected offline |
| Independent canonical project policy, budgets, tools and profiles | IMPLEMENTED; OFFLINE VERIFIED | 18 registry/fingerprint checks; no default global capability |
| Exact Personal review, native intent, single use and fenced apply | IMPLEMENTED; OFFLINE VERIFIED; LIVE VERIFIED for synthetic projects | Three real native patch grants; unchanged original source |
| Separate sandbox intent and durable coordinator | IMPLEMENTED; OFFLINE VERIFIED; LIVE VERIFIED for accepted scope | Four independently reviewed real actions and two CLI actions; distinct native receipts |
| Multiprocess durable recovery / CAS / fencing / replay | OFFLINE VERIFIED; LIVE VERIFIED for effect-free stages and evidence | Four-process fixtures and actual separate stage processes; consumed-grant replay denied with zero runtime calls |
| Effective Podman isolation, output, timeout, cancellation and cleanup | LIVE VERIFIED for fixed Node scope | Current rootless Machine, pinned image, probes and durable records |
| Accepted `local-podman` CLI | IMPLEMENTED; OFFLINE VERIFIED; LIVE VERIFIED for gatec-synthetic/test | Fresh CLI proposal, native patch and sandbox decisions, actual test; independent evidence reopen |
| Other projects/profiles and arbitrary commands/builds | BLOCKED | No acceptance transfer; no general Node/native/dependency-build claim |
| Dedicated remote isolation runner | DEFERRED | Separate infrastructure and actual remote acceptance are required |
| Phase 9C finite repair | IMPLEMENTED; offline verification tracked below; real acceptance BLOCKED | New native/GitHub/Podman/provider repair run needs explicit authorization |
| Phase 9D / production autonomy | Not implemented | Outside this change |

## Real acceptance scope

The owner explicitly authorized migration with verified private backup and real
GitHub/native/Podman tests. The old private configuration was backed up (15 files,
verified hashes and SQLite integrity), then atomically replaced with a validated
single-owner candidate. Historical journals/identities/grants were not rewritten.
A new real GitHub login succeeded through the existing App/PKCE/Keychain flow.

Execution `931c2f64-bdde-4bb8-ae5f-310792c84c33` used fixture generation, actual
Personal patch review and separate native confirmations for test, output, timeout
and cancel. Nine distinct native confirmation IDs cover three actual patch grants
and six actual sandbox grants across the acceptance and both fresh CLI cases. Evidence binds
exact patch/workspace/snapshot/action/policy/challenge and owner.

A private create-only acceptance record, domain-HMAC protected with the existing
proposal host key, binds current project authorization, critical runtime/auth/CLI
code digest, exact Podman options, effective-isolation observations and all four
durable native-approved outcomes. The record is bounded to 24 hours and additionally
requires the acceptance workspace/source/snapshot to remain valid and unchanged;
its workspace lifetime can end earlier. It is a trusted host policy record, not
external attestation. Expiry, tampering, code/policy/profile changes or absent proof
retain `validation_acceptance_pending`.

Execution `a5aabba6-7f19-49c1-b2b4-eeef92e1fe2c` then passed the actual CLI workflow
with new native patch and sandbox reviews. Its real test finished at
2026-11-25T21:18:47.642Z, exit 0, cleanup confirmed. A final recheck on execution `80412ee2-fdd8-434c-b93d-61a7da2ba689` passed at 2026-11-25T21:38:13.990Z with validation ID `40c1acdf0e94301d0422d616300f638837e858616f68c8d8f5b6795e7f5ed424`. A later CLI process returned the same durable evidence without execution. An unaccepted profile returned
validation_acceptance_pending. Consumed sandbox replay was independently denied
with zero runtime calls. Original selected source hashes remain unchanged.

Cancellation was observed while actually running. Its container cleanup is
confirmed, durable evidence is cancelled, and the operation intentionally remains
Uncertain with its claim retained. That execution needs explicit reconciliation;
it was never automatically resumed or declared passed. New executions remain separate.

Private evidence is locally excluded under
`harness-development/single-developer-podman-gate/`; no credentials, host profile,
HMAC key, raw source/diff or private SQLite files are published. See
[real report](phase9-real-acceptance-report.md) and [limitations](phase9b-security.md).

## Phase 9A.3 and Phase 9B

Legacy anchor retained for existing links. Current single-owner and scoped Podman
acceptance is above. [Earlier actual evidence](history/phase9-acceptance-before-single-developer.md)
is historical and does not accept current code by itself.

## Phase 9A.2 durable L2 resume

Legacy anchor retained for links. Existing HMAC artifacts, v3 review/intent ledger,
CAS/leases/fencing, schema rollback/recovery and conservative non-replay remain
covered. Team records are audit-only; no new effect can consume them. See
[migration](single-developer-migration.md). Ordinary remote CI is verified for the
exact published SHA above; no release or dedicated remote isolation pass is claimed.

## Phase 9A OpenAI local closure

Historical provider evidence and original counts are preserved in
[the earlier verification snapshot](history/verification-before-single-developer.md).
They do not authorize another provider call or accept another project.

## Phase 9A evidence audit

Historical provider reports remain separate from the current local Gate C scope.
See [archived verification](history/verification-before-single-developer.md) and
[the current actual report](phase9-real-acceptance-report.md).

## Phase 9 local verification

The original fixture milestone is preserved in
[historical verification](history/verification-before-single-developer.md).
Current commands, counts and scope are documented above.

## Phase 9C language-agnostic finite repair

[Repair architecture](phase9c-architecture.md) and [acceptance](phase9c-e2e.md) describe
the new implementation scope. Deterministic verification uses real private temporary
filesystem and SQLite with synthetic providers, human verifiers and Podman. Real
Phase 9C GitHub/native/Podman/provider E2E is **BLOCKED** pending separate explicit
authorization; remote Podman remains **DEFERRED**. The prior published CI and Gate C
records certify their recorded scope and SHA, not this working branch.
