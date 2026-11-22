import assert from "node:assert/strict";
import test from "node:test";
import type {
  SpanOutcome, TelemetryAttributes, TelemetryBinding, TelemetryObserver,
  TelemetrySpanName, TelemetryEventName, TraceContext,
} from "@ai-harness/contracts";
import { AnthropicProvider, FixtureProvider, OpenAIProvider } from "../index.js";
import { normalizeTokenUsage } from "../telemetry.js";

interface Captured {
  type: "start" | "end" | "event";
  name: string;
  context: TraceContext;
  attributes?: TelemetryAttributes;
  outcome?: SpanOutcome;
}
function capture() {
  const events: Captured[] = [];
  let sequence = 0;
  const observer: TelemetryObserver = {
    trace(executionId) { return { observer, context: { executionId, traceId: executionId } }; },
    startSpan(binding, name: TelemetrySpanName, attributes?: TelemetryAttributes) {
      const context = { ...binding.context, parentSpanId: binding.context.spanId, spanId: "span_" + (++sequence) };
      events.push({ type: "start", name, context, attributes });
      return {
        binding: { observer, context },
        end(outcome) { events.push({ type: "end", name, context, outcome }); },
      };
    },
    event(binding, name: TelemetryEventName, attributes?: TelemetryAttributes) {
      events.push({ type: "event", name, context: { ...binding.context }, attributes });
    },
  };
  return { events, observer, binding: observer.trace("execution_1") };
}
const request = { system: "PRIVATE SYSTEM", prompt: "PRIVATE PROMPT", correlationId: "provider_trace" };
function response(vendor: "openai" | "anthropic", usage?: unknown) {
  return vendor === "openai"
    ? { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "PRIVATE RESPONSE" }] }], ...(usage !== undefined ? { usage } : {}) }
    : { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "PRIVATE RESPONSE" }], ...(usage !== undefined ? { usage } : {}) };
}
function requestEnd(events: Captured[]) {
  return events.filter((event) => event.name === "provider.request" && event.type === "end");
}

test("OpenAI request and HTTP spans nest and record input/cache/reasoning without payloads", async () => {
  const { events, binding } = capture();
  const provider = new OpenAIProvider({
    model: "fixture-model", apiKey: "PRIVATE API KEY",
    fetcher: async () => Response.json(response("openai", {
      input_tokens: 100, output_tokens: 20,
      input_tokens_details: { cached_tokens: 30, cache_write_tokens: 10 },
      output_tokens_details: { reasoning_tokens: 5 },
    })),
  });
  const result = await provider.complete({ ...request, telemetry: binding });
  assert.equal(result.text, "PRIVATE RESPONSE");
  assert.deepEqual(events.map((event) => [event.type, event.name]), [
    ["start", "provider.request"], ["start", "provider.http"],
    ["end", "provider.http"], ["end", "provider.request"],
  ]);
  assert.equal(events[1]!.context.parentSpanId, events[0]!.context.spanId);
  assert.deepEqual(requestEnd(events)[0]!.outcome?.usage, {
    availability: "reported", inputTokens: 100, outputTokens: 20,
    cacheReadTokens: 30, cacheWriteTokens: 10, reasoningTokens: 5,
  });
  assert.equal(events[2]!.outcome?.usage, undefined);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE|authorization|correlationId|prompt|output_text/);
});

test("Anthropic normalizes disjoint cache counts into total input without double counting", async () => {
  const { events, binding } = capture();
  const provider = new AnthropicProvider({
    model: "fixture-model", apiKey: "PRIVATE API KEY",
    fetcher: async () => Response.json(response("anthropic", {
      input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 20,
    })),
  });
  await provider.complete({ ...request, telemetry: binding });
  assert.deepEqual(requestEnd(events)[0]!.outcome?.usage, {
    availability: "reported", inputTokens: 110, outputTokens: 5, cacheReadTokens: 80, cacheWriteTokens: 20,
  });
});

for (const vendor of ["openai", "anthropic"] as const) {
  const Provider = vendor === "openai" ? OpenAIProvider : AnthropicProvider;
  test(vendor + ": unavailable and partial usage are explicit and not invented", async () => {
    for (const [raw, expected] of [
      [undefined, { availability: "unavailable" }],
      [{ input_tokens: 12 }, { availability: "reported", inputTokens: 12 }],
      [{ output_tokens: 0 }, { availability: "reported", outputTokens: 0 }],
      [{ input_tokens: -1, output_tokens: "3" }, { availability: "unavailable" }],
    ] as const) {
      const { events, binding } = capture();
      const provider = new Provider({ model: "fixture-model", apiKey: "test-only", fetcher: async () => Response.json(response(vendor, raw)) });
      await provider.complete({ ...request, telemetry: binding });
      assert.deepEqual(requestEnd(events)[0]!.outcome?.usage, expected);
    }
  });

  test(vendor + ": tool calling captures usage with unchanged neutral turn and isolated identities", async () => {
    const { events, observer } = capture();
    const provider = new Provider({
      model: "fixture-model", apiKey: "test-only",
      fetcher: async () => Response.json(response(vendor, { input_tokens: 7, output_tokens: 4 })),
    });
    const first = { executionId: "execution_a", taskId: "task_a" };
    const second = { executionId: "execution_b", taskId: "task_b" };
    const sessions = [provider.openSession(first), provider.openSession(second)];
    try {
      const turns = await Promise.all([first, second].map((identity, index) => {
        const root = observer.trace(identity.executionId);
        const telemetry: TelemetryBinding = { ...root, context: { ...root.context, taskId: identity.taskId } };
        return sessions[index]!.completeWithTools({
          ...request, tools: [], continuation: { identity, history: [] }, telemetry,
        });
      }));
      assert.deepEqual(turns, [
        { kind: "message", text: "PRIVATE RESPONSE" },
        { kind: "message", text: "PRIVATE RESPONSE" },
      ]);
      assert.deepEqual(requestEnd(events).map((event) => [event.context.executionId, event.context.taskId]).sort(), [
        ["execution_a", "task_a"], ["execution_b", "task_b"],
      ]);
      assert.ok(requestEnd(events).every((event) => event.outcome?.usage?.inputTokens === 7));
      assert.doesNotMatch(JSON.stringify(events), /PRIVATE|history|content/);
    } finally {
      sessions.forEach((session) => session.close());
    }
  });

  test(vendor + ": usage is retained for a paid-but-incomplete tool response", async () => {
    const { events, binding } = capture();
    const incomplete = response(vendor, { input_tokens: 7, output_tokens: 4 });
    const raw = vendor === "openai" ? { ...incomplete, status: "incomplete" } : { ...incomplete, stop_reason: "max_tokens" };
    const provider = new Provider({ model: "fixture-model", apiKey: "test-only", fetcher: async () => Response.json(raw) });
    await assert.rejects(provider.completeWithTools({ ...request, tools: [], telemetry: binding }), /failed tool-calling session/);
    const end = requestEnd(events)[0]!.outcome;
    assert.equal(end?.status, "error");
    assert.equal(end?.errorClass, "invalid_response");
    assert.equal(end?.usage?.inputTokens, 7);
  });
}

test("malformed, overflow and contradictory usage cannot create plausible totals", () => {
  assert.deepEqual(normalizeTokenUsage("openai", { usage: {
    input_tokens: 1, output_tokens: 2,
    input_tokens_details: { cached_tokens: 3 },
    output_tokens_details: { reasoning_tokens: 4 },
  } }), { availability: "reported", cacheReadTokens: 3, reasoningTokens: 4 });
  assert.deepEqual(normalizeTokenUsage("anthropic", { usage: {
    input_tokens: Number.MAX_SAFE_INTEGER, cache_read_input_tokens: 1, output_tokens: 2,
  } }), { availability: "reported", outputTokens: 2, cacheReadTokens: 1 });
  assert.deepEqual(normalizeTokenUsage("anthropic", { usage: {
    input_tokens: 10, cache_read_input_tokens: -1,
  } }), { availability: "unavailable" });
});

test("HTTP error classification is fixed and never leaks upstream body or exception", async () => {
  for (const fetcher of [
    async () => new Response("PRIVATE ERROR", { status: 401 }),
    async () => { throw new Error("PRIVATE ERROR"); },
  ]) {
    const { events, binding } = capture();
    const provider = new OpenAIProvider({ model: "fixture-model", apiKey: "test-only", fetcher });
    await assert.rejects(provider.complete({ ...request, telemetry: binding }));
    assert.equal(requestEnd(events)[0]!.outcome?.status, "error");
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE|stack|message/);
  }
});

test("transport deadline and host cancellation have distinct classifications", async () => {
  const timed = capture();
  const timeoutProvider = new OpenAIProvider({
    model: "fixture-model", apiKey: "test-only", timeoutMs: 10,
    fetcher: async () => new Promise<Response>(() => {}),
  });
  await assert.rejects(timeoutProvider.complete({ ...request, telemetry: timed.binding }), /timed out/);
  assert.equal(requestEnd(timed.events)[0]!.outcome?.status, "timeout");
  assert.equal(requestEnd(timed.events)[0]!.outcome?.errorClass, "timeout");
  const cancelled = capture();
  const controller = new AbortController();
  const provider = new OpenAIProvider({
    model: "fixture-model", apiKey: "test-only",
    fetcher: async () => { controller.abort(); return new Promise<Response>(() => {}); },
  });
  await assert.rejects(provider.complete({ ...request, telemetry: cancelled.binding, signal: controller.signal }), /cancelled/);
  assert.equal(requestEnd(cancelled.events)[0]!.outcome?.status, "cancelled");
});

test("observer exceptions and disabled telemetry preserve provider result and native request", async () => {
  const observed: string[] = [];
  const observer: TelemetryObserver = {
    trace() { throw new Error("PRIVATE observer failure"); },
    startSpan() { throw new Error("PRIVATE observer failure"); },
    event() { throw new Error("PRIVATE observer failure"); },
  };
  const telemetry = { observer, context: { executionId: "execution", traceId: "trace" } };
  const provider = new OpenAIProvider({
    model: "fixture-model", apiKey: "test-only",
    fetcher: async (_url, init) => {
      observed.push(String(init?.body));
      return Response.json(response("openai"));
    },
  });
  assert.deepEqual(await provider.complete(request), await provider.complete({ ...request, telemetry }));
  assert.equal(observed[0], observed[1]);
  assert.doesNotMatch(observed[1]!, /telemetry|traceId|observer/);
});


test("fixture provider reports its explicit synthetic usage without prompts", async () => {
  const { events, binding } = capture();
  const provider = new FixtureProvider();
  assert.equal((await provider.complete({ ...request, telemetry: binding })).model, "fixture");
  assert.deepEqual(requestEnd(events)[0]!.outcome?.usage, {
    availability: "reported", inputTokens: 0, outputTokens: 0,
  });
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE/);
});
