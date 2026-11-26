# Phase 9D documentation plan and source ownership

The owner authorized implementation of the documentation portal and beta preparation.
The product version remains **0.8.0**; publication is a separate decision.

## Delivery slices and acceptance

1. Verify clean synchronized base, current CI/releases, scripts/tests and acceptance.
2. Audit all public docs and actual CLI/contracts; classify stale/history/offline/live.
3. Implement VitePress app, original identity/eight diagrams, contextual navigation,
   local search, complete substantive grouped guides and exact CLI reference.
4. Add deterministic static and CLI-drift checks, reproducible CI and manual Pages
   artifact preparation. No credentials/provider/Podman in documentation builds.
5. Prepare changelog, checklist, draft notes and security/readiness assessment;
   run complete offline regressions and observed browser QA; commit locally only.

## Information architecture

| Section | Coverage |
| --- | --- |
| Getting Started | Introduction, prerequisites/install, quick start, first project/workflow, auth, authorization, troubleshooting |
| User Guide | CLI/projects, multi-agent workflows/providers, proposals/review, Personal L2/workspaces, Podman, repair, results/recovery/cancellation |
| Architecture | System/packages, agent runtime/orchestration, providers/tools, discovery/profiles, repair/budgets, SQLite/events/recovery/extensibility |
| Security | Trust boundaries, GitHub/Personal/project/human controls, Podman, secrets/audit, threat model, limitations |
| Reference | CLI, public/private configuration boundaries, provider/workflow/patch contracts, profile/repair policies, status/errors |
| Development | Setup/structure/conventions, tests/fixtures/evaluations, providers/agents/tools, adding profile, contributing/docs |
| Releases | Capability matrix, SemVer/compatibility, changelog, process/migration/rollback, beta gate/draft, source audit/history |

Related topics are grouped into useful pages instead of empty one-topic stubs.
`navigation.json` is the complete page inventory and is verified against Markdown.

## Consolidation policy

Reader guides summarize current workflows and link pinned runtime evidence. Historical
security/design/acceptance docs remain in `docs/`; stale instructions receive visible
clarifications. Canonical release checklist/notes remain in `docs/releases/`; portal
release pages link them. Changelog is included from one root source. Private reports,
configurations, journals and acceptance records never enter the portal/index.

See [architecture](phase9d-architecture.md), [verification](phase9d-verification.md)
and [release decision](phase9d-release-readiness.md).
