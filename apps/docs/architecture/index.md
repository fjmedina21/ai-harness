# System overview

The local CLI composes a host-owned application layer. Shared contracts define agent tasks, providers, tools, patches, approvals, validation and repair. Implementations remain in their owning packages; no documentation service participates in authorization.

![AI Harness system: trusted CLI composition, agents/providers, mandatory dispatcher and private local state.](/diagrams/system.svg)

## Boundaries

The host selects canonical project roots, providers/models, finite limits, executable paths, allowed tools and required approval. Agents and repository content supply untrusted task data. Provider-native request/result schemas stay inside provider adapters. Tools reach effects only through schema validation, Default Deny, the dispatcher and applicable approval.

`application` composes runtime roles with engineering, Personal approvals, validation and finite repair. `checkpointing` owns SQLite and durable artifacts; `tools` owns filesystem/patch/snapshot/runtime handlers. `security` verifies identity, human intent and authorization services. The portal in `apps/docs` imports no privileged runtime services.

## Monorepo map

| Workspace | Responsibility |
| --- | --- |
| contracts / config / core | Shared types, public project validation and initialization |
| agents / orchestrator / sdd | Role implementations, dependency ordering and proposal stages |
| providers | Fixture, OpenAI and Anthropic adapters |
| tools / security | Handler admission, dispatcher, policies, identity and grants |
| checkpointing | File checkpoints, SQLite journal and private evidence |
| application | Trusted workflow composition and repair coordination |
| observability / evaluations | Bounded diagnostics and deterministic fixtures |
| apps/cli / apps/docs | Operational entry point / static documentation |

The [runtime](./runtime.md), [validation](./validation.md) and [persistence](./persistence.md) guides describe actual behavior. Remote execution, multiuser administration and autonomous integration are deferred or outside scope.

## Source and evidence

[docs/ARCHITECTURE.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/ARCHITECTURE.md), [tsconfig.json](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/tsconfig.json), [packages/application/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/application/src/index.ts).
