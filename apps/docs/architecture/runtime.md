# Agent runtime and orchestration

An `Agent` has a descriptor and asynchronous `execute(context)` operation. A runtime task names a role, dependencies, risk and acceptance criteria. The orchestrator owns registration, dependency validation, state transitions and checkpoint saves.

![Sequential multi-agent roles producing a proposal before a human-approved effect.](/diagrams/workflow.svg)

## Ordering and state

Tasks run in dependency order, not arbitrary model-selected parallelism. Duplicate/cyclic dependencies and unknown role bindings fail. Previous outputs can be passed to dependent tasks. Execution/task lifecycle events report progress and finalization; a checkpoint persists observed state.

`PromptAgent` uses completion text. `ToolAugmentedAgent` adds explicit host-selected context. `ToolCallingAgent` uses bounded neutral turns/calls and stops when approval is required. None may register new handlers, grant itself permissions or read arbitrary private host data.

## Extensibility

Add contracts in `contracts`, an agent implementation in `agents` and host composition in `application`. Preserve the completion interface and default CLI behavior. New roles need config/export/test review. A descriptor capability label is not permission to execute a tool.

Events and telemetry do not override journal state. Provider sessions are not a durable resumable authority, and there is no production distributed scheduler or general remote agent fleet.

## Source and evidence

[packages/contracts/src/runtime.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/runtime.ts), [packages/orchestrator/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/orchestrator/src/index.ts), [packages/agents/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/agents/src/index.ts), [packages/contracts/src/runtime.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/runtime.ts).
