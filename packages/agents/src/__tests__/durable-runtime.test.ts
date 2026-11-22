import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  FileRuntimeCheckpointStore, openSqliteOperationJournal,
} from "@ai-harness/checkpointing";
import { Orchestrator } from "@ai-harness/orchestrator";
import type {
  AgentExecutionContext, DurableDispatchBinding, ModelProviderAdapter, ModelRequest,
  ModelResponse, ModelToolRequest, ModelToolTurn, RuntimeCheckpointStore,
  RuntimeExecution, SessionToolCallingProviderAdapter, TaskDefinition,
  ToolCallingIdentity, ToolCallingSessionOptions,
} from "@ai-harness/contracts";
import { BUILTIN_TOOLS, ToolDispatcher, ToolRegistry } from "@ai-harness/tools";
import { ToolCallingAgent, ToolAugmentedAgent, createReadOnlyToolCallingAgent } from "../index.js";

const task: TaskDefinition = {
  id: "durable-task", title: "Review documentation", description: "Read README.md.",
  assignedRole: "software-architect", dependsOn: [], risk: "low",
  acceptanceCriteria: ["Use verified file content"],
};
const readTurn = (): ModelToolTurn => ({
  kind: "tool_calls",
  calls: [{ id: "stable_call_1", toolId: "file.read", arguments: { path: "README.md" } }],
});
function assertNoAuthority(request: ModelRequest): void {
  for (const key of ["durableOperations", "store", "requester", "safetyByTool", "operation"])
    assert.equal(Object.hasOwn(request, key), false);
  assert.doesNotMatch(JSON.stringify(request), /fixture-private-host-requester/);
}
/** Session and text fixtures, with no network transport or credentials. */
class FixtureSessionProvider implements SessionToolCallingProviderAdapter, ModelProviderAdapter {
  readonly id = "durable-fixture";
  readonly requests: ModelToolRequest[] = [];
  readonly textRequests: ModelRequest[] = [];
  readonly identities: ToolCallingIdentity[] = [];
  closed = 0;
  constructor(private readonly next: (request: ModelToolRequest, index: number) => ModelToolTurn | Promise<ModelToolTurn> =
    (_request, index) => index === 0 ? readTurn() : { kind: "message", text: "Read verified documentation." }) {}
  async complete(request: ModelRequest): Promise<ModelResponse> {
    assertNoAuthority(request);
    this.textRequests.push(request);
    return { text: "Reviewed workspace references.", model: this.id };
  }
  async completeWithTools(request: ModelToolRequest): Promise<ModelToolTurn> {
    assertNoAuthority(request); this.requests.push(request);
    return this.next(request, this.requests.length - 1);
  }
  openSession(identity: ToolCallingIdentity, _options?: ToolCallingSessionOptions) {
    assert.deepEqual(Object.keys(identity).sort(), ["executionId", "taskId"]);
    this.identities.push({ ...identity });
    let index = 0;
    let closed = false;
    return {
      identity: { ...identity },
      completeWithTools: async (request: ModelToolRequest) => {
        assert.equal(closed, false);
        assertNoAuthority(request);
        this.requests.push(request);
        return this.next(request, index++);
      },
      close: () => { if (!closed) { closed = true; this.closed++; } },
    };
  }
}
async function setup(t: TestContext) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "harness-durable-runtime-")));
  const projectRoot = path.join(root, "workspace");
  const privateRoot = path.join(root, "private");
  mkdirSync(projectRoot, { mode: 0o700 }); mkdirSync(privateRoot, { mode: 0o700 });
  writeFileSync(path.join(projectRoot, "README.md"), "Verified fixture documentation.\n", { mode: 0o600 });
  const filename = path.join(privateRoot, "operations.sqlite");
  const store = await openSqliteOperationJournal(filename);
  t.after(() => {
    try { store.close(); } catch { /* Reopen tests close the initial session intentionally. */ }
    rmSync(root, { recursive: true, force: true });
  });
  const binding: DurableDispatchBinding = {
    store, requester: { issuer: "fixture-host", subject: "fixture-private-host-requester" },
    safetyByTool: { "file.read": "read_only" },
  };
  const checkpoints = new FileRuntimeCheckpointStore(projectRoot);
  const context = (provider: ModelProviderAdapter, executionId = "stable-execution"): AgentExecutionContext => ({
    executionId, projectRoot, model: provider, grantedPermissions: ["files:read"],
    durableOperations: binding,
  });
  return { root, projectRoot, filename, store, binding, checkpoints, context };
}
function callingAgent(provider: FixtureSessionProvider, handler: Parameters<ToolDispatcher["registerHandler"]>[1],
  requireApproval = false): ToolCallingAgent {
  const registry = new ToolRegistry();
  registry.register(BUILTIN_TOOLS.find(tool => tool.id === "file.read")!);
  const dispatcher = new ToolDispatcher(registry);
  dispatcher.registerHandler("file.read", handler);
  return new ToolCallingAgent({
    role: task.assignedRole, systemPrompt: "Review verified documentation.", provider,
    registry, dispatcher, allowedToolIds: ["file.read"],
    requireApprovalFor: requireApproval ? ["files:read"] : [],
  });
}
function orchestratorFor(agent: ToolCallingAgent | ToolAugmentedAgent): Orchestrator {
  const orchestrator = new Orchestrator(); orchestrator.register(agent); return orchestrator;
}

test("Orchestrator propagates durable binding and persists task Running before the tool handler", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider();
  let calls = 0;
  const agent = callingAgent(provider, async (_args, ctx) => {
    calls++;
    const checkpoint = await f.checkpoints.get(ctx.executionId);
    assert.equal(checkpoint?.state, "running");
    assert.equal(checkpoint?.tasks[0]?.state, "running");
    const op = f.store.list(ctx.executionId)[0]!;
    assert.equal(op.state, "Running");
    assert.equal(op.taskId, task.id);
    return { content: "Verified handler output." };
  });
  const result = await orchestratorFor(agent).run({
    request: "Review", projectRoot: f.projectRoot, tasks: [task], model: provider,
    grantedPermissions: ["files:read"], checkpointStore: f.checkpoints,
    durableOperations: f.binding,
  });
  assert.equal(result.execution.state, "completed");
  assert.equal(calls, 1);
  const op = f.store.list(result.execution.id)[0]!;
  assert.equal(op.executionId, result.execution.id);
  assert.equal(op.taskId, task.id);
  assert.equal(op.requestId, "stable_call_1");
  assert.equal(op.toolCallId, "stable_call_1");
  assert.equal(op.state, "Completed");
  assert.deepEqual(provider.identities, [{ executionId: result.execution.id, taskId: task.id }]);
  assert.equal(provider.requests.length, 2);
  assert.equal(provider.closed, 1);
  assert.equal(provider.requests[1]?.continuation?.history.at(-1)?.kind, "tool_results");
  assert.equal((await f.checkpoints.get(result.execution.id))?.tasks[0]?.state, "completed");
});

test("ToolAugmentedAgent uses durable host binding with stable context-file identity", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider();
  const agent = new ToolAugmentedAgent({
    role: task.assignedRole, systemPrompt: "Review workspace.", readFiles: ["README.md"],
    requireApprovalFor: [],
  });
  const result = await orchestratorFor(agent).run({
    request: "Review references", projectRoot: f.projectRoot, tasks: [task], model: provider,
    grantedPermissions: ["files:read"], checkpointStore: f.checkpoints, durableOperations: f.binding,
  });
  assert.equal(result.execution.state, "completed");
  const op = f.store.list(result.execution.id)[0]!;
  assert.equal(op.taskId, task.id);
  assert.equal(op.requestId, "context-file:0");
  assert.equal(op.toolCallId, undefined);
  assert.equal(op.state, "Completed");
  assert.equal(provider.textRequests.length, 1);
  assert.match(provider.textRequests[0]!.prompt, /Verified fixture documentation/);
  assert.equal(provider.requests.length, 0);
  const duplicate = await agent.execute(task, f.context(provider, result.execution.id));
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error!, /Workspace read blocked/);
  assert.equal(provider.textRequests.length, 1);
});

test("PendingApproval stops the model loop and remains discoverable after reopening SQLite", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider();
  let calls = 0;
  const agent = callingAgent(provider, async () => { calls++; return "never"; }, true);
  const result = await orchestratorFor(agent).run({
    request: "Read requires approval", projectRoot: f.projectRoot, tasks: [task], model: provider,
    grantedPermissions: ["files:read"], checkpointStore: f.checkpoints, durableOperations: f.binding,
  });
  assert.equal(result.execution.state, "failed");
  assert.equal(calls, 0);
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.closed, 1);
  const op = f.store.pending()[0]!;
  assert.equal(op.state, "PendingApproval");
  assert.equal(op.executionId, result.execution.id);
  assert.equal(op.taskId, task.id);
  assert.equal(op.requestId, "stable_call_1");
  f.store.close();
  const reopened = await openSqliteOperationJournal(f.filename);
  t.after(() => reopened.close());
  const discovered = reopened.pending();
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0]?.operationId, op.operationId);
  assert.equal(reopened.approval(op.approvalId!)?.status, "pending");
  assert.throws(() => reopened.decide(op.approvalId!, { issuer: "fixture-idp", subject: "fixture-human" }, true));
});

test("new provider sessions and a reopened store cannot replay a completed execution/task/call", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider();
  let calls = 0;
  const agent = callingAgent(provider, async () => { calls++; return { content: "first result" }; });
  assert.equal((await agent.execute(task, f.context(provider))).success, true);
  const original = f.store.list("stable-execution")[0]!;
  f.store.close();
  const reopened = await openSqliteOperationJournal(f.filename);
  t.after(() => reopened.close());
  const nextProvider = new FixtureSessionProvider();
  const nextAgent = callingAgent(nextProvider, async () => { calls++; return "must not run"; });
  const next = await nextAgent.execute(task, {
    ...f.context(nextProvider), durableOperations: { ...f.binding, store: reopened },
  });
  assert.equal(next.success, false);
  assert.match(next.error!, /Tool invocation blocked/);
  assert.equal(calls, 1);
  assert.equal(nextProvider.requests.length, 1);
  assert.equal(reopened.list("stable-execution").length, 1);
  assert.equal(reopened.get(original.operationId)?.state, "Completed");
  assert.equal(provider.closed, 1);
  assert.equal(nextProvider.closed, 1);
});

test("read-only factory can bind SQLite directly and sends no journal authority to the provider", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider(request => {
    assert.deepEqual(request.tools.map(tool => tool.id), ["file.read"]);
    const history = request.continuation?.history ?? [];
    return history.length === 0 ? readTurn() : { kind: "message", text: "Factory read complete." };
  });
  const agent = createReadOnlyToolCallingAgent({
    role: task.assignedRole, systemPrompt: "Read only.", provider, requireApprovalFor: [],
    durableOperations: f.binding,
  });
  const context = f.context(provider);
  const { durableOperations: _binding, ...withoutBinding } = context;
  const result = await agent.execute(task, withoutBinding);
  assert.equal(result.success, true);
  const op = f.store.list("stable-execution")[0]!;
  assert.equal(op.state, "Completed");
  assert.equal(op.toolId, "file.read");
  assert.equal(provider.requests.length, 2);
  const last = provider.requests[1]?.continuation?.history.at(-1);
  assert.equal(last?.kind, "tool_results");
  if (last?.kind === "tool_results") {
    assert.equal(last.results[0]?.callId, "stable_call_1");
    assert.match(JSON.stringify(last.results[0]?.data), /Verified fixture documentation/);
  }
});

test("durable read-only factory rejects a privileged model call before registering an operation", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider(request => {
    assert.deepEqual(request.tools.map(tool => tool.id), ["file.read"]);
    return { kind: "tool_calls", calls: [{
      id: "write_call", toolId: "file.write", arguments: { path: "unauthorized.txt", content: "never" },
    }] };
  });
  const agent = createReadOnlyToolCallingAgent({
    role: task.assignedRole, systemPrompt: "Read only.", provider, requireApprovalFor: [],
    durableOperations: f.binding,
  });
  const result = await agent.execute(task, f.context(provider));
  assert.equal(result.success, false);
  assert.match(result.error!, /Unauthorized/);
  assert.equal(f.store.list("stable-execution").length, 0);
  assert.equal(existsSync(path.join(f.projectRoot, "unauthorized.txt")), false);
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.closed, 1);
});

test("cancellation during a durable handler records Uncertain and cancels orchestration", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider();
  const controller = new AbortController();
  let calls = 0;
  const agent = callingAgent(provider, async (_args, ctx) => {
    calls++;
    assert.equal(ctx.signal, controller.signal);
    controller.abort();
    return { content: "An already-started effect cannot be rolled back." };
  });
  const result = await orchestratorFor(agent).run({
    request: "Cancel running operation", projectRoot: f.projectRoot, tasks: [task], model: provider,
    grantedPermissions: ["files:read"], checkpointStore: f.checkpoints,
    durableOperations: f.binding, signal: controller.signal,
  });
  assert.equal(result.execution.state, "cancelled");
  assert.equal(result.execution.tasks[0]?.state, "cancelled");
  assert.equal(f.store.list(result.execution.id)[0]?.state, "Uncertain");
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.closed, 1);
  assert.equal(calls, 1);
  assert.equal(result.execution.events.some(event => event.type === "execution.cancelled"), true);
  assert.equal(result.execution.events.some(event => event.type === "task.cancelled"), true);
  const saved = await f.checkpoints.get(result.execution.id);
  assert.equal(saved?.state, "cancelled");
  assert.equal(saved?.tasks[0]?.state, "cancelled");
});

test("failure to checkpoint task Running blocks the agent before any durable dispatch", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider();
  let calls = 0;
  let failed = false;
  const snapshots: RuntimeExecution[] = [];
  const checkpoints: RuntimeCheckpointStore = {
    async save(execution) {
      snapshots.push(structuredClone(execution));
      if (!failed && execution.tasks[0]?.state === "running") {
        failed = true;
        throw new Error("fixture-checkpoint-storage-failure");
      }
      await f.checkpoints.save(execution);
    },
    get: id => f.checkpoints.get(id),
  };
  const agent = callingAgent(provider, async () => { calls++; return "never"; });
  const result = await orchestratorFor(agent).run({
    request: "Checkpoint first", projectRoot: f.projectRoot, tasks: [task], model: provider,
    grantedPermissions: ["files:read"], checkpointStore: checkpoints, durableOperations: f.binding,
  });
  assert.equal(failed, true);
  assert.equal(result.execution.state, "failed");
  assert.equal(result.execution.tasks[0]?.state, "failed");
  assert.equal(calls, 0);
  assert.equal(provider.requests.length, 0);
  assert.equal(provider.identities.length, 0);
  assert.equal(f.store.pending().length, 0);
  assert.equal(f.store.list(result.execution.id).length, 0);
  assert.equal(snapshots.some(snapshot => snapshot.tasks[0]?.state === "running"), true);
});

test("ToolAugmentedAgent preserves a pending read without making a text model request", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider();
  const agent = new ToolAugmentedAgent({
    role: task.assignedRole, systemPrompt: "Review.", readFiles: ["README.md"],
    requireApprovalFor: ["files:read"],
  });
  const result = await orchestratorFor(agent).run({
    request: "Approved references only", projectRoot: f.projectRoot, tasks: [task], model: provider,
    grantedPermissions: ["files:read"], checkpointStore: f.checkpoints, durableOperations: f.binding,
  });
  assert.equal(result.execution.state, "failed");
  assert.equal(provider.textRequests.length, 0);
  const op = f.store.pending()[0]!;
  assert.equal(op.state, "PendingApproval");
  assert.equal(op.taskId, task.id);
  assert.equal(op.requestId, "context-file:0");
  assert.equal(op.executionId, result.execution.id);
});

test("pre-cancelled orchestration starts neither provider sessions nor durable operations", async t => {
  const f = await setup(t);
  const provider = new FixtureSessionProvider();
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const agent = callingAgent(provider, async () => { calls++; return "never"; });
  const result = await orchestratorFor(agent).run({
    request: "Already cancelled", projectRoot: f.projectRoot, tasks: [task], model: provider,
    grantedPermissions: ["files:read"], checkpointStore: f.checkpoints,
    durableOperations: f.binding, signal: controller.signal,
  });
  assert.equal(result.execution.state, "cancelled");
  assert.equal(result.execution.tasks[0]?.state, "cancelled");
  assert.equal(calls, 0);
  assert.equal(provider.requests.length, 0);
  assert.equal(provider.identities.length, 0);
  assert.equal(f.store.pending().length, 0);
});
