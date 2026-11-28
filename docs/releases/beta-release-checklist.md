# Beta release checklist — v0.9.0-beta.1

**CANDIDATE / PUBLICATION BLOCKED pending final owner approval and final-SHA CI verification.** Local version is **0.9.0-beta.1**. No tag or release
exists for this planned version. Assessed **2026-11-26** from initial source
`def9a987ff8d449402a67d0dcb58a8420709f68e`.

Status meanings: **PASS** requires recorded evidence for the stated scope;
**FAIL** means an executed check failed; **BLOCKED** means required evidence or
authorization is missing; **NOT APPLICABLE** means excluded from this release's
stated scope. A planned command is never evidence that it passed.

## Current candidate preparation — 2026-11-27

Local manifests/CLI are aligned to **0.9.0-beta.1**. The tablet/desktop visual gate
passed sampled real-browser review; [candidate record](../phase9c1-release-candidate.md).
Candidate hosted [CI](https://github.com/fjmedina21/ai-harness/actions/runs/46105350756) passed on `f98eded1a4977c95eedd28459a2bf1f4af6e1132`.
The documentation-record commit must pass on its own SHA before publication;
final owner review/approval of notes and tag/release remains pending.

## Phase 9C.1 reassessment — 2026-11-27

Current source: `779daab899c2ef9875dc198785ad7b33489763e9`, version **0.8.0**.
[Actual live acceptance](../phase9c1-live-acceptance.md) supersedes the earlier
missing-live-evidence rows for its exact synthetic scope only. **Beta: BLOCKED**.
The obsolete historical journal is now [archived and outside the fresh-journal release scope](../phase9c1-historical-journal-exclusion.md); its invalid grants and uncertain states remain unchanged.
Historical assessment paragraphs below retain their original source/date.

## Code quality

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Initial source build and tests | PASS — initial source only | [Phase 9C offline record](../phase9c-e2e.md): 993/993 full suite and 120/120 repair tests; must rerun for the candidate |
| Candidate build and regression suites | PASS — local candidate | [Candidate verification](../phase9c1-release-candidate.md): clean/build, 993/993 full; focused 150/43/76/120 on local version 0.9.0-beta.1 |
| Candidate deterministic evaluations | PASS — offline candidate | Deterministic 19/19 (42 assertions); phase9 10/10; [current verification](../VERIFICATION.md) |
| Initial hosted code CI | PASS — exact initial SHA | [Run 45739242316](https://github.com/fjmedina21/ai-harness/actions/runs/45739242316) for `def9a98` |
| Candidate hosted code and docs CI | PASS — exact candidate SHA; final record SHA must pass too | [Run 46105350756](https://github.com/fjmedina21/ai-harness/actions/runs/46105350756) passed build-test/docs-check on `f98eded1a4977c95eedd28459a2bf1f4af6e1132`; verify the same two checks on the final tagged commit |
| No known critical defect in tested fresh-journal scope | PASS — bounded review | Live acceptance/regressions and advisory review passed; obsolete invalid journal archived and explicitly excluded, not repaired; no general security certification |

## Security

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Credential and private-file review | PASS — bounded local review | Version/private/generated/output/source checks recorded in [verification](../phase9d-verification.md); no exhaustive secret-detection claim |
| Personal L2 exact diff / typed APPROVE / native presence | PASS — current scoped LIVE VERIFIED | Nine distinct real native decisions; [current report](../phase9c1-live-acceptance.md); future patches still require fresh confirmation |
| Independent project authorization | PASS — implemented/offline and historical scoped exercise | [Project policy](../project-authorization.md); unknown or changed project policy must fail closed |
| Separate sandbox approval / one-use grants / CAS / fencing | PASS — implemented and historical restricted scope | [Runtime](../phase9b-validation-runtime.md); patch approval is not sandbox approval |
| Current exact-scope coordinated Podman acceptance | PASS — LIVE VERIFIED for current synthetic scope | Fresh HMAC acceptance, real native coordinator actions and runtime probes; [current report](../phase9c1-live-acceptance.md); expiry remains enforced |
| Real Phase 9C repair acceptance | PASS — LIVE VERIFIED for current synthetic scope | Real OpenAI request, exact native patch/sandbox approvals, failed → passed Podman evidence and independent recovery; [report](../phase9c1-live-acceptance.md) |
| Uncertain-state reconciliation or justified exclusion | PASS — exact fixture scope classified | Obsolete journal archived and excluded after expiry, no in-flight work and zero runtime containers; Gate C cancellations remain quarantined acceptance fixtures with retained claims; [decision](../phase9c1-historical-journal-exclusion.md); no Completed rewrite or replay |
| Production security certification | NOT APPLICABLE | Experimental beta makes no formal certification or absolute isolation claim |

## Documentation

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Getting Started and troubleshooting | PASS — local content/build | Implemented substantial guides; source and built route checks pass |
| CLI and configuration reference | PASS — source/type verified | AST coverage: 27 commands / 15 scopes; no-emit config typecheck |
| Architecture, security and capability matrix | PASS — source reviewed | Eight original SVGs, source links and explicit offline/live limits; historical clarifications retained |
| Migration and known limitations | PASS — documentation reviewed | Manual migration, opt-in v4, rollback and operational limits documented |
| Static build, internal links, navigation and base path | PASS — locally verified | 43 source pages; 1,682 local refs; 364 repository paths; /ai-harness/ |
| Responsive, keyboard, light/dark, local search | PASS — sampled real-browser review | Tablet768×1024 and desktop1280×800 full-size captures inspected; search→anchor, context menu, themes and copy controls verified; [candidate record](../phase9c1-release-candidate.md) |
| Accessibility review | PASS — sampled review | Landmarks/headings/alternatives/focus/reduced-motion and keyboard search; no formal WCAG certification |
| Public Pages deployment | NOT APPLICABLE — not authorized in this phase | Readiness can be checked locally; no public URL claimed |

## Runtime and compatibility

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Node and pnpm declared compatibility | PASS — declared/initial CI | Node >=22; durable SQLite requires Node 22.13+ or Node 24; pinned pnpm 12.21.0. Node 24 is the development/CI target |
| macOS GitHub OAuth and Keychain | PASS — current scoped LIVE VERIFIED | Official refresh/status/whoami verified the configured sole owner online on 2026-11-27 |
| Native macOS Personal confirmation | PASS — current scoped LIVE VERIFIED | [Current acceptance](../phase9c1-live-acceptance.md); real typed/native confirmation, no test verifiers |
| Exact current Podman Machine/image/profile | PASS — scoped LIVE VERIFIED | Existing dedicated rootless Machine and pinned image; effective controls and cleanup passed; no pull/provisioning |
| Accepted fixed Node actions | PASS — scoped LIVE VERIFIED | Current registered fixed actions and dependency-free repair test accepted; no general dependency-build claim |
| Other language toolchains | NOT APPLICABLE | Contracts support extension; no additional operational profiles accepted by Phase 9D |
| Linux/Windows native credential adapters | NOT APPLICABLE | No supplied operational adapter; no cross-platform authentication support claim |
| Remote execution / Team / autonomous deployment | NOT APPLICABLE | Outside release scope |

## Release operations

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Preserve original live baseline version 0.8.0 record | PASS — historical | Acceptance records retain their actual baseline; candidate is a separately verified 0.9.0-beta.1 change |
| Candidate version consistency | PASS — local candidate | All 16 manifests and actual CLI version output are 0.9.0-beta.1; current portal version marker passed docs checks |
| Changelog | PASS — prepared source ledger | [Changelog](../../CHANGELOG.md) separates internal milestones from unpublished releases |
| Release notes | PREPARED; owner review PENDING | Concrete [candidate notes](v0.9.0-beta.1-draft.md), scope, migration and rollback prepared for final approval |
| Planned tag | BLOCKED | Proposed `v0.9.0-beta.1`; no tag creation authorized |
| Reproducible code/docs artifacts | PASS — local preparation | Frozen install, build and docs checks; candidate hosted provenance recorded; final record commit checks remain mandatory |
| Rollback plan | PASS — documented procedure only | [Readiness review](../phase9d-release-readiness.md#rollback-and-publication-control); backups and operational rollback rehearsal are not claimed |
| Owner authorization for candidate preparation | PASS — local preparation | Owner explicitly authorized version 0.9.0-beta.1, local commit, this branch push and exact-SHA CI; tag/release remain separate |
| Owner authorization for tag/release/Pages | PENDING | Separate final decision on the concrete candidate; no tag/release/deployment performed |
| Package publication | NOT APPLICABLE | All workspace packages remain private; no registry publication requested |

## Decision record

**Beta: BLOCKED.** The documentation portal may independently become ready for
controlled deployment. Real repair acceptance passed for the stated current scope. The inactive
historical journal is archived and excluded. Candidate hosted CI passed. Final documentation-record SHA checks must pass too;
owner review and tag/release authorization remain pending.

When a check is executed, replace only the affected row with its actual result,
exact source scope and evidence reference. Keep failed and historical observations
traceable. Never mark a live gate PASS based on fixtures or a previous acceptance
whose code/project/profile/expiry no longer matches.
