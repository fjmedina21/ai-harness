# Beta release checklist — v0.9.0-beta.1

**DRAFT / RELEASE BLOCKED.** Source version remains **0.8.0**. No tag or release
exists for this planned version. Assessed **2026-11-26** from initial source
`def9a987ff8d449402a67d0dcb58a8420709f68e`.

Status meanings: **PASS** requires recorded evidence for the stated scope;
**FAIL** means an executed check failed; **BLOCKED** means required evidence or
authorization is missing; **NOT APPLICABLE** means excluded from this release's
stated scope. A planned command is never evidence that it passed.

## Code quality

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Initial source build and tests | PASS — initial source only | [Phase 9C offline record](../phase9c-e2e.md): 993/993 full suite and 120/120 repair tests; must rerun for the candidate |
| Candidate build and regression suites | PASS — local candidate | [Phase 9D verification](../phase9d-verification.md): clean/build, 993/993 full; focused 150/43/76/120 |
| Candidate deterministic evaluations | PASS — offline candidate | Deterministic 19/19 (42 assertions); phase9 10/10; [verification](../phase9d-verification.md) |
| Initial hosted code CI | PASS — exact initial SHA | [Run 45739242316](https://github.com/fjmedina21/ai-harness/actions/runs/45739242316) for `def9a98` |
| Candidate hosted code and docs CI | BLOCKED | Requires authorized publication and successful checks on the exact candidate SHA |
| No known critical defect in release scope | BLOCKED | Complete current security/dependency review; live acceptance remains absent |

## Security

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Credential and private-file review | PASS — bounded local review | Version/private/generated/output/source checks recorded in [verification](../phase9d-verification.md); no exhaustive secret-detection claim |
| Personal L2 exact diff / typed APPROVE / native presence | PASS — implemented and historical restricted live scope | [Personal L2](../phase9-personal-mode.md) and [actual report](../phase9-real-acceptance-report.md); new repair decisions still required |
| Independent project authorization | PASS — implemented/offline and historical scoped exercise | [Project policy](../project-authorization.md); unknown or changed project policy must fail closed |
| Separate sandbox approval / one-use grants / CAS / fencing | PASS — implemented and historical restricted scope | [Runtime](../phase9b-validation-runtime.md); patch approval is not sandbox approval |
| Current exact-scope coordinated Podman acceptance | BLOCKED | Code/profile/project/expiry must revalidate; current isolation-only probes are insufficient |
| Real Phase 9C repair acceptance | BLOCKED | [Phase 9C E2E](../phase9c-e2e.md); no completed real repair cycle established |
| Uncertain-state reconciliation | BLOCKED | Identify and reconcile operations relevant to release; no automatic retry or claim deletion |
| Production security certification | NOT APPLICABLE | Experimental beta makes no formal certification or absolute isolation claim |

## Documentation

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Getting Started and troubleshooting | PASS — local content/build | Implemented substantial guides; source and built route checks pass |
| CLI and configuration reference | PASS — source/type verified | AST coverage: 27 commands / 15 scopes; no-emit config typecheck |
| Architecture, security and capability matrix | PASS — source reviewed | Eight original SVGs, source links and explicit offline/live limits; historical clarifications retained |
| Migration and known limitations | PASS — documentation reviewed | Manual migration, opt-in v4, rollback and operational limits documented |
| Static build, internal links, navigation and base path | PASS — locally verified | 43 source pages; 1,676 local refs; 328 repository paths; /ai-harness/ |
| Responsive, keyboard, light/dark, local search | BLOCKED — partial browser verification | Search→anchor, menu/theme and mobile visual passed; tablet/desktop visual pass remains limited by emulation/capture scale |
| Accessibility review | PASS — sampled review | Landmarks/headings/alternatives/focus/reduced-motion and keyboard search; no formal WCAG certification |
| Public Pages deployment | NOT APPLICABLE — not authorized in this phase | Readiness can be checked locally; no public URL claimed |

## Runtime and compatibility

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Node and pnpm declared compatibility | PASS — declared/initial CI | Node >=22; durable SQLite requires Node 22.13+ or Node 24; pinned pnpm 12.21.0. Node 24 is the development/CI target |
| macOS GitHub OAuth and Keychain | PASS — historical tested local lifecycle | [Authentication](../phase9-github-authentication.md); current login/session still verifies online |
| Native macOS Personal confirmation | PASS — historical restricted local workflow | [Actual acceptance](../phase9-real-acceptance-report.md); test verifiers do not prove human presence |
| Exact current Podman Machine/image/profile | BLOCKED | Preprovisioned rootless profile and pinned image required; no implicit pulls, network or host mounts |
| Accepted fixed Node actions | BLOCKED — candidate authorization | Historical evidence is restricted; no general Node dependency-build claim |
| Other language toolchains | NOT APPLICABLE | Contracts support extension; no additional operational profiles accepted by Phase 9D |
| Linux/Windows native credential adapters | NOT APPLICABLE | No supplied operational adapter; no cross-platform authentication support claim |
| Remote execution / Team / autonomous deployment | NOT APPLICABLE | Outside release scope |

## Release operations

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Keep current workspace/CLI version 0.8.0 | PASS — initial source | Inspect root/workspace manifests and CLI; recheck after implementation |
| Candidate version consistency | BLOCKED | Set `0.9.0-beta.1` only after gate and owner authorization; update all authoritative version sources together |
| Changelog | PASS — prepared source ledger | [Changelog](../../CHANGELOG.md) separates internal milestones from unpublished releases |
| Release notes | BLOCKED | Owner review of [draft](v0.9.0-beta.1-draft.md) after evidence is complete |
| Planned tag | BLOCKED | Proposed `v0.9.0-beta.1`; no tag creation authorized |
| Reproducible code/docs artifacts | PASS — local preparation | Frozen install, build and docs checks; hosted exact candidate provenance remains pending |
| Rollback plan | PASS — documented procedure only | [Readiness review](../phase9d-release-readiness.md#rollback-and-publication-control); backups and operational rollback rehearsal are not claimed |
| Owner authorization for version/tag/release/Pages | BLOCKED | Separate explicit decision required after reviewing concrete candidate |
| Package publication | NOT APPLICABLE | All workspace packages remain private; no registry publication requested |

## Decision record

**Beta: BLOCKED.** The documentation portal may independently become ready for
controlled deployment. Completing documentation does not waive real repair
acceptance, uncertain-state reconciliation, candidate CI or owner authorization.

When a check is executed, replace only the affected row with its actual result,
exact source scope and evidence reference. Keep failed and historical observations
traceable. Never mark a live gate PASS based on fixtures or a previous acceptance
whose code/project/profile/expiry no longer matches.
