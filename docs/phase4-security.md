# Phase 4 — tool calling, continuation and security

> Historical Phase 4 review. Phase 6 later added the opt-in SQLite operation
> journal and transactional approvals; Phase 7 added opt-in telemetry and
> deterministic evaluations. Statements below about missing capabilities and
> remote CI describe the Phase 4 snapshot. Current evidence is in
> [verification](VERIFICATION.md).

## Scope and evidence

Experimental implementation of OpenAI Responses and Anthropic Messages client
tools. Validation uses mocked HTTP with native protocol fixtures; filesystem
and Git integration tests use real temporary projects and the real dispatcher.
No paid API calls or real credentials are part of mandatory tests/CI.
This does not establish live model/API compatibility or production safety.

## Continuation contract

`ModelToolRequest` adds optional `continuation` and `signal`; `ModelRequest`
also accepts an optional signal. Existing `complete()` and scripted
`completeWithTools()` providers remain compatible.

### Neutral history

The host supplies a stable `{ executionId, taskId }` for the task;
`correlationId` remains a per-request trace identifier. `ToolCallingSession`
retains neutral model turns and trusted-host dispatch result batches only.

Before new work use `assertActive()`; before a model turn use `continuation()`.
`recordTurn(identity, raw)` parses untrusted output. `recordResults(identity,
results)` accepts exactly one result for every pending call, including matching
tool IDs. Result order may vary; missing, extra, foreign and duplicate results,
and repeated call IDs across turns are rejected without committing the batch.
A final model message is blocked while results are missing. Non-executed
results cannot become success and block continuation.

`parseToolCallingContinuation(raw, expectedIdentity)` revalidates the transcript
without dispatching anything. Pass the bound host identity at every adapter
boundary. `snapshot()` permits inspection of pending/blocked/final state but
is not a continuation grant. Sessions cannot continue after a final message.

Result provenance remains a host responsibility: structural validation cannot
prove an operation happened. Only trusted dispatcher results may be recorded;
the contract is not an authenticated channel or an authorization mechanism.

### Session lifecycle and limits

Hard ceilings: 5 model turns, 16 total calls, 8 calls per turn, 16,384 UTF-8
bytes per result envelope, 262,144 bytes of serialized neutral history. Host
options may lower session budgets. Tool-call turns must leave a turn for results.
Inputs, identities and returned snapshots do not share mutable state.

`close()` is idempotent, releases retained history/signal and prevents reuse.
Cancellation blocks subsequent transitions without undoing started operations.
The host closes both neutral and native sessions in `finally` on every exit.

`ProviderToolCallingSession` / `SessionToolCallingProviderAdapter` add explicit
native session support. Each adapter session has separate private native state
and a native/configuration budget of at most 262,144 serialized UTF-8 bytes.
No vendor schemas appear in neutral history, agents or dispatcher.

The native session validates the supplied neutral prefix against the turns it
actually returned; arbitrary caller-supplied past model turns cannot bootstrap
or replace native state. The system prompt, original prompt and tool specs are
fixed for the session. Dual `continuation` plus legacy `toolResults` is rejected.
`completeWithTools()` on a real adapter is a one-shot initial turn only; use
`openSession()` for continuation. Scripted legacy providers keep their existing
result-only behavior; no native history is fabricated from results alone.


## Explicit host opt-in

The CLI/SDD defaults are unchanged. A trusted host can use:

```ts
import { OpenAIProvider } from "@ai-harness/providers";
import { createReadOnlyToolCallingAgent } from "@ai-harness/agents";

const provider = new OpenAIProvider({ model: hostSelectedModel });
const agent = createReadOnlyToolCallingAgent({
  role: "software-architect",
  systemPrompt: "Review architecture using verified tool data.",
  provider, // AnthropicProvider supports the same contracts
  requireApprovalFor: [], // trusted host policy; may require approvals for reads
  // git: { executable: hostSelectedAbsoluteGitPath }, // optional
});
const result = await agent.execute(hostTask, {
  executionId: hostExecutionId,
  projectRoot: hostProjectRoot,
  model: provider,
  grantedPermissions: ["files:read"],
  signal: hostAbortController.signal,
});
```

All `host...` values above are supplied by the trusted application, never the
model or repository content. Credentials are read from host options or the
provider's environment variable; no credentials are logged, written or embedded
in tests. Reading project files sends their contents to the selected provider;
local-first does not mean those contents remain offline. The host must opt in
with an appropriate workspace and allowlist. Filename filters cannot detect all
secrets. No network call runs merely by constructing the provider/agent.

The factory registers only `file.read` and optionally `git.status`. It has no
write, shell, container, deployment or approval-management handler. Permissions
and approval policy still apply through ToolDispatcher. The lower-level
ToolCallingAgent remains configurable by trusted host code; it is not an
additional sandbox or privilege restriction for a malicious host.

## Native request/result translation

Tool names use a deterministic SHA-256-derived wire alias with collision and
duplicate checks, avoiding lossy `file.read`/`file_read` substitutions. Schemas
are mapped to OpenAI `parameters` / Anthropic `input_schema`; registry validation
is still mandatory. OpenAI uses explicit `strict: false` to preserve the
existing schema semantics, including optional fields, without silently changing
the shared contract. JSON Schema is not authorization.

OpenAI `function_call.call_id` maps to neutral `id`, not the output item's `id`.
Results use `function_call_output.call_id`. With `store: false`, the private
session replays the native output sequence, including encrypted reasoning
items requested with `include: ["reasoning.encrypted_content"]`. Non-replayable
reasoning is rejected. No server-side continuation IDs or conversation store
are required.

Anthropic `tool_use.id` maps to neutral `id`; `input` remains an object.
The native assistant content is preserved, followed immediately by one user
message containing all `tool_result` blocks matched by `tool_use_id`.
Non-executed results stop the loop; no success or substitute result is invented.

Both adapters reject incomplete/truncated responses, refusals, unknown tool
names, malformed JSON arguments, duplicate/invalid call IDs, excessive calls,
unsupported content blocks and server tools. Anthropic extended thinking and
other optional native modes are not enabled. Multiple calls are supported in
one response but tools execute sequentially after whole-batch validation.

Protocol references consulted during implementation:
[OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [Anthropic tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).

## Transport and session boundaries

- Fixed official endpoints; redirect following disabled; no automatic retries.
- 30-second deadline covering fetch and streamed body reads.
- 1,048,576 UTF-8 bytes each for request and response; body byte counting works
  without Content-Length and rejects false/oversized lengths.
- At most 4,096 generated tokens per tool-calling response; host may lower it.
- Neutral/native memory limits and strict correlation follow the
  [continuation contract](#continuation-contract) above.
- Concurrent requests on the same session are rejected; independent sessions
  have no shared native cache. Error paths close the session; retrying a failed
  turn cannot silently replay uncertain work.
- Session close/caller abort aborts HTTP, clears retained state and prevents
  new tools/model requests. HTTP failures expose only safe diagnostics; upstream
  bodies, transport exceptions, tool data and credentials are not returned as errors.

Budgets bound retained serialized data, not exact V8 heap/RSS. Temporary parsing,
serialization and copies add memory overhead; injected fetchers/handlers are
trusted host code. A malicious fetcher can allocate an oversized chunk before
returning it. Caller-supplied histories are in-process data, not a secure public
network endpoint.

## Remaining limitations

Cancellation cannot undo a completed tool or a remote provider request that
already started. It does not forcibly stop an existing file/Git handler; no new
operation starts after cancellation is observed. Approval-required execution
stops as a failed agent result; no approval resumption is implemented.

No durable native provider sessions, automatic task recovery, exactly-once
semantics or authenticated result provenance. The Phase 2/3 filesystem TOCTOU,
identity and legacy in-memory approval limitations still apply to those paths.
Live API tests require a separate explicit credential/cost decision. At this
Phase 4 candidate snapshot, remote CI was pending authorized publication; the
later Phase 7 standard CI result does not establish live-provider compatibility.

Current container execution is Podman-only; see [runtime migration](phase5-security.md).
