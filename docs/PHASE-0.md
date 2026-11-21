# Phase 0 — Implementation and acceptance evidence

## Scope

The operational core is deliberately limited to project initialization and validation. No LLM/provider calls or code execution exist yet. The 10 chosen MVP acceptance criteria are **Phase 1 goals**, not Phase 0 completion claims.

## Working contracts

- `ModelProviderAdapter`, `ToolAdapter`, `CheckpointStore`, `PolicyEngine` are TypeScript interfaces for subsequent phases.
- `TaskDefinition`, `ExecutionRecord`, `ApprovalRequest`, `AgentDescriptor` define domain boundaries.
- `HarnessConfig` schema version 1 validates role IDs, project name, workflow name, and denied-by-default permission declarations.
- `init` does not overwrite managed files; no `--force` bypass is provided.

## Phase 0 verification

1. `pnpm build` TypeScript project references.
2. `pnpm test` with Node's test runner for configs, initialization, dry-run, overwrite protection, CLI commands.
3. CLI smoke test in `.github/workflows/ci.yml`.
4. `pnpm harness doctor --path <project>` verifies schema, agent descriptors and default workflow declaration.

## Design constraints

- This phase stores config in `.ai/config.json`, which is part of the previously chosen files-as-truth strategy. YAML may be supported in a future parser plugin.
- `.ai/state` and `.ai/checkpoints` remain ignored to avoid leaking sensitive runtime data in commits.
- Phase 0 security config is descriptive only; enforcement comes with the execution runtime.
- No source maps, build artifacts or dependencies are distributed in the source ZIP.

## Next increment

Phase 1 should add a dry-run orchestrator with deterministic mock provider, real provider adapter(s) behind safe permission checks, task state transitions, persisted checkpoints and end-to-end acceptance tests.
