# Repository map — current source, version 0.8.0

This map describes packages present in the current TypeScript workspace.
Architecture proposals are maintained separately and do not imply that an
unlisted service exists. The starting main baseline is `fdcb1130e91a`; this
Phase 9 feature branch remains local, with no new hosted CI or publication.
The inspection composition exposes only `file.read`, even though the tools
package contains other explicitly opt-in host APIs.

| Path | Current responsibility |
|---|---|
| `apps/cli` | `harness` project commands and explicit diagnostics/evaluation commands |
| `packages/application` | Host-owned inspection and opt-in isolated engineering composition |
| `packages/contracts` | Shared runtime, provider, tools, durable operation and telemetry contracts |
| `packages/config` | Project configuration validation and defaults |
| `packages/core` | Project initialization and inspection |
| `packages/orchestrator` | Sequential dependency-aware task coordination and checkpoints |
| `packages/providers` | Fixture, OpenAI Responses and Anthropic Messages adapters |
| `packages/agents` | Prompt, tool-augmented and tool-calling agents |
| `packages/sdd` | Requirements/specification/planning/implementation/validation proposal workflow |
| `packages/security` | Default Deny policy and trusted-host approval identity helpers |
| `packages/checkpointing` | File checkpoints, SQLite durable operation journal and recovery inspection |
| `packages/tools` | Registry, dispatcher, approval handling, controlled tools and Podman runtime |
| `packages/observability` | Bounded telemetry sessions, sinks, traces and aggregate metrics |
| `packages/evaluations` | Deterministic host-authored evaluation scenarios and reports |

The root `tsconfig.json` references these workspace projects. All packages use
TypeScript, NodeNext ESM and Node's built-in test runner. See [architecture](ARCHITECTURE.md)
for the long-term design (some of which remains aspirational), [roadmap](ROADMAP.md)
for phase status and [verification](VERIFICATION.md) for test evidence.
The dedicated Podman [workflow](../.github/workflows/phase5-isolation.yml) and
[runner runbook](DEDICATED-PODMAN-RUNNER.md) are integrated preparation; remote
validation remains deferred. No runner is configured by this closure.
Phase 9 adds experimental isolated engineering modules; see the
[capability matrix](phase9-autonomy-levels.md). The existing inspection composition
retains its read-only profile; new tools are separate opt-in host bindings.

## Phase 9 modules on the feature branch

- contracts/engineering.ts: levels, states, patches, policy, budgets and evidence.
- tools/engineering-workspace.ts, engineering-patches.ts: private-copy lifecycle and
  structured changes; engineering-cleanup.ts and engineering-recovery.ts are host-only.
- tools/engineering-validation.ts: fixed command descriptions and disabled real Podman port.
- checkpointing/engineering-checkpoint.ts: bounded append-only private metadata snapshots.
- orchestrator/engineering-plan.ts: sequential reuse of existing roles.
- application/engineering.ts and engineering-fixture.ts: bounded host composition and offline recipe.
- apps/cli/src/engineering-cli.ts: opt-in fixture propose / isolated approval-pending workflow.
- evaluations/phase9.ts: separate deterministic suite; evaluations now depends on application.

No new third-party dependency/runtime/framework or version bump. The lockfile adds
only the internal application workspace edge used by evaluations.
