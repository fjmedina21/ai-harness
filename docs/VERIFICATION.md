# Verification

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

## Current commands and results

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
| Phase 9C / Phase 9D / production autonomy | BLOCKED / not implemented | Outside this change |

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
