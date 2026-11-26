# Multi-agent workflows

AI Harness registers role-based agents and runs tasks sequentially in dependency order. It rejects duplicate task IDs, missing agents and cycles. Earlier outputs become bounded context for later tasks. A role name describes responsibility, not authorization.

![Multi-agent proposal workflow, ending at an independent human review gate.](/diagrams/workflow.svg)

## Existing compositions

The default SDD workflow models requirements, specification, planning, implementation and validation proposals. The inspection composition runs planner, code-reviewer and validator with bounded read-only tools. Engineering composes proposal roles and advisory review through `EngineeringAgentPort`; the repair agent specializes the same provider-neutral port.

The implementer returns a structured patch. Policy validation and advisory review are separate from executing a compiler or test suite. A validator message saying “passed” is not durable Podman evidence.

## Human checkpoints

Isolated engineering stops before applying a patch. A subsequent Personal L2 grant permits only the exact private-copy operation. Another approval is needed for the exact sandbox action. Every repair iteration repeats both gates. The orchestrator cannot approve itself or turn untrusted project instructions into host policy.

The [repair guide](./repair.md) explains finite continuation; [results](./results.md) explains uncertain effects and cancellation.

## Source and evidence

[packages/orchestrator/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/orchestrator/src/index.ts), [packages/sdd/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/sdd/src/index.ts), [packages/application/src/engineering.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/application/src/engineering.ts), [packages/application/src/repair.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/application/src/repair.ts).
