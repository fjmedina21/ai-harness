import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  AgentExecutionContext, ModelProviderAdapter, ModelToolRequest, ModelToolTurn,
  TaskDefinition, TelemetryEvent, TelemetryObserver, ToolCallingProviderAdapter,
} from "@ai-harness/contracts";
import { InMemoryTelemetrySink, TelemetrySession } from "@ai-harness/observability";
import { Orchestrator } from "@ai-harness/orchestrator";
import { BUILTIN_TOOLS, ToolDispatcher, ToolRegistry } from "@ai-harness/tools";
import { PromptAgent, ToolAugmentedAgent, ToolCallingAgent } from "../index.js";

const task: TaskDefinition = {
  id: "observed-task", title: "private-task-title", description: "private-description",
  assignedRole: "software-architect", dependsOn: [], risk: "low",
  acceptanceCriteria: ["private-acceptance"],
};
const model: ModelProviderAdapter = {
  id: "fixture",
  async complete() { return { model: "fixture-model", text: "private-model-response" }; },
};
function session() {
  const sink = new InMemoryTelemetrySink();
  let tick = 0;
  const telemetry = new TelemetrySession({
    sink, monotonicNow: () => ++tick, now: () => new Date("2026-01-01T00:00:00Z"),
  });
  return { sink, telemetry };
}
function context(telemetry?: TelemetrySession, signal?: AbortSignal): AgentExecutionContext {
  return {
    executionId: "standalone-execution", projectRoot: "/tmp/private-root", model,
    grantedPermissions: ["files:read"], signal,
    ...(telemetry ? { telemetry: telemetry.trace("standalone-execution") } : {}),
  };
}
function calling(next: (request: ModelToolRequest, index: number) => ModelToolTurn | Promise<ModelToolTurn>,
  approval = false) {
  let turns = 0;
  let effects = 0;
  const provider: ToolCallingProviderAdapter = {
    id: "fixture-tools", completeWithTools: async (request) => next(request, turns++),
  };
  const registry = new ToolRegistry();
  for (const definition of BUILTIN_TOOLS) registry.register(definition);
  const dispatcher = new ToolDispatcher(registry);
  dispatcher.registerHandler("file.read", async () => {
    effects++;
    return { content: "private-file-content" };
  });
  const agent = new ToolCallingAgent({
    role: task.assignedRole, systemPrompt: "private-system-prompt", provider,
    registry, dispatcher, allowedToolIds: ["file.read"],
    requireApprovalFor: approval ? ["files:read"] : [],
  });
  return { agent, effects: () => effects, turns: () => turns };
}
function readTurn(index = 0): ModelToolTurn {
  return {
    kind: "tool_calls",
    calls: [{ id: "call-" + index, toolId: "file.read", arguments: { path: "private-file-path" } }],
  };
}
function starts(events: readonly TelemetryEvent[], name: TelemetryEvent["name"]) {
  return events.filter((event) => event.type === "span.start" && event.name === name);
}
function ends(events: readonly TelemetryEvent[], name: TelemetryEvent["name"]) {
  return events.filter((event) => event.type === "span.end" && event.name === name);
}

test("runtime telemetry correlates execution task agent model and tools without private payloads", async () => {
  const { sink, telemetry } = session();
  const requests: ModelToolRequest[] = [];
  const fixture = calling((request, index) => {
    requests.push(request);
    return index === 0 ? readTurn() : { kind: "message", text: "private-model-response" };
  });
  const orchestrator = new Orchestrator();
  orchestrator.register(fixture.agent);
  const output = await orchestrator.run({
    request: "private-user-request", projectRoot: "/tmp/private-root",
    model, tasks: [task], grantedPermissions: ["files:read"], telemetry,
  });
  await telemetry.flush();
  assert.equal(output.result.state, "completed");
  assert.equal(fixture.effects(), 1);
  const events = sink.events();
  const execution = starts(events, "execution")[0]!;
  const taskSpan = starts(events, "task")[0]!;
  const agent = starts(events, "agent")[0]!;
  assert.equal(starts(events, "agent").length, 1);
  assert.equal(taskSpan.context.parentSpanId, execution.context.spanId);
  assert.equal(agent.context.parentSpanId, taskSpan.context.spanId);
  assert.equal(agent.context.executionId, output.execution.id);
  assert.equal(agent.context.taskId, task.id);
  assert.equal(agent.context.agentRole, task.assignedRole);
  assert.equal(starts(events, "model.turn").length, 2);
  for (const turn of starts(events, "model.turn")) {
    assert.equal(turn.context.parentSpanId, agent.context.spanId);
    assert.equal(turn.context.traceId, execution.context.traceId);
  }
  assert.equal(starts(events, "tool.dispatch").length, 1);
  assert.equal(starts(events, "tool.dispatch")[0]!.context.parentSpanId, agent.context.spanId);
  assert.equal(events.find((event) => event.name === "agent.tools_requested")?.attributes.accepted, true);
  assert.equal(requests[0]!.telemetry?.context.taskId, task.id);
  assert.equal(telemetry.diagnostics().activeSpans, 0);
  assert.doesNotMatch(JSON.stringify(events), /private-/);
});

test("standalone PromptAgent propagates one invocation and model turn", async () => {
  const { sink, telemetry } = session();
  let traceTask: string | undefined;
  const fixture: ModelProviderAdapter = {
    id: "fixture",
    async complete(request) {
      traceTask = request.telemetry?.context.taskId;
      return { model: "fixture-model", text: "private-answer" };
    },
  };
  const agent = new PromptAgent({ role: task.assignedRole, systemPrompt: "private-system" });
  const outcome = await agent.execute(task, { ...context(telemetry), model: fixture });
  await telemetry.flush();
  assert.equal(outcome.success, true);
  assert.equal(traceTask, task.id);
  const events = sink.events();
  assert.equal(starts(events, "agent").length, 1);
  assert.equal(starts(events, "model.turn")[0]!.context.parentSpanId, starts(events, "agent")[0]!.context.spanId);
  assert.equal(ends(events, "agent")[0]!.status, "ok");
});

test("ToolAugmentedAgent shares its invocation with PromptAgent delegate and filesystem dispatch", async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "harness-observed-context-")));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  writeFileSync(path.join(root, "README.md"), "private-file-content");
  const { sink, telemetry } = session();
  const agent = new ToolAugmentedAgent({
    role: task.assignedRole, systemPrompt: "private-prompt",
    readFiles: ["README.md"], requireApprovalFor: [],
  });
  const outcome = await agent.execute(task, { ...context(telemetry), projectRoot: root });
  await telemetry.flush();
  assert.equal(outcome.success, true);
  const events = sink.events();
  assert.equal(starts(events, "agent").length, 1);
  assert.equal(starts(events, "model.turn").length, 1);
  assert.equal(starts(events, "tool.dispatch").length, 1);
  assert.equal(starts(events, "tool.dispatch")[0]!.context.parentSpanId, starts(events, "agent")[0]!.context.spanId);
  assert.doesNotMatch(JSON.stringify(events), /private-file-content|README\.md/);
});

for (const [name, turn, errorClass] of [
  ["host allowlist", { kind: "tool_calls", calls: [{ id: "bad-call", toolId: "shell.execute", arguments: { command: "private-command" } }] }, "policy"],
  ["malformed arguments", { kind: "tool_calls", calls: [{ id: "bad-call", toolId: "file.read", arguments: { path: 4 } }] }, "invalid_input"],
] as const) {
  test("agent telemetry records rejected " + name + " without dispatching", async () => {
    const { sink, telemetry } = session();
    const fixture = calling(() => ({ kind: "tool_calls", calls: turn.calls.map((call) => ({ ...call, arguments: { ...call.arguments } })) } as unknown as ModelToolTurn));
    const outcome = await fixture.agent.execute(task, context(telemetry));
    await telemetry.flush();
    assert.equal(outcome.success, false);
    assert.equal(fixture.effects(), 0);
    assert.equal(starts(sink.events(), "tool.dispatch").length, 0);
    const rejection = sink.events().find((event) => event.name === "agent.tools_rejected");
    assert.equal(rejection?.attributes.errorClass, errorClass);
    assert.equal(rejection?.attributes.accepted, false);
    assert.doesNotMatch(JSON.stringify(sink.events()), /private-command/);
  });
}

test("tool-calling telemetry records bounded turns and explicit limit without executing final batch", async () => {
  const { sink, telemetry } = session();
  const fixture = calling((_request, index) => readTurn(index));
  const outcome = await fixture.agent.execute(task, context(telemetry));
  await telemetry.flush();
  assert.equal(outcome.success, false);
  assert.equal(fixture.turns(), 5);
  assert.equal(fixture.effects(), 4);
  assert.equal(starts(sink.events(), "model.turn").length, 5);
  assert.equal(sink.events().find((event) => event.name === "agent.limit")?.attributes.errorClass, "limit");
  assert.equal(telemetry.diagnostics().activeSpans, 0);
});

test("approval remains a blocking runtime outcome and no authorization identifier enters telemetry", async () => {
  const { sink, telemetry } = session();
  const fixture = calling(() => readTurn(), true);
  const outcome = await fixture.agent.execute(task, context(telemetry));
  await telemetry.flush();
  assert.equal(outcome.success, false);
  assert.match(outcome.error ?? "", /Approval required/);
  assert.equal(fixture.effects(), 0);
  assert.equal(fixture.turns(), 1);
  assert.doesNotMatch(JSON.stringify(sink.events()), /approvalId|scopeDigest|requester/);
});

test("cancellation closes model agent task and execution spans and blocks dependent work", async () => {
  const { sink, telemetry } = session();
  const controller = new AbortController();
  const fixture = calling(() => {
    controller.abort();
    return { kind: "message", text: "private-answer-after-cancel" };
  });
  const orchestrator = new Orchestrator();
  orchestrator.register(fixture.agent);
  const output = await orchestrator.run({
    request: "private-request", projectRoot: "/tmp/private-root", model,
    tasks: [task, { ...task, id: "dependent-task", dependsOn: [task.id] }],
    grantedPermissions: ["files:read"], signal: controller.signal, telemetry,
  });
  await telemetry.flush();
  assert.equal(output.execution.state, "cancelled");
  assert.equal(fixture.turns(), 1);
  assert.equal(fixture.effects(), 0);
  for (const name of ["execution", "task", "agent", "model.turn"] as const) {
    assert.equal(ends(sink.events(), name)[0]!.status, "cancelled");
  }
  assert.equal(sink.events().find((event) => event.name === "task.blocked")?.attributes.taskId, "dependent-task");
  assert.equal(telemetry.diagnostics().activeSpans, 0);
});

test("checkpoint failure closes execution telemetry and preserves the original failure", async () => {
  const { sink, telemetry } = session();
  const orchestrator = new Orchestrator();
  let effects = 0;
  orchestrator.register({
    role: task.assignedRole,
    async execute() { effects++; return { success: true, summary: "done", artifacts: [] }; },
  });
  await assert.rejects(orchestrator.run({
    request: "private-request", projectRoot: "/tmp/private-root", model, tasks: [task], telemetry,
    checkpointStore: {
      async save() { throw new Error("private-storage-error"); },
      async get() { return null; },
    },
  }), /private-storage-error/);
  await telemetry.flush();
  assert.equal(effects, 0);
  assert.equal(ends(sink.events(), "execution")[0]?.status, "error");
  assert.equal(telemetry.diagnostics().activeSpans, 0);
  assert.doesNotMatch(JSON.stringify(sink.events()), /private-storage-error/);
});

test("thrown provider errors are classified without exporting exception contents", async () => {
  const { sink, telemetry } = session();
  const fixture = calling(() => { throw new Error("private-api-key-and-prompt"); });
  const outcome = await fixture.agent.execute(task, context(telemetry));
  await telemetry.flush();
  assert.equal(outcome.success, false);
  assert.equal(ends(sink.events(), "model.turn")[0]!.attributes.errorClass, "invalid_response");
  assert.doesNotMatch(JSON.stringify(sink.events()), /private-api-key-and-prompt/);
  assert.equal(telemetry.diagnostics().activeSpans, 0);
});

test("sink and observer failures cannot change the result or grant permissions", async () => {
  const telemetry = new TelemetrySession({ sink: { write() { throw new Error("private-sink-error"); } } });
  const fixture = calling((_, index) => index === 0 ? readTurn() : { kind: "message", text: "done" });
  const outcome = await fixture.agent.execute(task, context(telemetry));
  await telemetry.flush();
  assert.equal(outcome.success, true);
  assert.equal(fixture.effects(), 1);
  assert.equal(telemetry.diagnostics().sinkErrors, 1);
  const throwing: TelemetryObserver = {
    trace() { throw new Error("private-observer-error"); },
    startSpan() { throw new Error("private-observer-error"); },
    event() { throw new Error("private-observer-error"); },
  };
  const orchestrator = new Orchestrator();
  orchestrator.register(new PromptAgent({ role: task.assignedRole, systemPrompt: "prompt" }));
  const output = await orchestrator.run({
    request: "request", projectRoot: "/tmp/demo", tasks: [task], model, telemetry: throwing,
  });
  assert.equal(output.execution.state, "completed");
});

test("simultaneous execution telemetry remains isolated across sessions and traces", async () => {
  const first = session();
  const second = session();
  const orchestrator = new Orchestrator();
  orchestrator.register(new PromptAgent({ role: task.assignedRole, systemPrompt: "prompt" }));
  const outputs = await Promise.all([first, second].map(({ telemetry }) => orchestrator.run({
    request: "request", projectRoot: "/tmp/demo", tasks: [task], model, telemetry,
  })));
  await Promise.all([first.telemetry.flush(), second.telemetry.flush()]);
  assert.notEqual(outputs[0]!.execution.id, outputs[1]!.execution.id);
  for (const [index, fixture] of [first, second].entries()) {
    assert.ok(fixture.sink.events().every((event) => event.context.executionId === outputs[index]!.execution.id));
    assert.ok(fixture.sink.events().every((event) => event.sessionId === fixture.telemetry.sessionId));
    assert.equal(fixture.telemetry.diagnostics().activeSpans, 0);
  }
  assert.notEqual(first.sink.events()[0]!.context.traceId, second.sink.events()[0]!.context.traceId);
});
