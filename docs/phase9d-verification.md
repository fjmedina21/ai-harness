# Phase 9D verification

Candidate local verification completed; hosted candidate CI and publication are not performed. Version remains **0.8.0**. No push, merge,
tag, Pages deployment or release has occurred.

## Initial state

- Base HEAD `def9a987ff8d449402a67d0dcb58a8420709f68e`, synchronized clean `main`.
- Work branch `feat/phase9d-documentation-portal`.
- Base CI [45739242316](https://github.com/fjmedina21/ai-harness/actions/runs/45739242316)
  completed success for that exact SHA; releases endpoint returned no releases.
- Local Node 24.18.0, pnpm 12.21.0; initial build and full suite **993/993 PASS**.
- Phase 9C real repair E2E remains BLOCKED. Safe review of subsequent local 9C.1
  summaries found passing isolation probes, but no completed native-approved real
  repair cycle; no private records were published or real operations invoked.

## Candidate checks — local results

| Check | Observed result |
| --- | --- |
| Node / pnpm | 24.18.0 / 12.21.0 |
| `pnpm install --frozen-lockfile` | PASS after final dependency correction |
| `pnpm clean`, `pnpm build` | PASS |
| `pnpm test` | PASS 993/993, zero skipped/failures |
| `pnpm test:github-auth` | PASS 150/150 |
| `pnpm test:personal-approval` | PASS 43/43 |
| `pnpm test:phase9b` | PASS 76/76 |
| `pnpm test:phase9c` | PASS 120/120 |
| Deterministic evaluations | PASS 19/19 scenarios, 42/42 assertions |
| Phase 9 evaluations | PASS 10/10 scenarios/assertions |
| CLI help/version | PASS; `ai-harness 0.8.0 (experimental)` |
| Documentation configuration typecheck | PASS; separate no-emit TypeScript config |
| Static docs build/check | PASS; 43 Markdown pages, 44 HTML pages including 404, 165 output files |
| Local link/asset checks | PASS; 1,676 emitted local references, 100 asset references, 328 repository Markdown paths |
| CLI parser drift | PASS; 27 commands, 15 option scopes; four baseline/negative cases |
| Checker tests | PASS 7/7; missing routes/fragments/assets, base, remote dependencies, quoting/case/CSS imports, navigation and private-pattern fixtures |
| Runtime source changes | None in `packages/` or `apps/cli/` |
| `git diff --check` | PASS before local commits |
| Candidate hosted CI | BLOCKED until separately authorized push/PR; base CI is not candidate CI |

Focused suites overlap the full suite and are not additive independent tests.
All mandatory runtime checks are offline. No real provider, OAuth/native approval,
Podman action, acceptance update or E2E repair was executed during this phase.
Private command logs remain locally excluded; no raw private runtime evidence is
copied into the portal/search index.

## Portal and browser review

The default VitePress theme provides local search, keyboard navigation, copyable
Shiki code, contextual sidebar/page outline and theme controls. Original SVG assets
have titles and Markdown text alternatives. CSS adds visible focus, responsive
wrapping and reduced-motion handling. A main landmark was added to home content.

A real Microsoft Edge session opened the built loopback site under `/ai-harness/`:

- Home and nested repair page returned HTTP 200.
- Local search for `NoProgress` returned relevant results; Return navigated to
  `architecture/repair.html#implemented-lifecycle` under the correct base.
- Accessible headings, sidebar, page outline links, copy buttons, skip link and
  explicit experimental/blocked statements were inspected in the browser tree.
- iPhone 16 emulation (393×852) rendered the mobile navigation and stacked home;
  an actual screenshot was inspected and kept privately. A preliminary screenshot
  with invalid emulation scale was discarded as acceptance evidence.
- Mobile navigation opened and the theme switch changed from dark to light.
- Tablet iPad Mini emulation (768×1024) exposed the contextual navigation layout.

Review is sampled, not an exhaustive device/assistive-technology audit. Native app
capture can show a reduced background thumbnail; DevTools screenshot capture was
used for the readable mobile image. Top navigation is grouped into Start/Explore/version to avoid crowding tablet widths.
Tablet/desktop-width emulation was sampled through browser controls, but the tablet
screenshot showed an inherited emulation scale/capture limitation and is not accepted
as complete tablet visual proof. The readable mobile capture and interactive
search/theme/navigation checks are the verified scope. Complete a native desktop/
tablet visual pass before public deployment; no formal WCAG 2.2 AA certification is claimed.
SVG was deliberately selected instead of Mermaid: eight original static diagrams,
no Mermaid renderer/dependency. This item is NOT APPLICABLE, not an unrun Mermaid pass.
There are no custom Vue components; the theme extends the default with CSS only.

## Dependency and publication security review

The initial stable VitePress 1.6.4 resolution brought Vite 5/esbuild advisories:
one high, seven moderate and one low. A narrow workspace override changes only
`vitepress@1.6.4>vite` to **6.4.5**, resolving esbuild **0.25.12**. The intermediate
6.4.4 selection retained one moderate advisory and was replaced using the
[official Vite 6.4.5 fix](https://github.com/vitejs/vite/releases/tag/v6.4.5).
Final registry advisory snapshot: **0 critical/high/moderate/low/info**. This is
an advisory snapshot, not a vulnerability-free certification.

Plugin Vue 5.2.4 accepts Vite 5/6; VitePress itself declares Vite 5. The override is
an explicit documentation-build compatibility deviation, locally type/build/check
and browser tested. Revalidate/remove it when upstream stable dependencies change.
[Stable VitePress requirements](https://vuejs.github.io/vitepress/v1/guide/getting-started)
require Node >=18; the repository's Node 24 path meets that requirement.

Only esbuild's dependency build script is allowed. All workspace packages remain
private and version 0.8.0. Cache/dist are ignored; no generated build output is
staged. AGENTS.md and harness-development remain locally excluded. The output check
found no known private-path/credential patterns or private evidence references;
pattern-based review is not comprehensive secret detection. No credentials were
created, printed, rotated or transmitted to the advisory service; only public
package/version metadata was used. Builds do not require network after installation.

Ordinary CI retains code checks and adds a read-only docs job with frozen install.
At the owner's follow-up request, `.github/workflows/docs-pages.yml` supports manual
publication from main in the official repository. Build reads Pages metadata; only
the deploy job receives pages:write/id-token:write through github-pages, honoring
configured environment protection rules. It is dispatch-only and was not run.
configure-pages has enablement disabled; Pages settings were not changed. Actions
configuration is locally reviewed, not claimed remotely executed.

## Gate classification

| Gate | State | Boundary |
| --- | --- | --- |
| Documentation portal | IMPLEMENTED; BUILD VERIFIED; NAVIGATION VERIFIED | Local static/type/link/CLI checks pass |
| Accessibility | ACCESSIBILITY REVIEWED — sampled | Semantic/keyboard/theme/alternative/focus/reduced-motion review, no formal conformance |
| Deployment preparation | CONDITIONALLY READY FOR DEPLOYMENT | Workflow/config/artifact prepared; complete desktop/tablet visual pass, owner Pages source/environment review and manual dispatch; actual hosting unverified |
| Product | IMPLEMENTED; OFFLINE VERIFIED | Historical scoped live evidence retained; current real repair E2E BLOCKED; remote Podman DEFERRED |
| Beta release | BLOCKED | Real E2E, current exact acceptance/reconciliation, candidate hosted CI and owner release decision pending |

No push, merge, tag, Pages publication, package publication or GitHub Release was
performed. The owner explicitly reiterated that release must wait for the E2E.
See [readiness](phase9d-release-readiness.md) and the
[checklist](releases/beta-release-checklist.md). Local commit identity and final Git
state are reported in the delivery response, rather than embedding a self-referential SHA.
