# Provider configuration

Provider identity, model, endpoint behavior, credentials and budgets are host selections. Project content never chooses a provider or raises a ceiling. The default CLI uses the offline fixture provider.

## Supported paths

| Composition | Provider selection | Evidence boundary |
| --- | --- | --- |
| Default SDD | Fixture | Deterministic proposal flow |
| Inspection | Fixture, OpenAI, Anthropic | Offline suites; historical live smokes have their own outcomes |
| Engineering / repair CLI | Fixture, OpenAI | Anthropic engineering is deferred |
| Programmatic tool calls | OpenAI Responses, Anthropic Messages | Shared neutral contracts; mocked wire tests do not prove live acceptance |

## Explicit real-provider inspection

```sh
pnpm harness run --workflow inspect --path /ABSOLUTE/DEMO   --request "Review API validation" --provider openai --model HOST_SELECTED_MODEL   --max-output-tokens 256 --max-provider-requests 6 --confirm-provider-call
```

This example can incur charges. Supply credentials only through the secure host environment (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`); `.env` files are not implicitly loaded. Documentation builds and mandatory tests use no real credentials.

Budgets bound output tokens per request and total request count. They are not exact dollar caps. Engineering additionally requires explicit unknown-cost acknowledgment. Optional private host rates produce estimates, not invoices; unavailable usage/cost remains unknown.

## Continuation and cancellation

Tool-call sessions correlate exact native call IDs with neutral results and reject duplicate/missing results. Provider transport bounds bodies and deadlines; no implicit retry or fallback is enabled. Apply-only `engineering continue` makes zero model calls. Cancellation cannot roll back a provider request already sent. See [contracts](../reference/contracts.md).

## Source and evidence

[packages/providers/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/providers/src/index.ts), [packages/providers/src/transport.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/providers/src/transport.ts), [packages/providers/src/tool-session.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/providers/src/tool-session.ts), [docs/phase9-provider-integration.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-provider-integration.md).
