# AI Harness — Phase 0 (foundation)

Local-first, provider-agnostic TypeScript monorepo. This is a **working foundation**, not an AI agent runtime yet.

## Requirements

- Node.js >= 22
- pnpm 10 (`corepack enable && corepack prepare pnpm@10.11.0 --activate`, or install pnpm separately)

## Quick start

```bash
pnpm install
pnpm build
pnpm test
pnpm harness --help
pnpm harness init --path ./examples/demo-project --name demo-project
pnpm harness doctor --path ./examples/demo-project
pnpm harness agents --path ./examples/demo-project
pnpm harness config --path ./examples/demo-project
```

> `pnpm install` requires access to the npm registry for dev dependencies. The ZIP excludes node_modules and compiled dist; build it after installation.

## Phase 0 working functionality

- Four TypeScript workspace packages: contracts, config, core and CLI.
- Versioned configuration schema and validation (JSON, no hidden defaults).
- Safe, no-overwrite `.ai/` project initialization with dry-run.
- 15 agent role declarations and a declarative SDD workflow.
- Working `doctor`, `agents`, `config`, `help`, and `version` commands.
- Node built-in test runner; GitHub Actions CI.

## Intentionally not implemented in Phase 0

- AI provider integrations, token calls or model routing.
- Runtime agent execution, real SDD generation, task scheduling and retries.
- Sandbox execution, persistent database, authentication or dashboard.
- CI/CD deployment automation or production security guarantees.

**Do not use this foundation as an autonomous executor or production authorization boundary.** Phase 0 policies are typed declarations, not a secure enforcement layer.

## Design

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/REPOSITORY.md`](docs/REPOSITORY.md) and [`docs/PHASE-0.md`](docs/PHASE-0.md).

## Package layout

```text
apps/cli/            Executable commands
packages/contracts/  Shared domain contracts
packages/config/     Config types, defaults, validation
packages/core/       Non-destructive project initializer and inspector
```

The broader architecture directories will be added as implemented; they are not shipped as empty pretend-functional packages.
