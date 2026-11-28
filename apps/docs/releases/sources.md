# Documentation source audit and history

## Authority and version awareness

This portal describes local candidate version **0.9.0-beta.1**, with historical runtime baseline
`def9a987ff8d449402a67d0dcb58a8420709f68e`. Runtime source/evidence links are pinned
to that reviewed commit where possible; current decision records target the proposed
`v0.9.0-beta.1` tag and become available remotely only after authorized tag publication.
A source link is traceability, not proof that current private acceptance is valid.

The audit inspected all existing public documents by headings/status and read the
operational, security, CLI, acceptance and Phase 9C sources in detail. Code and tests
resolve conflicts. No historical document was removed. Seven superseded/qualified
sources now carry a status clarification; their original content remains intact.

## Important corrections

- Historical independent-approver text is superseded by exact same-owner Personal L2.
- Earlier unavailable L3/snapshot-transfer text is superseded by implemented 9B and
  its restricted historical acceptance; current acceptance must still revalidate.
- A v3 migration runbook does not preclude the separately opt-in v4 repair schema.
- Phase 9C.1 isolation-only probes do not establish a real repair cycle. The public
  safe summary is in the Phase 9D verification record; private evidence is excluded.
- Historical CI success, local test success and current candidate CI are different facts.

## Source inventory

| Public source | Classification | Reader guidance |
| --- | --- | --- |
| [docs/ARCHITECTURE.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/ARCHITECTURE.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/DEDICATED-PODMAN-RUNNER.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/DEDICATED-PODMAN-RUNNER.md) | Deferred | Remote runner runbook is preparation, not remote acceptance. |
| [docs/PHASE-0.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/PHASE-0.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/RELEASE-CHECKLIST.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/RELEASE-CHECKLIST.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/REPOSITORY.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/REPOSITORY.md) | Superseded or qualified snapshot | Historical repository map. The current source also includes Phase 9C repair/discovery/profile modules and Phase 9D documentation; old branch/timeout descriptions are snapshots. |
| [docs/ROADMAP.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/ROADMAP.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/VERIFICATION.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/VERIFICATION.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/VERSIONING.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/VERSIONING.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/history/architecture-before-single-developer.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/history/architecture-before-single-developer.md) | Archived historical | Preserved for provenance; not an operational runbook. |
| [docs/history/phase9-acceptance-before-single-developer.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/history/phase9-acceptance-before-single-developer.md) | Archived historical | Preserved for provenance; not an operational runbook. |
| [docs/history/phase9-e2e-before-single-developer.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/history/phase9-e2e-before-single-developer.md) | Archived historical | Preserved for provenance; not an operational runbook. |
| [docs/history/phase9-l2-original-design.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/history/phase9-l2-original-design.md) | Archived historical | Preserved for provenance; not an operational runbook. |
| [docs/history/verification-before-single-developer.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/history/verification-before-single-developer.md) | Archived historical | Preserved for provenance; not an operational runbook. |
| [docs/phase2-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase2-security.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase3-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase3-security.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase4-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase4-security.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase5-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase5-security.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase6-durable-execution.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase6-durable-execution.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase6-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase6-security.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase7-evaluations.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase7-evaluations.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase7-observability.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase7-observability.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase7-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase7-security.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase8-e2e.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase8-e2e.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase8-integration.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase8-integration.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase8-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase8-security.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase9-architecture.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-architecture.md) | Superseded or qualified snapshot | Historical Phase 9 design snapshot. Its unavailable L3/snapshot-transfer statements were superseded by Phase 9B. Current exact acceptance still requires fresh evidence. |
| [docs/phase9-autonomy-levels.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-autonomy-levels.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-e2e.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-e2e.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-github-app-setup.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-github-app-setup.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-github-authentication.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-github-authentication.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-l2-approval-resume-design.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-l2-approval-resume-design.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-live-smoke.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-live-smoke.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase9-operational-l2.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-operational-l2.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-patch-engine.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-patch-engine.md) | Superseded or qualified snapshot | Historical approval description. The current Personal protocol requires the same verified owner as requester and approver with exact native human review. |
| [docs/phase9-personal-mode.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-personal-mode.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-provider-integration.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-provider-integration.md) | Superseded or qualified snapshot | Historical integration snapshot. Protected CLI approval/continuation and Phase 9B validation were added later; Anthropic engineering remains deferred. |
| [docs/phase9-real-acceptance-report.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-real-acceptance-report.md) | Historical restricted live acceptance | Exact original scope only; changed code/expiry blocks reuse. |
| [docs/phase9-sandbox-validation.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-sandbox-validation.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-security.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9-workspaces.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9-workspaces.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/phase9a-performance.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9a-performance.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase9a-timeout-budget-policy.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9a-timeout-budget-policy.md) | Historical milestone / reusable controls | Retain evidence and security limits; reconcile with current code. |
| [docs/phase9b-e2e.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9b-e2e.md) | Historical restricted live acceptance | Exact original scope only; changed code/expiry blocks reuse. |
| [docs/phase9b-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9b-security.md) | Superseded or qualified snapshot | Historical Phase 9B security snapshot. Later restricted Gate C evidence and offline-verified Phase 9C repair supersede its pending-design statements. |
| [docs/phase9b-snapshot-transfer.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9b-snapshot-transfer.md) | Superseded or qualified snapshot | Historical transfer acceptance snapshot. Later Gate C acceptance was restricted to exact fixed Node scope and is not transferable to changed code. |
| [docs/phase9b-validation-runtime.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9b-validation-runtime.md) | Historical restricted live acceptance | Exact original scope only; changed code/expiry blocks reuse. |
| [docs/phase9c-architecture.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9c-architecture.md) | Implemented / offline verified | Scoped local repair E2E passed 2026-11-27; no universal toolchain acceptance. |
| [docs/phase9c-cli.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9c-cli.md) | Implemented / offline verified | Scoped local repair E2E passed 2026-11-27; no universal toolchain acceptance. |
| [docs/phase9c-e2e.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9c-e2e.md) | Implemented / offline verified | Scoped local repair E2E passed 2026-11-27; no universal toolchain acceptance. |
| [docs/phase9c-project-discovery.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9c-project-discovery.md) | Implemented / offline verified | Scoped local repair E2E passed 2026-11-27; no universal toolchain acceptance. |
| [docs/phase9c-repair-policy.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9c-repair-policy.md) | Implemented / offline verified | Scoped local repair E2E passed 2026-11-27; no universal toolchain acceptance. |
| [docs/phase9c-security.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9c-security.md) | Implemented / offline verified | Scoped local repair E2E passed 2026-11-27; no universal toolchain acceptance. |
| [docs/phase9c-state-machine.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9c-state-machine.md) | Implemented / offline verified | Scoped local repair E2E passed 2026-11-27; no universal toolchain acceptance. |
| [docs/phase9c-validation-profiles.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9c-validation-profiles.md) | Implemented / offline verified | Scoped local repair E2E passed 2026-11-27; no universal toolchain acceptance. |
| [docs/phase9d-release-readiness.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9d-release-readiness.md) | Current Phase 9D decision record | Candidate status; verification is local until publication is authorized. |
| [docs/project-authorization.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/project-authorization.md) | Current experimental / scoped | Use with code and current verification; older subsection snapshots remain historical. |
| [docs/releases/beta-release-checklist.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/releases/beta-release-checklist.md) | Current Phase 9D decision record | Candidate status; verification is local until publication is authorized. |
| [docs/releases/v0.9.0-beta.1-draft.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/releases/v0.9.0-beta.1-draft.md) | Current Phase 9D decision record | Candidate status; verification is local until publication is authorized. |
| [docs/single-developer-migration.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/single-developer-migration.md) | Superseded or qualified snapshot | This runbook describes the v3 single-owner migration. Phase 9C separately installs opt-in repair schema v4; no automatic approval conversion is introduced. |

| [docs/phase9d-architecture.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9d-architecture.md) | Current Phase 9D | Local candidate evidence; no publication implied. |
| [docs/phase9d-documentation-plan.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9d-documentation-plan.md) | Current Phase 9D | Local candidate evidence; no publication implied. |
| [docs/phase9d-verification.md](https://github.com/fjmedina21/ai-harness/blob/v0.9.0-beta.1/docs/phase9d-verification.md) | Current Phase 9D | Local candidate evidence; no publication implied. |

The [capability matrix](./capabilities.md) is the reader entry point for operational
claims. The repository verification ledger preserves specific counts and outcomes.
