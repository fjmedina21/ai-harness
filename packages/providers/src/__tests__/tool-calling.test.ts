import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIProvider, AnthropicProvider } from "../index.js";
import { ToolCallingSession } from "@ai-harness/contracts";
import type { ModelToolRequest, ModelToolTurn } from "@ai-harness/contracts";

const identity = { executionId: "execution_1", taskId: "task_1" };
const tools: ModelToolRequest["tools"] = ["file.read", "git.status"].map(
  (id) => ({
    id,
    description: id,
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  }),
);
const request: ModelToolRequest = {
  system: "host",
  prompt: "inspect",
  correlationId: "trace_1",
  tools,
};
type Body = Record<string, any>;

for (const vendor of ["openai", "anthropic"] as const) {
  const Provider = vendor === "openai" ? OpenAIProvider : AnthropicProvider;
  function nativeCalls(
    body: Body,
    ids = ["call_1"],
    overrides: Body = {},
  ): Body {
    const content = ids.map((id, index) =>
      vendor === "openai"
        ? {
            type: "function_call",
            id: `fc_${id}`,
            call_id: id,
            name: body.tools[index % 2].name,
            arguments: "{}",
            status: "completed",
          }
        : { type: "tool_use", id, name: body.tools[index % 2].name, input: {} },
    );
    return vendor === "openai"
      ? { status: "completed", output: content, ...overrides }
      : { role: "assistant", stop_reason: "tool_use", content, ...overrides };
  }
  function final() {
    return vendor === "openai"
      ? {
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "Done" }],
            },
          ],
        }
      : {
          role: "assistant",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Done" }],
        };
  }
  const bodyOf = (init?: RequestInit): Body => JSON.parse(String(init?.body));
  const first = () => ({ ...request, continuation: { identity, history: [] } });

  test(`${vendor}: native schemas and wire names translate without leaking dotted IDs`, async () => {
    const provider = new Provider({
      model: "test-model",
      apiKey: "test-only",
      fetcher: async (url, init) => {
        const body = bodyOf(init);
        assert.equal(body.model, "test-model");
        assert.match(
          String(url),
          vendor === "openai"
            ? /api.openai.com\/v1\/responses$/
            : /api.anthropic.com\/v1\/messages$/,
        );
        assert.match(body.tools[0].name, /^[a-zA-Z0-9_-]+$/);
        assert.notEqual(body.tools[0].name, body.tools[1].name);
        assert.deepEqual(
          vendor === "openai"
            ? body.tools[0].parameters
            : body.tools[0].input_schema,
          tools[0]!.inputSchema,
        );
        if (vendor === "openai") {
          assert.equal(body.store, false);
          assert.equal(body.tools[0].strict, false);
        }
        return Response.json(nativeCalls(body));
      },
    });
    const turn = await provider.completeWithTools(request);
    assert.deepEqual(turn, {
      kind: "tool_calls",
      calls: [{ id: "call_1", toolId: "file.read", arguments: {} }],
    });
  });

  test(`${vendor}: two multi-call batches continue with exact native IDs and preserved content`, async () => {
    const bodies: Body[] = [];
    const natives: unknown[] = [];
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        const body = bodyOf(init);
        bodies.push(body);
        if (bodies.length === 3) return Response.json(final());
        const response = nativeCalls(
          body,
          bodies.length === 1 ? ["call_1", "call_2"] : ["call_3"],
        );
        const array = vendor === "openai" ? response.output : response.content;
        if (vendor === "openai")
          array.unshift({
            type: "reasoning",
            id: `rs_${bodies.length}`,
            summary: [],
            encrypted_content: "opaque-fixture",
          });
        else array.unshift({ type: "text", text: "Inspecting" });
        natives.push(structuredClone(array));
        return Response.json(response);
      },
    });
    const session = provider.openSession(identity);
    const host = new ToolCallingSession(identity);
    try {
      for (let i = 0; i < 3; i++) {
        const turn = await session.completeWithTools({
          ...request,
          correlationId: `trace_${i}`,
          continuation: host.continuation(),
        });
        host.recordTurn(identity, turn);
        if (turn.kind === "tool_calls")
          host.recordResults(
            identity,
            [...turn.calls].reverse().map((call) => ({
              callId: call.id,
              toolId: call.toolId,
              status: "executed",
              data: { content: "untrusted data" },
            })),
          );
        else assert.equal(turn.text, "Done");
      }
      const input =
        vendor === "openai" ? bodies[1]!.input : bodies[1]!.messages;
      if (vendor === "openai") {
        assert.deepEqual(input.slice(1, 4), natives[0]);
        assert.deepEqual(
          input.slice(4).map((item: Body) => item.call_id),
          ["call_2", "call_1"],
        );
        assert.equal(input[4].type, "function_call_output");
      } else {
        assert.deepEqual(input[1].content, natives[0]);
        assert.deepEqual(
          input[2].content.map((item: Body) => item.tool_use_id),
          ["call_2", "call_1"],
        );
        assert.ok(
          input[2].content.every((item: Body) => item.type === "tool_result"),
        );
      }
      assert.equal(bodies.length, 3);
    } finally {
      session.close();
      host.close();
    }
  });

  test(`${vendor}: missing, duplicate, foreign or rewritten continuation never reaches HTTP`, async () => {
    for (const mode of [
      "missing",
      "duplicate",
      "foreign",
      "rewrite",
      "identity",
      "dual",
    ]) {
      let calls = 0;
      const provider = new Provider({
        model: "test",
        apiKey: "test-only",
        fetcher: async (_url, init) => {
          calls++;
          return Response.json(nativeCalls(bodyOf(init), ["call_1", "call_2"]));
        },
      });
      const session = provider.openSession(identity);
      const host = new ToolCallingSession(identity);
      const turn = await session.completeWithTools(first());
      host.recordTurn(identity, turn);
      const continuation = host.snapshot();
      const batch: Body[] = ["call_1", "call_2"].map((callId) => ({
        callId,
        toolId: callId === "call_1" ? "file.read" : "git.status",
        status: "executed",
        data: "ok",
      }));
      if (mode === "missing") batch.pop();
      if (mode === "duplicate") batch[1] = batch[0]!;
      if (mode === "foreign") batch[0]!.callId = "other";
      if (mode === "identity")
        continuation.identity = { ...identity, taskId: "other" };
      if (mode === "rewrite") {
        const entry = continuation.history[0]!;
        if (entry.kind === "model" && entry.turn.kind === "tool_calls")
          entry.turn.calls[0]!.arguments = { changed: true };
      }
      (continuation.history as unknown[]).push({
        kind: "tool_results",
        results: batch,
      });
      await assert.rejects(
        session.completeWithTools({
          ...request,
          continuation,
          ...(mode === "dual" ? { toolResults: [] } : {}),
        }),
      );
      assert.equal(calls, 1);
      await assert.rejects(session.completeWithTools(first())); // terminal after error
      assert.equal(calls, 1);
      session.close();
      host.close();
    }
  });

  test(`${vendor}: invalid native calls, partial turns and unsupported blocks fail closed`, async () => {
    for (const mode of [
      "arguments",
      "duplicate",
      "unknown",
      "partial",
      "empty",
      "unsupported",
      "callid",
      "oversized",
      "too-many",
      "refusal",
    ]) {
      const provider = new Provider({
        model: "test",
        apiKey: "test-only",
        fetcher: async (_url, init) => {
          const data = nativeCalls(
            bodyOf(init),
            mode === "duplicate" ? ["call_1", "call_1"] : ["call_1"],
          );
          const items = vendor === "openai" ? data.output : data.content;
          if (mode === "arguments") {
            if (vendor === "openai") items[0].arguments = "{";
            else items[0].input = [];
          }
          if (mode === "unknown") items[0].name = "shell_execute";
          if (mode === "callid") {
            if (vendor === "openai") items[0].call_id = "bad id";
            else items[0].id = "bad id";
          }
          if (mode === "partial") {
            if (vendor === "openai") data.status = "incomplete";
            else data.stop_reason = "max_tokens";
          }
          if (mode === "empty") {
            if (vendor === "openai") data.output = [];
            else data.content = [];
          }
          if (mode === "unsupported")
            items.push({ type: "server_tool_use", name: "bash" });
          if (mode === "too-many") {
            const extra = nativeCalls(
              bodyOf(init),
              Array.from({ length: 9 }, (_, i) => `call_${i}`),
            );
            if (vendor === "openai") data.output = extra.output;
            else data.content = extra.content;
          }
          if (mode === "refusal") {
            if (vendor === "openai")
              data.output = [
                {
                  type: "message",
                  role: "assistant",
                  content: [{ type: "refusal", refusal: "no" }],
                },
              ];
            else data.stop_reason = "refusal";
          }
          if (mode === "oversized") {
            if (vendor === "openai")
              items[0].arguments = JSON.stringify({ x: "x".repeat(17000) });
            else items[0].input = { x: "x".repeat(17000) };
          }
          return Response.json(data);
        },
      });
      await assert.rejects(
        provider.completeWithTools(request),
        (error: Error) => {
          assert.equal(
            error.message,
            "Invalid, cancelled or failed tool-calling session",
          );
          return true;
        },
      );
    }
  });

  test(`${vendor}: native memory budget and provider token limits are enforced`, async () => {
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      maxOutputTokens: 123,
      fetcher: async (_url, init) => {
        const body = bodyOf(init);
        assert.equal(
          vendor === "openai" ? body.max_output_tokens : body.max_tokens,
          123,
        );
        return Response.json(final());
      },
    });
    assert.equal((await provider.completeWithTools(request)).kind, "message");
    const session = provider.openSession(identity, { maxNativeStateBytes: 1 });
    await assert.rejects(session.completeWithTools(first()));
    assert.throws(() =>
      provider.openSession(identity, { maxNativeStateBytes: Infinity }),
    );
    const invalid = new Provider({ model: "test", maxOutputTokens: 999999 });
    assert.throws(() => invalid.openSession(identity));
  });

  test(`${vendor}: retained native output exceeding its budget is rejected`, async () => {
    let calls = 0;
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async () => {
        calls++;
        const data: Body = final();
        if (vendor === "openai")
          data.output[0].content[0].text = "x".repeat(3000);
        else data.content[0].text = "x".repeat(3000);
        return Response.json(data);
      },
    });
    const session = provider.openSession(identity, {
      maxNativeStateBytes: 2048,
    });
    await assert.rejects(session.completeWithTools(first()));
    assert.equal(calls, 1); // input fits; output causes the failure
    await assert.rejects(session.completeWithTools(first()));
    assert.equal(calls, 1);
  });

  test(`${vendor}: reissued native call IDs are rejected across model turns`, async () => {
    let calls = 0;
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        calls++;
        return Response.json(nativeCalls(bodyOf(init)));
      },
    });
    const session = provider.openSession(identity);
    const host = new ToolCallingSession(identity);
    host.recordTurn(identity, await session.completeWithTools(first()));
    host.recordResults(identity, [
      { callId: "call_1", toolId: "file.read", status: "executed", data: "ok" },
    ]);
    await assert.rejects(
      session.completeWithTools({
        ...request,
        continuation: host.continuation(),
      }),
    );
    assert.equal(calls, 2);
    session.close();
    host.close();
  });

  test(`${vendor}: similar host IDs get distinct wire names and duplicate definitions fail`, async () => {
    let calls = 0;
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        calls++;
        const body = bodyOf(init);
        assert.notEqual(body.tools[0].name, body.tools[1].name);
        return Response.json(final());
      },
    });
    const dotted = tools[0]!;
    await provider.completeWithTools({
      ...request,
      tools: [dotted, { ...dotted, id: "file_read" }],
    });
    await assert.rejects(
      provider.completeWithTools({ ...request, tools: [dotted, dotted] }),
    );
    assert.equal(calls, 1);
  });

  test(`${vendor}: session identity, close and cancellation prevent reuse`, async () => {
    let calls = 0;
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async () => {
        calls++;
        return Response.json(final());
      },
    });
    const scope = { ...identity };
    const session = provider.openSession(scope);
    scope.taskId = "changed";
    assert.deepEqual(session.identity, identity);
    session.close();
    session.close();
    await assert.rejects(session.completeWithTools(first()));
    const controller = new AbortController();
    controller.abort();
    const cancelled = provider.openSession(identity, {
      signal: controller.signal,
    });
    await assert.rejects(cancelled.completeWithTools(first()));
    assert.equal(calls, 0);
  });

  test(`${vendor}: concurrent calls reject; close aborts the in-flight operation`, async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let signal: AbortSignal | undefined;
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        signal = init?.signal ?? undefined;
        started();
        return new Promise<Response>(() => {});
      },
    });
    const session = provider.openSession(identity);
    const active = session.completeWithTools(first());
    await ready;
    await assert.rejects(session.completeWithTools(first()), /in flight/);
    session.close();
    await assert.rejects(active);
    assert.equal(signal?.aborted, true);
  });

  test(`${vendor}: simultaneous tasks on one adapter have isolated native conversations`, async () => {
    const seen: Body[] = [];
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        seen.push(bodyOf(init));
        return Response.json(final());
      },
    });
    const a = provider.openSession(identity);
    const otherIdentity = { ...identity, taskId: "task_2" };
    const b = provider.openSession(otherIdentity);
    await Promise.all([
      a.completeWithTools(first()),
      b.completeWithTools({
        ...request,
        prompt: "other task",
        continuation: { identity: otherIdentity, history: [] },
      }),
    ]);
    const inputs = seen.map((body) =>
      vendor === "openai" ? body.input : body.messages,
    );
    assert.deepEqual(
      inputs.map((input) => input.length),
      [1, 1],
    );
    assert.deepEqual(
      inputs.map((input) => input[0].content),
      ["inspect", "other task"],
    );
    a.close();
    b.close();
  });

  test(`${vendor}: edited host configuration and legacy result-only continuation are rejected`, async () => {
    let calls = 0;
    const provider = new Provider({
      model: "test",
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        calls++;
        return Response.json(nativeCalls(bodyOf(init)));
      },
    });
    const session = provider.openSession(identity);
    const host = new ToolCallingSession(identity);
    const turn = await session.completeWithTools(first());
    host.recordTurn(identity, turn);
    host.recordResults(identity, [
      { callId: "call_1", toolId: "file.read", status: "executed", data: "ok" },
    ]);
    await assert.rejects(
      session.completeWithTools({
        ...request,
        system: "changed",
        continuation: host.continuation(),
      }),
    );
    await assert.rejects(
      provider.completeWithTools({
        ...request,
        toolResults: [
          {
            callId: "call_1",
            toolId: "file.read",
            status: "executed",
            data: "fake",
          },
        ],
      }),
    );
    assert.equal(calls, 1);
    session.close();
    host.close();
  });
}
