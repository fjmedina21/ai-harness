# Provider abstraction and tool registry

`ModelProviderAdapter.complete()` remains the compatible text interface. Optional tool-calling sessions normalize native requests, calls/results and continuation into shared contracts. OpenAI and Anthropic wire formats never enter tool handlers or agent policy.

![Provider-neutral request and session boundary around vendor adapters.](/diagrams/providers.svg)

## Correlation and bounded continuation

Native call IDs are preserved and correlated exactly with tool results. Missing, duplicate or mismatched IDs fail; denied/unexecuted operations cannot become successful continuation data. Histories, turns, calls, response bodies and time are finite. Transport failure is sanitized and cancellation propagates. Sessions must close without implicit retry.

## Mandatory dispatch boundary

The registry describes definitions and validates argument schema. The host chooses `allowedToolIds`, permissions and handlers. `ToolDispatcher` combines validation, policy and any scoped approval before handler dispatch. Registration alone never grants authority.

The read-only factory exposes `file.read` and optional host-selected `git.status`; no privileged handlers are registered there. Other host APIs such as create-only `file.write` and fixed command/container paths are separate explicit integrations. Declared shell/Git/deployment permission names do not imply unrestricted execution.

Filesystem path checks retain documented TOCTOU risks; registry/schema validation cannot establish OS isolation.

## Source and evidence

[packages/contracts/src/tool-calling.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/tool-calling.ts), [packages/providers/src/tool-session.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/providers/src/tool-session.ts), [packages/tools/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/index.ts), [packages/tools/src/dispatcher.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/dispatcher.ts), [docs/phase4-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase4-security.md).
