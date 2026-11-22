import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { openSqliteOperationJournal } from "@ai-harness/checkpointing";
import type {
  DurableDispatchBinding, DurableOperationStore, ToolDispatchContext,
  ToolHandler, ApproverIdentityVerifier,
} from "@ai-harness/contracts";
import { DurableApprovalService, digestDurableValue } from "@ai-harness/security";
import { BUILTIN_TOOLS, ToolApprovalManager, ToolDispatcher, ToolRegistry } from "../index.js";

const invocation = { toolId: "file.read", arguments: { path: "README.md" } };
const requester = { issuer: "fixture-host", subject: "fixture-requester" };
const approver = { issuer: "fixture-idp", subject: "fixture-human" };
const fixtureVerifier: ApproverIdentityVerifier = {
  async verify() { return { ...approver, roles: ["harness:approver"] }; },
};
function context(overrides: Partial<ToolDispatchContext> = {}): ToolDispatchContext {
  return {
    executionId: "durable-execution", projectRoot: "/fixture/project",
    defaultDeny: true, grantedPermissions: ["files:read"], requireApprovalFor: [],
    operation: { taskId: "task-one", requestId: "request-one", toolCallId: "call-one" },
    ...overrides,
  };
}
function wrap(store: DurableOperationStore, overrides: Partial<DurableOperationStore>): DurableOperationStore {
  return new Proxy(store, {
    get(target, key) {
      if (Object.hasOwn(overrides, key)) return Reflect.get(overrides, key);
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
async function setup(t: TestContext, options: {
  now?: () => number; approvalTtlMs?: number; handler?: ToolHandler;
  memory?: ToolApprovalManager; storeOverride?: (store: DurableOperationStore) => DurableOperationStore;
} = {}) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "harness-durable-dispatch-")));
  const filename = path.join(directory, "operations.sqlite");
  const store = await openSqliteOperationJournal(filename, {
    now: options.now, approvalTtlMs: options.approvalTtlMs,
  });
  t.after(() => {
    try { store.close(); } catch { /* Some tests close storage deliberately. */ }
    rmSync(directory, { recursive: true, force: true });
  });
  const registry = new ToolRegistry();
  for (const tool of BUILTIN_TOOLS) registry.register(tool);
  let calls = 0;
  const binding: DurableDispatchBinding = {
    store: options.storeOverride?.(store) ?? store, requester,
    safetyByTool: { "file.read": "read_only" },
  };
  const dispatcher = new ToolDispatcher(registry, options.memory, binding);
  dispatcher.registerHandler("file.read", async (args, ctx) => {
    calls++;
    return options.handler ? options.handler(args, ctx) : { text: "fixture-result" };
  });
  return { store, filename, registry, dispatcher, binding, calls: () => calls,
    service: new DurableApprovalService(store, fixtureVerifier) };
}

test("durable dispatch validates permission, schema and Default Deny before registration", async t => {
  const f = await setup(t);
  assert.equal((await f.dispatcher.dispatch(invocation, context({ grantedPermissions: [] }))).status, "denied");
  assert.equal((await f.dispatcher.dispatch({ toolId: "file.read", arguments: { path: 42 } }, context())).status, "invalid");
  assert.equal((await f.dispatcher.dispatch(invocation, context({ defaultDeny: false as true }))).status, "denied");
  assert.equal(f.store.list("durable-execution").length, 0);
  assert.equal(f.calls(), 0);
});

test("durable dispatch executes once and rejects duplicate completed requests", async t => {
  const f = await setup(t);
  const first = await f.dispatcher.dispatch(invocation, context());
  assert.equal(first.status, "executed");
  assert.equal(first.operationState, "Completed");
  assert.deepEqual(first.data, { text: "fixture-result" });
  const second = await f.dispatcher.dispatch(invocation, context());
  assert.equal(second.status, "denied");
  assert.match(second.error!, /Completed.*replay blocked/);
  assert.equal(second.operationId, first.operationId);
  assert.equal(f.calls(), 1);
  const op = f.store.get(first.operationId!)!;
  assert.equal(op.resultDigest, digestDurableValue(first.data));
  assert.deepEqual(f.store.events(op.operationId).map(event => event.state),
    ["Created", "Prepared", "Running", "Completed"]);
});

test("durable dispatch requires host task/request identity and a host safety classification", async t => {
  const f = await setup(t);
  assert.equal((await f.dispatcher.dispatch(invocation, context({ operation: undefined }))).status, "denied");
  const dispatcher = new ToolDispatcher(f.registry, undefined, { ...f.binding, safetyByTool: {} });
  dispatcher.registerHandler("file.read", async () => "never");
  assert.equal((await dispatcher.dispatch(invocation, context())).status, "denied");
  assert.equal(f.store.list("durable-execution").length, 0);
  assert.equal(f.calls(), 0);
});

test("durable dispatch rejects conflicting host bindings instead of selecting another store", async t => {
  const f = await setup(t);
  const result = await f.dispatcher.dispatch(invocation, context({
    durableOperations: { ...f.binding, requester: { ...requester, subject: "different-requester" } },
  }));
  assert.equal(result.status, "denied");
  assert.match(result.error!, /Conflicting host/);
  assert.equal(f.store.list("durable-execution").length, 0);
});

test("context-only durable opt-in uses the same transaction path", async t => {
  const f = await setup(t);
  const dispatcher = new ToolDispatcher(f.registry);
  let calls = 0;
  dispatcher.registerHandler("file.read", async () => { calls++; return "context-bound"; });
  const result = await dispatcher.dispatch(invocation, context({ durableOperations: f.binding }));
  assert.equal(result.status, "executed");
  assert.equal(f.store.get(result.operationId!)?.state, "Completed");
  assert.equal(calls, 1);
});

test("pending durable requests retain one approval and execute only after verified decision", async t => {
  const f = await setup(t);
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const first = await f.dispatcher.dispatch(invocation, ctx);
  const duplicate = await f.dispatcher.dispatch(invocation, ctx);
  assert.equal(first.status, "approval_required");
  assert.equal(duplicate.approvalId, first.approvalId);
  assert.equal(f.calls(), 0);
  assert.equal(f.store.list("durable-execution").length, 1);
  await f.service.decide(first.approvalId!, "fixture-authentication", true);
  assert.equal((await f.dispatcher.dispatch(invocation, ctx)).status, "approval_required");
  const executed = await f.dispatcher.dispatch(invocation, ctx, first.approvalId);
  assert.equal(executed.status, "executed");
  const approval = f.store.approval(first.approvalId!)!;
  assert.equal(approval.status, "consumed");
  assert.deepEqual(approval.requester, requester);
  assert.deepEqual(approval.approver, approver);
  assert.equal((await f.dispatcher.dispatch(invocation, ctx, first.approvalId)).status, "denied");
  assert.equal(f.calls(), 1);
});

test("durable mode never falls back to a valid in-memory approval", async t => {
  const memory = new ToolApprovalManager();
  const legacy = memory.request({
    executionId: "durable-execution", projectRoot: "/fixture/project",
    toolId: "file.read", arguments: invocation.arguments, permission: "files:read", risk: "low",
  });
  memory.decide(legacy.id, "trusted-fixture-host", true);
  const f = await setup(t, { memory });
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const requested = await f.dispatcher.dispatch(invocation, ctx, legacy.id);
  assert.notEqual(requested.status, "executed");
  assert.equal(f.calls(), 0);
  assert.equal(memory.get(legacy.id)?.status, "approved");
  assert.equal(f.store.list("durable-execution")[0]?.state, "PendingApproval");
});

test("approved durable request rejects altered arguments, policy and project scope", async t => {
  const f = await setup(t);
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const pending = await f.dispatcher.dispatch(invocation, ctx);
  await f.service.decide(pending.approvalId!, "fixture-authentication", true);
  assert.notEqual((await f.dispatcher.dispatch({
    toolId: "file.read", arguments: { path: "other.txt" },
  }, ctx, pending.approvalId)).status, "executed");
  assert.notEqual((await f.dispatcher.dispatch(invocation, {
    ...ctx, projectRoot: "/different/project",
  }, pending.approvalId)).status, "executed");
  assert.notEqual((await f.dispatcher.dispatch(invocation, context(), pending.approvalId)).status, "executed");
  assert.equal(f.store.approval(pending.approvalId!)?.status, "approved");
  assert.equal(f.calls(), 0);
  assert.equal((await f.dispatcher.dispatch(invocation, ctx, pending.approvalId)).status, "executed");
});

test("a repeated provider call ID under another request cannot create a second operation", async t => {
  const f = await setup(t);
  assert.equal((await f.dispatcher.dispatch(invocation, context())).status, "executed");
  const result = await f.dispatcher.dispatch(invocation, context({
    operation: { taskId: "task-one", requestId: "different-request", toolCallId: "call-one" },
  }));
  assert.notEqual(result.status, "executed");
  assert.equal(f.store.list("durable-execution").length, 1);
  assert.equal(f.calls(), 1);
});

test("expired approved grant is durably cancelled without invoking the handler", async t => {
  let now = Date.parse("2026-01-01T00:00:00.000Z");
  const f = await setup(t, { now: () => now, approvalTtlMs: 100 });
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const pending = await f.dispatcher.dispatch(invocation, ctx);
  await f.service.decide(pending.approvalId!, "fixture-authentication", true);
  now += 100;
  const result = await f.dispatcher.dispatch(invocation, ctx, pending.approvalId);
  assert.notEqual(result.status, "executed");
  assert.equal(f.store.approval(pending.approvalId!)?.status, "expired");
  assert.equal(f.store.get(pending.operationId!)?.state, "Cancelled");
  assert.equal(f.calls(), 0);
});

test("revoked and denied grants cannot execute or be decided again", async t => {
  const f = await setup(t);
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const pending = await f.dispatcher.dispatch(invocation, ctx);
  await f.service.decide(pending.approvalId!, "fixture-authentication", true);
  await f.service.revoke(pending.approvalId!, "fixture-authentication");
  assert.equal((await f.dispatcher.dispatch(invocation, ctx, pending.approvalId)).status, "denied");
  await assert.rejects(f.service.decide(pending.approvalId!, "fixture-authentication", true));
  const deniedContext = context({ ...ctx, operation: { taskId: "task-one", requestId: "denied-request", toolCallId: "denied-call" } });
  const denied = await f.dispatcher.dispatch(invocation, deniedContext);
  await f.service.decide(denied.approvalId!, "fixture-authentication", false);
  assert.equal((await f.dispatcher.dispatch(invocation, deniedContext, denied.approvalId)).status, "denied");
  assert.equal(f.store.approval(denied.approvalId!)?.status, "denied");
  assert.equal(f.calls(), 0);
});

test("simultaneous approved dispatch consumes once while the other request is blocked", async t => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const f = await setup(t, { handler: async () => { entered(); await gate; return "done"; } });
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const pending = await f.dispatcher.dispatch(invocation, ctx);
  await f.service.decide(pending.approvalId!, "fixture-authentication", true);
  const first = f.dispatcher.dispatch(invocation, ctx, pending.approvalId);
  await started;
  const second = await f.dispatcher.dispatch(invocation, ctx, pending.approvalId);
  assert.equal(second.status, "denied");
  assert.equal(f.store.approval(pending.approvalId!)?.status, "consumed");
  assert.equal(f.calls(), 1);
  release();
  assert.equal((await first).status, "executed");
});

test("pre-cancellation creates no durable operation and invokes no handler", async t => {
  const f = await setup(t);
  const controller = new AbortController();
  controller.abort();
  const result = await f.dispatcher.dispatch(invocation, context({ signal: controller.signal }));
  assert.equal(result.status, "failed");
  assert.equal(f.store.list("durable-execution").length, 0);
  assert.equal(f.calls(), 0);
});

test("cancellation during the handler records Uncertain and blocks replay", async t => {
  const controller = new AbortController();
  const f = await setup(t, { handler: async () => { controller.abort(); return "effect-already-happened"; } });
  const result = await f.dispatcher.dispatch(invocation, context({ signal: controller.signal }));
  assert.equal(result.status, "failed");
  assert.equal(f.store.get(result.operationId!)?.state, "Uncertain");
  assert.equal((await f.dispatcher.dispatch(invocation, context())).status, "denied");
  assert.equal(f.calls(), 1);
});

test("handler failures are sanitized and remain durably Uncertain", async t => {
  const f = await setup(t, { handler: async () => { throw new Error("fixture-sensitive-exception-marker"); } });
  const result = await f.dispatcher.dispatch(invocation, context());
  assert.equal(result.status, "failed");
  assert.equal(result.operationState, "Uncertain");
  assert.doesNotMatch(JSON.stringify(result), /fixture-sensitive-exception-marker/);
  assert.equal(f.store.get(result.operationId!)?.state, "Uncertain");
  assert.equal((await f.dispatcher.dispatch(invocation, context())).status, "denied");
  assert.equal(f.calls(), 1);
});

test("storage failure before Running cannot invoke a handler or reuse consumption", async t => {
  const f = await setup(t, {
    storeOverride: store => wrap(store, { start() { throw new Error("fixture-storage-private-path"); } }),
  });
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const pending = await f.dispatcher.dispatch(invocation, ctx);
  await f.service.decide(pending.approvalId!, "fixture-authentication", true);
  const result = await f.dispatcher.dispatch(invocation, ctx, pending.approvalId);
  assert.equal(result.status, "failed");
  assert.equal(f.store.get(pending.operationId!)?.state, "Prepared");
  assert.equal(f.store.approval(pending.approvalId!)?.status, "consumed");
  assert.doesNotMatch(JSON.stringify(result), /fixture-storage-private-path/);
  assert.equal((await f.dispatcher.dispatch(invocation, ctx, pending.approvalId)).status, "denied");
  assert.equal(f.calls(), 0);
});

test("failure to persist a completed effect never returns executed", async t => {
  const f = await setup(t, {
    storeOverride: store => wrap(store, {
      finish(id, version, state, digest) {
        if (state === "Completed") throw new Error("fixture-disk-full-marker");
        return store.finish(id, version, state, digest);
      },
    }),
  });
  const result = await f.dispatcher.dispatch(invocation, context());
  assert.equal(result.status, "failed");
  assert.equal(f.store.get(result.operationId!)?.state, "Uncertain");
  assert.doesNotMatch(JSON.stringify(result), /fixture-disk-full-marker/);
  assert.equal((await f.dispatcher.dispatch(invocation, context())).status, "denied");
  assert.equal(f.calls(), 1);
});

test("lost commit acknowledgement after Completed still blocks a repeated effect", async t => {
  const f = await setup(t, {
    storeOverride: store => wrap(store, {
      finish(id, version, state, digest) {
        const result = store.finish(id, version, state, digest);
        if (state === "Completed") throw new Error("fixture-lost-ack");
        return result;
      },
    }),
  });
  const result = await f.dispatcher.dispatch(invocation, context());
  assert.equal(result.status, "failed");
  const op = f.store.list("durable-execution")[0]!;
  assert.equal(op.state, "Completed");
  assert.equal((await f.dispatcher.dispatch(invocation, context())).status, "denied");
  assert.equal(f.calls(), 1);
});

test("closed SQLite storage fails before any handler invocation", async t => {
  const f = await setup(t);
  f.store.close();
  const result = await f.dispatcher.dispatch(invocation, context());
  assert.equal(result.status, "denied");
  assert.equal(f.calls(), 0);
});

test("durable approval authentication rejects empty credentials, wrong roles and verifier errors", async t => {
  const f = await setup(t);
  const pending = await f.dispatcher.dispatch(invocation, context({ requireApprovalFor: ["files:read"] }));
  let verified = 0;
  const wrongRole = new DurableApprovalService(f.store, {
    async verify() { verified++; return { ...approver, roles: [] }; },
  });
  await assert.rejects(wrongRole.decide(pending.approvalId!, "", true), /authentication required/);
  assert.equal(verified, 0);
  await assert.rejects(wrongRole.decide(pending.approvalId!, "fixture-authentication", true), /authentication required/);
  const failing = new DurableApprovalService(f.store, {
    async verify() { throw new Error("fixture-sensitive-credential-error"); },
  });
  await assert.rejects(failing.decide(pending.approvalId!, "fixture-authentication", true), error => {
    assert.match(String(error), /authentication required/);
    assert.doesNotMatch(String(error), /fixture-sensitive-credential-error/);
    return true;
  });
  assert.equal(f.store.approval(pending.approvalId!)?.status, "pending");
  assert.equal(f.calls(), 0);
});

test("concurrent authenticated decisions produce one durable decision", async t => {
  const f = await setup(t);
  const pending = await f.dispatcher.dispatch(invocation, context({ requireApprovalFor: ["files:read"] }));
  const results = await Promise.allSettled([
    f.service.decide(pending.approvalId!, "fixture-authentication", true),
    f.service.decide(pending.approvalId!, "fixture-authentication", false),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(f.store.events(pending.operationId!).filter(event =>
    event.type === "approval.approved" || event.type === "approval.denied").length, 1);
});

test("durable storage retains digests instead of raw arguments, results or credentials", async t => {
  const argument = "fixture-sensitive-argument-marker.txt";
  const output = "fixture-sensitive-result-marker";
  const credential = "fixture-sensitive-authentication-marker";
  const f = await setup(t, { handler: async () => output });
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const request = { toolId: "file.read", arguments: { path: argument } };
  const pending = await f.dispatcher.dispatch(request, ctx);
  await f.service.decide(pending.approvalId!, credential, true);
  assert.equal((await f.dispatcher.dispatch(request, ctx, pending.approvalId)).status, "executed");
  const bytes = readFileSync(f.filename);
  for (const marker of [argument, output, credential]) assert.equal(bytes.includes(Buffer.from(marker)), false);
  const op = f.store.get(pending.operationId!)!;
  assert.equal(op.argumentDigest, digestDurableValue(request.arguments));
  assert.equal(op.resultDigest, digestDurableValue(output));
});

test("non-JSON and oversized handler results fail closed after Running", async t => {
  for (const [index, value] of [undefined, "x".repeat(16_385)].entries()) {
    const f = await setup(t, { handler: async () => value });
    const result = await f.dispatcher.dispatch(invocation, context({
      operation: { taskId: "task-one", requestId: "result-" + index, toolCallId: "result-call-" + index },
    }));
    assert.equal(result.status, "failed");
    assert.equal(f.store.get(result.operationId!)?.state, "Uncertain");
    assert.equal(f.calls(), 1);
  }
});

test("prepare port failure retires authorization before consumption and blocks retry after reopening", async t => {
  let failPrepare = true;
  const f = await setup(t, {
    storeOverride: store => wrap(store, {
      prepare(id, version, scopeDigest, approvalId) {
        if (failPrepare) {
          failPrepare = false;
          throw new Error("fixture-prepare-port-unavailable");
        }
        return store.prepare(id, version, scopeDigest, approvalId);
      },
    }),
  });
  const ctx = context({ requireApprovalFor: ["files:read"] });
  const pending = await f.dispatcher.dispatch(invocation, ctx);
  await f.service.decide(pending.approvalId!, "fixture-authentication", true);
  const failed = await f.dispatcher.dispatch(invocation, ctx, pending.approvalId);
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(JSON.stringify(failed), /fixture-prepare-port-unavailable/);
  const op = f.store.get(pending.operationId!)!;
  assert.equal(op.state, "Approved");
  assert.equal(f.store.approval(pending.approvalId!)?.status, "approved");
  assert.equal(f.calls(), 0);

  // Restoring the injected port cannot revive the retired session.
  assert.equal((await f.dispatcher.dispatch(invocation, ctx, pending.approvalId)).status, "denied");
  assert.throws(() => f.store.prepare(op.operationId, op.version, op.scopeDigest, pending.approvalId));
  assert.equal(f.store.approval(pending.approvalId!)?.status, "approved");
  assert.equal(f.calls(), 0);

  f.store.close();
  const reopened = await openSqliteOperationJournal(f.filename);
  t.after(() => reopened.close());
  const dispatcher = new ToolDispatcher(f.registry, undefined, { ...f.binding, store: reopened });
  let reopenedCalls = 0;
  dispatcher.registerHandler("file.read", async () => { reopenedCalls++; return "must not execute"; });
  const retried = await dispatcher.dispatch(invocation, ctx, pending.approvalId);
  assert.equal(retried.status, "denied");
  assert.equal(reopenedCalls, 0);
  assert.equal(reopened.get(op.operationId)?.state, "Approved");
  assert.equal(reopened.approval(pending.approvalId!)?.status, "approved");
});
