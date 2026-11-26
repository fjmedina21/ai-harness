# Adding a provider, agent or tool

## Add a provider

Implement compatible `ModelProviderAdapter.complete()` in `packages/providers`. Keep credentials host-supplied, vendor wire schemas private, requests/responses bounded, cancellation propagated and diagnostics sanitized. Tool-calling is additive: preserve exact call IDs, neutral results and bounded multi-turn continuation. Close sessions and reject incomplete/duplicate correlation. Use mocked request/response contract tests; real provider acceptance is a separate explicitly authorized gate.

Export the adapter through its package index and compose it only through explicit host selection. Do not change the default fixture workflow or silently add retries/fallbacks.

## Add an agent

Implement `Agent` descriptor/execute in the owning agent package; register through the trusted orchestrator/application composition. Review role catalog/config validation, dependencies, exports and task acceptance criteria. Bound context/provider calls and propagate AbortSignal. Test ordering, malformed output, denial, budget and cancellation behavior. An agent role never grants tool permissions.

## Add a tool

Define shared contracts in `contracts`; definition/schema/handler in `tools`. Register only from the trusted host. Validate input and bound paths/bytes/time/output before dispatch. Route every effect through `ToolDispatcher`, Default Deny and required approval. Never expose policy editing, arbitrary shell, Keychain/journal access or self-approval to model content.

Add negative tests for unknown tool IDs, malformed schema, disallowed permission/root, approval mismatch/replay/expiry, cancellation and sanitized failure. Privileged operations require a threat-model update and separate live acceptance where relevant. Merely registering a handler does not make it operationally accepted.

## Source and evidence

[packages/contracts/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/index.ts), [packages/contracts/src/runtime.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/runtime.ts), [packages/contracts/src/tool-calling.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/tool-calling.ts), [packages/providers/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/providers/src/index.ts), [packages/tools/src/dispatcher.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/dispatcher.ts).
