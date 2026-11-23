# Repository map — current source, version 0.8.0

This map describes packages present in the current TypeScript workspace.
Architecture proposals are maintained separately and do not imply that an
unlisted service exists. The integrated baseline is `c87d22f` including PR #3;
final closure evidence on `chore/phase8-final-closure` is local and unmerged.
The inspection composition exposes only `file.read`, even though the tools
package contains other explicitly opt-in host APIs.

| Path | Current responsibility |
|---|---|
| `apps/cli` | `harness` project commands and explicit diagnostics/evaluation commands |
| `packages/application` | Host-owned composition of the bounded read-only inspection workflow |
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
Phase 9 workspace/write/validation capabilities are not implemented; pending
design dependencies are in the [roadmap handoff](ROADMAP.md#phase-9-readiness--design-handoff-only).
