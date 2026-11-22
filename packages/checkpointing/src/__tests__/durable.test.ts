import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { chmod, link, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  assertOperationTransition, OPERATION_STATES, isTerminalOperationState,
  type DurableOperationStore, type OperationRequest,
} from "@ai-harness/contracts";
import { openSqliteOperationJournal } from "../sqlite-journal.js";
import { inspectPendingDurableRecovery, planDurableOperationRecovery } from "../durable-recovery.js";

const actor = { issuer: "fixture", subject: "host" };
function request(overrides: Partial<OperationRequest> = {}): OperationRequest {
  return {
    executionId: "execution", taskId: "task", requestId: "request", toolCallId: "call",
    projectRoot: "/fixture", toolId: "file.read", argumentDigest: "a".repeat(64),
    permission: "files:read", risk: "low", safety: "read_only", requester: actor,
    requiresApproval: true, ...overrides,
  };
}
async function fixture(t: TestContext) {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "harness-durable-")));
  await chmod(dir, 0o700);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "journal.db");
  return { dir, filename };
}
function approve(store: DurableOperationStore, overrides: Partial<OperationRequest> = {}) {
  const { operation: op } = store.register(request(overrides));
  store.decide(op.approvalId!, actor, true);
  return store.get(op.operationId)!;
}
const transitions: Record<string, string[]> = {
  Created: ["PendingApproval", "Prepared", "Cancelled", "Failed"],
  PendingApproval: ["Approved", "Cancelled"], Approved: ["Prepared", "Cancelled"],
  Prepared: ["Running", "Cancelled", "Uncertain"], Running: ["Completed", "Uncertain"],
  Uncertain: ["Completed", "Cancelled"], Completed: [], Failed: [], Cancelled: [],
};
test("state machine checks every pair; uncertainty is blocked rather than terminal", () => {
  for (const from of OPERATION_STATES) for (const to of OPERATION_STATES) {
    if (transitions[from]!.includes(to)) assert.doesNotThrow(() => assertOperationTransition(from, to));
    else assert.throws(() => assertOperationTransition(from, to));
  }
  assert.equal(isTerminalOperationState("Uncertain"), false);
  for (const state of ["Completed", "Cancelled", "Failed"] as const) assert.equal(isTerminalOperationState(state), true);
});

test("SQLite persists records, decisions and event history across close/reopen", async t => {
  const { filename } = await fixture(t);
  let store = await openSqliteOperationJournal(filename);
  let op = approve(store);
  op = store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId)!;
  op = store.start(op.operationId, op.version);
  op = store.finish(op.operationId, op.version, "Completed", "b".repeat(64));
  const events = store.events(op.operationId);
  store.close();
  store = await openSqliteOperationJournal(filename); t.after(() => store.close());
  assert.deepEqual(store.get(op.operationId), op);
  assert.deepEqual(store.events(op.operationId), events);
  assert.equal(store.approval(op.approvalId!)?.status, "consumed");
  assert.equal(store.register(request()).duplicate, true);
  assert.equal(planDurableOperationRecovery(op).action, "skip");
  assert.equal(store.pending().length, 0);
});

for (const state of ["Created", "PendingApproval", "Approved", "Prepared", "Running"] as const) {
  test("reopening cannot continue old session " + state, async t => {
    const { filename } = await fixture(t);
    let store = await openSqliteOperationJournal(filename);
    let op = store.register(request({ requiresApproval: state !== "Created" })).operation;
    if (["Approved", "Prepared", "Running"].includes(state)) {
      store.decide(op.approvalId!, actor, true); op = store.get(op.operationId)!;
    }
    if (state === "Prepared" || state === "Running") op = store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId)!;
    if (state === "Running") op = store.start(op.operationId, op.version);
    store.close(); store = await openSqliteOperationJournal(filename); t.after(() => store.close());
    assert.throws(() => store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId));
    assert.throws(() => store.start(op.operationId, op.version));
    assert.throws(() => store.finish(op.operationId, op.version, "Completed"));
    if (state === "PendingApproval") assert.throws(() => store.decide(op.approvalId!, actor, true));
    const found = inspectPendingDurableRecovery(store);
    assert.equal(found[0]?.operationId, op.operationId); assert.equal(found[0]?.retryAllowed, false);
    const reconciled = store.reconcile(op.operationId, op.version, actor, { kind: "host_quiesced", reference: "workers-fenced" });
    assert.equal(reconciled.state, state === "Prepared" || state === "Running" ? "Uncertain" : "Cancelled");
    if (reconciled.state === "Uncertain") {
      const resolved = store.reconcile(op.operationId, reconciled.version, actor, { kind: "confirmed_no_effect", reference: "external-inspection" });
      assert.equal(resolved.state, "Cancelled");
    }
    assert.throws(() => store.reconcile(op.operationId, op.version, actor, { kind: "host_quiesced", reference: "stale" }));
  });
}
test("prepare consumes approval with state/event in one transaction; cannot consume twice", async t => {
  const { filename } = await fixture(t);
  const store = await openSqliteOperationJournal(filename); t.after(() => store.close());
  const op = approve(store);
  assert.throws(() => store.prepare(op.operationId, op.version, "f".repeat(64), op.approvalId));
  assert.throws(() => store.prepare(op.operationId, op.version, op.scopeDigest, "foreign"));
  assert.equal(store.approval(op.approvalId!)?.status, "approved");
  const prepared = store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId)!;
  assert.equal(prepared.state, "Prepared"); assert.equal(store.approval(op.approvalId!)?.status, "consumed");
  assert.throws(() => store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId));
  assert.throws(() => store.prepare(op.operationId, prepared.version, op.scopeDigest, op.approvalId));
  assert.throws(() => store.revoke(op.approvalId!, actor));
});
test("failed event insert rolls back both consumed grant and Prepared", async t => {
  const { filename } = await fixture(t);
  const store = await openSqliteOperationJournal(filename); t.after(() => store.close());
  const op = approve(store);
  const db = new DatabaseSync(filename); t.after(() => db.close());
  db.exec("CREATE TRIGGER fixture_failure BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  assert.throws(() => store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId));
  assert.equal(store.approval(op.approvalId!)?.status, "approved");
  assert.equal(store.get(op.operationId)?.state, "Approved");
  db.exec("DROP TRIGGER fixture_failure");
  assert.throws(() => store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId));
  assert.equal(store.approval(op.approvalId!)?.status, "approved");
});
test("expiry is checked at decision, consumption and just before Running", async t => {
  const { filename } = await fixture(t); let now = 1_000;
  const store = await openSqliteOperationJournal(filename, { now: () => now, approvalTtlMs: 10 }); t.after(() => store.close());
  const pending = store.register(request()).operation;
  now = 1_010; assert.throws(() => store.decide(pending.approvalId!, actor, true));
  now = 2_000; const op = approve(store, { requestId: "two", toolCallId: "two" });
  now = 2_010; assert.equal(store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId), null);
  assert.equal(store.get(op.operationId)?.state, "Cancelled"); assert.equal(store.approval(op.approvalId!)?.status, "expired");
  now = 3_000; const third = approve(store, { requestId: "three", toolCallId: "three" });
  const prepared = store.prepare(third.operationId, third.version, third.scopeDigest, third.approvalId)!;
  now = 3_010; assert.throws(() => store.start(third.operationId, prepared.version));
  assert.equal(store.get(third.operationId)?.state, "Cancelled"); assert.equal(store.approval(third.approvalId!)?.status, "consumed");
});
for (const approved of [false, true]) test("denial/revocation blocks preparation " + approved, async t => {
  const { filename } = await fixture(t); const store = await openSqliteOperationJournal(filename); t.after(() => store.close());
  let op = store.register(request()).operation;
  store.decide(op.approvalId!, actor, approved);
  if (approved) store.revoke(op.approvalId!, actor);
  op = store.get(op.operationId)!;
  assert.equal(op.state, "Cancelled"); assert.throws(() => store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId));
});
test("request/call uniqueness and changed scope fail closed; listing is bounded", async t => {
  const { filename } = await fixture(t); const store = await openSqliteOperationJournal(filename); t.after(() => store.close());
  const original = store.register(request()).operation;
  for (const update of [
    { argumentDigest: "c".repeat(64) }, { permission: "files:write" as const },
    { requiresApproval: false }, { projectRoot: "/changed" }, { safety: "side_effecting" as const },
    { toolCallId: "changed" }, { requester: { issuer: "fixture", subject: "other" } },
  ]) assert.throws(() => store.register(request(update)));
  assert.throws(() => store.register(request({ requestId: "other" })));
  store.register(request({ requestId: "next", toolCallId: "next" }));
  const page = store.list("execution", "", 1);
  assert.equal(page.length, 1); assert.equal(store.list("execution", page[0]!.operationId, 1).length, 1);
  assert.throws(() => store.pending("", 1001)); assert.throws(() => store.list("execution", "", 0));
  assert.equal(store.register(request()).operation.operationId, original.operationId);
});
test("reconciliation requires a matching version and records actor/evidence without automatic replay", async t => {
  const { filename } = await fixture(t); const store = await openSqliteOperationJournal(filename); t.after(() => store.close());
  let op = approve(store); op = store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId)!; op = store.start(op.operationId, op.version);
  assert.throws(() => store.reconcile(op.operationId, op.version, actor, { kind: "confirmed_completed", reference: "no-running-inference" }));
  op = store.reconcile(op.operationId, op.version, actor, { kind: "host_quiesced", reference: "processes-stopped" });
  assert.equal(planDurableOperationRecovery(op).action, "blocked");
  assert.throws(() => store.finish(op.operationId, op.version, "Completed"));
  op = store.reconcile(op.operationId, op.version, actor, { kind: "confirmed_completed", reference: "trusted-external-record" });
  assert.equal(op.state, "Completed");
  assert.deepEqual(store.events(op.operationId).at(-1)?.actor, actor);
  assert.equal(store.events(op.operationId).at(-1)?.evidenceRef, "trusted-external-record");
});

for (const corrupt of ["physical", "payload", "missing_approval", "missing_event", "state", "version"] as const) {
  test("corruption is rejected without recreation: " + corrupt, async t => {
    const { filename } = await fixture(t);
    const store = await openSqliteOperationJournal(filename); approve(store); store.close();
    if (corrupt === "physical") await writeFile(filename, "not a SQLite database");
    else {
      const db = new DatabaseSync(filename);
      if (corrupt === "payload") db.exec("UPDATE operations SET data='{}'");
      if (corrupt === "missing_approval") db.exec("DELETE FROM approvals");
      if (corrupt === "missing_event") db.exec("DELETE FROM events");
      if (corrupt === "state") db.exec("UPDATE operations SET state='Running'");
      if (corrupt === "version") db.exec("PRAGMA user_version=999");
      db.close();
    }
    const bytes = await readFile(filename);
    await assert.rejects(openSqliteOperationJournal(filename), /unavailable or invalid/);
    assert.deepEqual(await readFile(filename), bytes);
  });
}
test("private filesystem validation rejects unsafe mode, symlink and hardlink", async t => {
  const { filename, dir } = await fixture(t);
  const store = await openSqliteOperationJournal(filename); store.close();
  await chmod(filename, 0o644); await assert.rejects(openSqliteOperationJournal(filename)); await chmod(filename, 0o600);
  const sym = path.join(dir, "symlink.db"); await symlink(filename, sym); await assert.rejects(openSqliteOperationJournal(sym));
  const hard = path.join(dir, "hardlink.db"); await link(filename, hard); await assert.rejects(openSqliteOperationJournal(filename)); await rm(hard);
  await chmod(dir, 0o755); await assert.rejects(openSqliteOperationJournal(filename)); await chmod(dir, 0o700);
});
test("real SQLite lock/storage failures leave authorization unconsumed", async t => {
  const { filename } = await fixture(t);
  const store = await openSqliteOperationJournal(filename); t.after(() => { try { store.close(); } catch { /* Already closed fixture. */ } });
  const op = approve(store); const blocker = new DatabaseSync(filename); t.after(() => blocker.close());
  blocker.exec("BEGIN IMMEDIATE");
  assert.throws(() => store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId), /unavailable/);
  blocker.exec("ROLLBACK");
  assert.equal(store.approval(op.approvalId!)?.status, "approved");
  assert.equal(store.get(op.operationId)?.state, "Approved");
  store.close(); assert.throws(() => store.register(request({ requestId: "closed" })));
  // Avoid a second close in the cleanup.
  t.after(() => {});
});

type Message = { type: string; outcome?: string; operationId?: string };
async function worker(filename: string, mode: string, requestId = "request", callId = "call") {
  const child = fork(fileURLToPath(new URL("./durable-worker.js", import.meta.url)), [filename, mode, requestId, callId],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const wait = (type: string) => new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Worker fixture deadline")); }, 10_000);
    const receive = (message: Message) => {
      if (message.type === type) { clearTimeout(timer); child.off("message", receive); child.off("exit", exited); resolve(message); }
    };
    const exited = () => { clearTimeout(timer); child.off("message", receive); reject(new Error("Worker exited before " + type)); };
    child.on("message", receive); child.once("exit", exited);
  });
  await wait("ready");
  return { child, wait };
}
async function kill(child: ChildProcess) {
  const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
}
for (const mode of ["prepared", "running", "effect", "transaction"]) {
  test("real SIGKILL + new store preserves conservative recovery: " + mode, { timeout: 20_000 }, async t => {
    const { filename } = await fixture(t);
    const active = await worker(filename, mode);
    t.after(() => { active.child.kill("SIGKILL"); });
    const paused = active.wait("paused"); active.child.send("go"); const message = await paused;
    await kill(active.child);
    const store = await openSqliteOperationJournal(filename); t.after(() => store.close());
    let op = store.get(message.operationId!)!;
    assert.equal(op.state, mode === "transaction" ? "Approved" : mode === "prepared" ? "Prepared" : "Running");
    assert.equal(store.approval(op.approvalId!)?.status, mode === "transaction" ? "approved" : "consumed");
    assert.throws(() => store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId));
    assert.equal(inspectPendingDurableRecovery(store)[0]?.retryAllowed, false);
    op = store.reconcile(op.operationId, op.version, actor, { kind: "host_quiesced", reference: "sigkill-confirmed" });
    assert.equal(op.state, mode === "transaction" ? "Cancelled" : "Uncertain");
    if (mode === "effect") {
      assert.equal(await readFile(filename + ".effect", "utf8"), "effect\n");
      assert.equal(store.register(request({ safety: "side_effecting", requester: { issuer: "fixture", subject: "requester" } })).duplicate, true);
      assert.equal(await readFile(filename + ".effect", "utf8"), "effect\n");
    }
  });
}
for (const race of ["same_request", "same_call"]) {
  test("real concurrent processes admit one operation/effect: " + race, { timeout: 20_000 }, async t => {
    const { filename } = await fixture(t);
    const workers = await Promise.all([worker(filename, "complete"), worker(filename, "complete", race === "same_call" ? "different" : "request")]);
    t.after(() => { for (const item of workers) item.child.kill("SIGKILL"); });
    const done = workers.map(item => item.wait("done")); for (const item of workers) item.child.send("go");
    const results = await Promise.all(done); for (const item of workers) await kill(item.child);
    assert.equal(results.filter(result => result.outcome === "completed").length, 1);
    assert.equal(results.filter(result => result.outcome === "blocked").length, 1);
    assert.equal(await readFile(filename + ".effect", "utf8"), "effect\n");
    const store = await openSqliteOperationJournal(filename); t.after(() => store.close());
    assert.equal(store.list("execution").length, 1);
    assert.equal(store.list("execution")[0]?.state, "Completed");
  });
}

test("real SQLITE_FULL rolls back a request and never destroys existing approvals", async t => {
  const { filename } = await fixture(t);
  const store = await openSqliteOperationJournal(filename, { maxDatabaseBytes: 65_536 });
  const authorized = approve(store);
  let rejected = -1;
  for (let i = 0; i < 100; i++) {
    try {
      store.register(request({ requestId: "capacity-" + i, toolCallId: "capacity-" + i, requiresApproval: false }));
    } catch { rejected = i; break; }
  }
  assert.notEqual(rejected, -1, "The real SQLite page cap must be reached");
  assert.equal(store.approval(authorized.approvalId!)?.status, "approved");
  assert.equal(store.list("execution", "", 1000).some(op => op.requestId === "capacity-" + rejected), false);
  const prior = store.list("execution", "", 1000);
  store.close();
  const reopened = await openSqliteOperationJournal(filename, { maxDatabaseBytes: 65_536 });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.list("execution", "", 1000), prior);
  assert.equal(reopened.approval(authorized.approvalId!)?.status, "approved");
});
test("invalid input and storage budgets cannot create authorization records", async t => {
  const { filename } = await fixture(t);
  await assert.rejects(openSqliteOperationJournal(filename, { maxDatabaseBytes: 128 * 1024 * 1024 }));
  const store = await openSqliteOperationJournal(filename); t.after(() => store.close());
  for (const change of [
    { requestId: "" }, { taskId: "x".repeat(129) }, { argumentDigest: "invalid" },
    { projectRoot: "relative" }, { requester: { issuer: "", subject: "missing" } },
  ]) assert.throws(() => store.register(request(change)));
  assert.equal(store.pending().length, 0);
});
