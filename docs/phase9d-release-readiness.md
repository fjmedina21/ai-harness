# Phase 9D — beta release readiness

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


Release candidate: **v0.9.0-beta.1 — DRAFT, NOT RELEASED**. Source version remains
**0.8.0**. Assessment date: **2026-11-26**. Initial source:
`def9a987ff8d449402a67d0dcb58a8420709f68e`.

## Decision

**Beta release: BLOCKED.** Preparing documentation and a static portal does not
accept the product's real repair lifecycle. No version bump, package publication,
Git tag, GitHub Release or Pages deployment is part of this phase.

The portal's implementation/build/navigation/accessibility classifications are
recorded separately in [Phase 9D verification](phase9d-verification.md). Passing
those gates does not change the beta decision below.

## Evidence and capability boundaries

| Area | Classification | Evidence and practical boundary |
| --- | --- | --- |
| Initial hosted code CI | PASS for the initial source only | [Run 45739242316](https://github.com/fjmedina21/ai-harness/actions/runs/45739242316), source `def9a98`; it cannot certify unpublished Phase 9D changes |
| GitHub authentication | IMPLEMENTED; OFFLINE VERIFIED; historically LIVE VERIFIED for the tested macOS owner lifecycle | [Authentication](phase9-github-authentication.md) and [scoped acceptance](phase9-real-acceptance-report.md); no Linux/Windows native credential adapter is supplied |
| Project authorization | IMPLEMENTED; OFFLINE VERIFIED; exercised in historical scoped live workflows | [Project policy](project-authorization.md); a login grants neither project capabilities nor execution rights |
| Personal L2 | IMPLEMENTED; OFFLINE VERIFIED; historically LIVE VERIFIED for synthetic local projects | [Personal L2](phase9-personal-mode.md); every new exact patch requires fresh typed and native human confirmation |
| Local Podman Gate C | Historical restricted LIVE VERIFIED scope; current executable acceptance must revalidate | [Gate C](phase9b-e2e.md) and [runtime](phase9b-validation-runtime.md); historical project/code/profile acceptance is neither transferable nor permanent |
| Current-code isolation probes | Limited real runtime evidence reviewed | Phase 9C.1 local inspection recorded passing fixed isolation/timeout/cancellation/cleanup probes. This is not coordinated Gate C or repair E2E acceptance; private raw evidence remains excluded |
| Language-neutral validation contracts | IMPLEMENTED; OFFLINE VERIFIED | [Profiles](phase9c-validation-profiles.md), [discovery](phase9c-project-discovery.md), [Phase 9C acceptance](phase9c-e2e.md); detection does not provide operational toolchain support |
| Finite supervised repair | IMPLEMENTED; OFFLINE VERIFIED; scoped LIVE VERIFIED 2026-11-27 | [Current acceptance](phase9c1-live-acceptance.md); real provider/native/Podman cycle passed for its exact local synthetic scope |
| Durable recovery | IMPLEMENTED; OFFLINE VERIFIED; historical scoped live inspection | [Lifecycle](phase9c-state-machine.md); uncertain operations require reconciliation and cannot replay automatically |
| Remote Podman | DEFERRED | [Dedicated runner](DEDICATED-PODMAN-RUNNER.md); ordinary hosted CI is not remote isolation acceptance |
| Production autonomous execution | BLOCKED / not certified | [Security](phase9-security.md) and [repair security](phase9c-security.md); no integration, auto-merge or deployment authority |
| Release publication | NOT PERFORMED | GitHub releases endpoint returned an empty list during this assessment; source milestones are not formal releases |

## Blocking release conditions

1. Obtain a separately authorized real Phase 9C acceptance using exact current
   source, owner, project, model/budget and approved runtime/profile scope. Record
   the initial failure, independent patch and sandbox decisions for the repair,
   verified passing evidence, unchanged original source, cleanup and independent
   process inspection. Do not substitute offline E2E or isolation-only probes.
2. Verify current coordinated Gate C acceptance for that exact source/project/
   profile. Changed critical code, policy, expiry or missing evidence must retain
   `validation_acceptance_pending`.
3. Reconcile every uncertain operation relevant to the intended release scope.
   Cleanup confirmation alone does not convert an Uncertain journal operation
   into Completed. Preserve evidence; never reset or replay it for convenience.
4. Local regression/evaluation/build/link and sampled accessibility review have passed,
   as recorded in [verification](phase9d-verification.md). Retain their exact scope;
   complete any additional review required for the eventual release candidate.
5. After an explicitly authorized publication step, require code and documentation
   CI on the exact candidate SHA. Initial `def9a98` CI is not candidate CI.
6. Review the concrete release notes, compatibility/migration requirements and
   rollback plan, then obtain owner authorization before changing versions,
   creating a tag or publishing any artifact.

A narrower beta that excludes live repair would require an explicit scope decision
and revised release notes/checklist. This assessment does not make that decision.

## Security review register

| Severity | Finding | Disposition |
| --- | --- | --- |
| Resolved for exact local synthetic scope, 2026-11-27 | Real Phase 9C lifecycle passed with independent durable inspection | LIVE VERIFIED; [current report](phase9c1-live-acceptance.md); not universal acceptance |
| High — runtime trust boundary | Same-UID parent-path races, trusted host/verifier/runtime compromise and container escape resistance are not solved by unit tests | Documented experimental limitation; no production-security claim |
| Medium — recovery | Filesystem, provider, Podman and SQLite do not share one transaction; interrupted effects can remain uncertain | Conservative non-replay; explicit host reconciliation and verified backups |
| Medium — compatibility | Only fixed approved Node runtime actions have restricted operational evidence | Unsupported languages/actions remain unsupported; profile admission alone cannot accept them |
| Medium — publication | A static local build cannot establish hosted Pages behavior or candidate remote CI | Separate controlled publication and exact-SHA verification required |
| Resolved dependency findings | Initial Vite 5/esbuild audit: 1 high, 7 moderate, 1 low; scoped Vite 6.4.5 override / esbuild 0.25.12 | Final advisory snapshot zero; local build/browser checked; upstream VitePress range override needs future revalidation |
| Informational — privacy | Host profiles, journals, keys, raw diffs and evidence are private development/runtime data | Keep excluded; publish only sanitized capability/evidence summaries |

Dependency/lockfile, tracked-file and built-output checks are recorded in the
Phase 9D verification report. This register does not infer an audit pass before
those checks run and does not transmit credentials to an audit service.

## Release preparation artifacts

- [Beta release checklist](releases/beta-release-checklist.md): PASS, FAIL,
  BLOCKED and NOT APPLICABLE with evidence per condition.
- [Draft release notes](releases/v0.9.0-beta.1-draft.md): proposed scope and limits,
  explicitly unpublished.
- [Versioning policy](VERSIONING.md): pre-1.0 compatibility and migration policy.
- [Single-developer migration](single-developer-migration.md): reviewed manual
  host configuration migration; no private configuration is rewritten here.
- [Changelog](../CHANGELOG.md): source milestones distinguished from releases.

## Rollback and publication control

Keep version 0.8.0 until the release gate and owner decision are complete. Before
an authorized runtime upgrade, stop journal users and verify consistent private
backups of the profile, journal, host artifact key, proposal artifacts and evidence.
Phase 9C adds opt-in journal v4 repair tables; do not downgrade or edit journal
schema/checksums or restore consumed approvals. Reconcile effects before rollback.

A static portal rollback uses a previously verified static artifact or rebuilds a
reviewed prior commit with its frozen lockfile. It does not roll back runtime
side effects. Pages publication and product release remain independent, manual
owner decisions.
