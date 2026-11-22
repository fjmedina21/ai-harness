import assert from "node:assert/strict";
import test from "node:test";
import {
  ToolCallingSession,
  parseToolCallingContinuation,
  TOOL_SESSION_LIMITS,
} from "../index.js";
import type {
  ModelToolRequest,
  ToolCallingProviderAdapter,
  SessionToolCallingProviderAdapter,
} from "../index.js";

const identity = { executionId: "execution_1", taskId: "task_1" };
const call = (id = "call_1") => ({
  id,
  toolId: "file.read",
  arguments: { path: "README.md" },
});
const turn = (ids = ["call_1"]) => ({
  kind: "tool_calls",
  calls: ids.map(call),
});
const result = (callId = "call_1") => ({
  callId,
  toolId: "file.read",
  status: "executed",
  data: { text: "hello" },
});
function pending(
  options: ConstructorParameters<typeof ToolCallingSession>[1] = {},
) {
  const session = new ToolCallingSession(identity, options);
  session.recordTurn(identity, turn());
  return session;
}

test("continuation preserves multiple batches and a stable execution/task identity", () => {
  const session = new ToolCallingSession(identity);
  assert.deepEqual(session.continuation(), { identity, history: [] });
  session.recordTurn(identity, turn(["call_1", "call_2"]));
  session.recordResults(identity, [result("call_2"), result()]);
  session.recordTurn(identity, turn(["call_3"]));
  session.recordResults(identity, [result("call_3")]);
  const continuation = session.continuation();
  assert.equal(continuation.history.length, 4);
  assert.deepEqual(parseToolCallingContinuation(continuation), continuation);
  session.recordTurn(identity, { kind: "message", text: "Done" });
  assert.throws(() => session.continuation(), /completed/);
  assert.throws(() => session.recordTurn(identity, turn()), /completed/);
});

test("sessions isolate both task and execution with no shared history", () => {
  for (const other of [
    { ...identity, taskId: "task_2" },
    { ...identity, executionId: "execution_2" },
  ]) {
    const a = pending();
    const b = new ToolCallingSession(other);
    assert.throws(
      () => a.recordResults(other, [result()]),
      /identity mismatch/,
    );
    assert.throws(() => a.recordTurn(other, turn()), /identity mismatch/);
    assert.deepEqual(b.continuation().history, []);
    assert.throws(() => b.recordResults(other, [result()]), /No pending/);
    assert.equal(a.snapshot().history.length, 1);
  }
});

test("identity, inputs, return values and snapshots cannot mutate retained state", () => {
  const suppliedIdentity = { ...identity };
  const session = new ToolCallingSession(suppliedIdentity);
  suppliedIdentity.taskId = "changed";
  assert.throws(() => {
    (session.identity as { taskId: string }).taskId = "changed";
  });
  const raw = turn();
  const returned = session.recordTurn(identity, raw);
  raw.calls[0]!.arguments.path = "changed";
  if (returned.kind === "tool_calls")
    returned.calls[0]!.arguments.path = "also changed";
  const output = result();
  session.recordResults(identity, [output]);
  output.data.text = "changed";
  const snapshot = session.snapshot();
  (snapshot.history as unknown[]).length = 0;
  const history = session.snapshot().history;
  assert.equal(history.length, 2);
  const first = history[0]!;
  if (first.kind === "model" && first.turn.kind === "tool_calls") {
    assert.equal(first.turn.calls[0]!.arguments.path, "README.md");
  }
  const second = history[1]!;
  if (second.kind === "tool_results")
    assert.deepEqual(second.results[0]!.data, { text: "hello" });
});

test("missing results prevent any subsequent model turn including a final message", () => {
  const session = pending();
  assert.throws(() => session.continuation(), /Missing/);
  assert.throws(
    () =>
      session.recordTurn(identity, {
        kind: "message",
        text: "Fabricated success",
      }),
    /Missing/,
  );
  assert.throws(
    () => parseToolCallingContinuation(session.snapshot()),
    /Missing/,
  );
});

test("result batches reject missing, extra, duplicate, foreign and wrong-tool results atomically", () => {
  const session = new ToolCallingSession(identity);
  session.recordTurn(identity, turn(["call_1", "call_2"]));
  for (const batch of [
    [],
    [result()],
    [result(), result("call_2"), result("call_3")],
    [result(), result()],
    [result(), result("foreign")],
    [result(), { ...result("call_2"), toolId: "git.status" }],
  ]) {
    assert.throws(() => session.recordResults(identity, batch));
    assert.equal(session.snapshot().history.length, 1);
  }
  session.recordResults(identity, [result(), result("call_2")]);
  assert.throws(
    () => session.recordResults(identity, [result(), result("call_2")]),
    /No pending/,
  );
});

test("duplicate call IDs fail within a turn and across turns", () => {
  const session = new ToolCallingSession(identity);
  assert.throws(
    () => session.recordTurn(identity, turn(["same", "same"])),
    /Duplicate/,
  );
  session.recordTurn(identity, turn());
  session.recordResults(identity, [result()]);
  assert.throws(() => session.recordTurn(identity, turn()), /Duplicate/);
  assert.equal(session.snapshot().history.length, 2);
});

test("invalid call and result IDs are never repaired or guessed", () => {
  for (const id of ["", "bad id", "x".repeat(129)]) {
    const session = new ToolCallingSession(identity);
    assert.throws(
      () => session.recordTurn(identity, turn([id])),
      /Invalid tool call ID/,
    );
    session.recordTurn(identity, turn());
    assert.throws(
      () => session.recordResults(identity, [result(id)]),
      /Foreign/,
    );
  }
});

test("executed results require JSON data and cannot carry an error", () => {
  const session = pending();
  for (const value of [
    { callId: "call_1", toolId: "file.read", status: "executed" },
    { ...result(), error: "failed" },
    { ...result(), data: undefined },
    { ...result(), data: NaN },
    { ...result(), data: { value: () => 1 } },
    { ...result(), native: "forbidden" },
  ])
    assert.throws(() => session.recordResults(identity, [value]));
  assert.equal(session.snapshot().history.length, 1);
  session.recordResults(identity, [{ ...result(), data: null }]);
  assert.equal(session.continuation().history.length, 2);
});

for (const status of ["denied", "approval_required", "failed", "invalid"]) {
  test(`${status} results remain non-successful and block continuation`, () => {
    const session = pending();
    assert.throws(() =>
      session.recordResults(identity, [
        { ...result(), status, error: "blocked" },
      ]),
    );
    session.recordResults(identity, [
      { callId: "call_1", toolId: "file.read", status, error: "blocked" },
    ]);
    assert.throws(() => session.continuation(), /Non-executed/);
    assert.throws(
      () => session.recordTurn(identity, { kind: "message", text: "success" }),
      /Non-executed/,
    );
    assert.throws(
      () => parseToolCallingContinuation(session.snapshot()),
      /Non-executed/,
    );
  });
}

test("unknown result statuses, empty errors and unsafe JSON fail closed", () => {
  for (const value of [
    {
      callId: "call_1",
      toolId: "file.read",
      status: "success",
      error: "blocked",
    },
    {
      callId: "call_1",
      toolId: "file.read",
      status: ["failed"],
      error: "blocked",
    },
    { callId: "call_1", toolId: "file.read", status: "failed", error: " " },
    { ...result(), data: JSON.parse('{"__proto__":{"ok":true}}') },
    { ...result(), data: new Date() },
  ])
    assert.throws(() => pending().recordResults(identity, [value]));
});

test("result byte limits count UTF-8 bytes and leave the batch pending", () => {
  const session = pending({ limits: { maxResultBytes: 110 } });
  assert.throws(
    () =>
      session.recordResults(identity, [{ ...result(), data: "😀".repeat(30) }]),
    /size limit/,
  );
  assert.equal(session.snapshot().history.length, 1);
  session.recordResults(identity, [result()]);
});

test("aggregate history limits fail without retaining the rejected entry", () => {
  const session = pending({ limits: { maxHistoryBytes: 200 } });
  assert.throws(
    () => session.recordResults(identity, [result()]),
    /history size/,
  );
  assert.equal(session.snapshot().history.length, 1);
});

test("turn and total-call budgets prevent new work before exceeding bounds", () => {
  const oneTurn = new ToolCallingSession(identity, { limits: { maxTurns: 1 } });
  assert.throws(() => oneTurn.recordTurn(identity, turn()), /No model turn/);
  oneTurn.recordTurn(identity, { kind: "message", text: "done" });
  const session = pending({ limits: { maxTotalCalls: 1 } });
  session.recordResults(identity, [result()]);
  assert.throws(
    () => session.recordTurn(identity, turn(["call_2"])),
    /Total tool call/,
  );
});

test("session budgets are validated and cannot exceed hard ceilings", () => {
  for (const [key, ceiling] of Object.entries(TOOL_SESSION_LIMITS)) {
    for (const value of [0, -1, 1.5, NaN, Infinity, ceiling + 1]) {
      assert.throws(
        () => new ToolCallingSession(identity, { limits: { [key]: value } }),
        /Invalid session limit/,
      );
    }
  }
});

test("cancellation prevents all subsequent transitions without promising rollback", () => {
  const controller = new AbortController();
  const session = pending({ signal: controller.signal });
  controller.abort();
  assert.throws(() => session.assertActive(), /not rolled back/);
  assert.throws(() => session.recordResults(identity, [result()]), /cancelled/);
  assert.throws(() => session.recordTurn(identity, turn()), /cancelled/);
  assert.throws(() => session.continuation(), /cancelled/);
  session.close();
  session.close();
  const preAborted = new ToolCallingSession(identity, {
    signal: controller.signal,
  });
  assert.throws(() => preAborted.continuation(), /cancelled/);
});

test("explicit close is idempotent and blocks reuse without affecting other sessions", () => {
  const session = pending();
  const other = pending();
  session.close();
  session.close();
  for (const action of [
    () => session.snapshot(),
    () => session.continuation(),
    () => session.recordTurn(identity, turn()),
    () => session.recordResults(identity, [result()]),
  ])
    assert.throws(action, /closed/);
  other.recordResults(identity, [result()]);
  assert.equal(other.continuation().history.length, 2);
});

test("continuation parser rejects native fields, invalid ordering and unbounded entries", () => {
  for (const raw of [
    null,
    { identity, history: [], nativeState: {} },
    { identity, history: [{ kind: "tool_results", results: [result()] }] },
    { identity, history: [{ kind: "model", turn: turn(), native: {} }] },
    { identity, history: Array(11).fill({ kind: "model", turn: turn() }) },
    { identity: { ...identity, taskId: "" }, history: [] },
    { identity: { ...identity, provider: "openai" }, history: [] },
  ])
    assert.throws(() => parseToolCallingContinuation(raw));
});

test("legacy providers/requests remain compatible and session support is additive", async () => {
  const provider: ToolCallingProviderAdapter = {
    id: "legacy",
    async completeWithTools() {
      return { kind: "message", text: "unchanged" };
    },
  };
  const request: ModelToolRequest = {
    system: "test",
    prompt: "hello",
    correlationId: "trace_1",
    tools: [],
    toolResults: [],
  };
  assert.equal((await provider.completeWithTools(request)).kind, "message");
  // Compile-time contract: native session lifecycle is separate from neutral history.
  const sessionProvider: SessionToolCallingProviderAdapter = {
    ...provider,
    openSession(scope) {
      const state = new ToolCallingSession(scope);
      return {
        identity: state.identity,
        async completeWithTools() {
          state.assertActive();
          return { kind: "message", text: "fixture only" };
        },
        close: () => state.close(),
      };
    },
  };
  const session = sessionProvider.openSession(identity);
  assert.deepEqual(session.identity, identity);
  session.close();
  await assert.rejects(session.completeWithTools(request), /closed/);
});

test("untrusted continuation identity must match the host-bound identity", () => {
  const continuation = { identity, history: [] };
  assert.deepEqual(
    parseToolCallingContinuation(continuation, identity),
    continuation,
  );
  assert.throws(
    () =>
      parseToolCallingContinuation(continuation, {
        ...identity,
        taskId: "other",
      }),
    /identity mismatch/,
  );
  assert.throws(
    () =>
      parseToolCallingContinuation(continuation, {
        ...identity,
        executionId: "other",
      }),
    /identity mismatch/,
  );
});
