import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { chmod, mkdtemp, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { type RepairSession, type RepairAccounting, type RepairPolicy, type OperationRequest } from "@ai-harness/contracts";
import { openSqliteOperationJournal } from "../sqlite-journal.js";
import { validateRepairPolicy } from "../repair-journal.js";

const d = "a".repeat(64), e = "b".repeat(64);
const zero = (): RepairAccounting => ({ iterations: 0, providerRequests: 0, inputTokens: 0, outputTokens: 0, validations: 0, patchBytes: 0, files: 0, estimatedCostUsd: 0 });
export const repairPolicy = (): RepairPolicy => ({ version: 1, enabled: true, maxIterations: 3, maxProviderRequests: 4, maxInputTokens: 1000, maxOutputTokens: 1000, maxGlobalMs: 60000, maxProviderMs: 5000, maxValidationMs: 1000, maxValidations: 3, maxFiles: 12, maxPatchBytes: 12000, maxEstimatedCostUsd: 1, allowUnknownCost: false, requireHumanApprovalForEachPatch: true, requireSeparateSandboxApproval: true, stopOnUncertainState: true, stopOnNoProgress: true });
export function repairSession(): RepairSession {
  return { schemaVersion: 1, sessionId: "repair-execution", executionId: "execution", projectId: "synthetic", ownerId: "123", policyDigest: d, profileDigest: e, profileId: "synthetic-a", actionId: "test", originalObjective: "Correct synthetic code", sourceRevision: d, initialOperationId: "initial", currentOperationId: "initial", workspaceId: "workspace", baseSnapshotDigest: d, state: "RepairRequested", iteration: 0, version: 0, createdAt: "2026-11-25T00:00:00.000Z", updatedAt: "2026-11-25T00:00:00.000Z", deadlineAt: "2026-11-25T00:01:00.000Z", policy: repairPolicy(), consumed: zero(), reserved: zero(), iterations: [], diagnosticDigest: d,
    lastValidation: { schemaVersion: 1, validationId: "initial-validation", operationId: "validate-initial", executionId: "execution", workspaceId: "workspace", snapshotId: "initial-snapshot", snapshotDigest: d, transferDigest: e, actionId: "test", runtimeProfile: "node-isolated-v1", imageDigest: d, startedAt: "2026-11-25T00:00:00.000Z", completedAt: "2026-11-25T00:00:00.001Z", durationMs: 1, exitCode: 1, classification: "failed", timedOut: false, cancelled: false, cleanup: "confirmed", outputDigest: d, diagnostics: ["test_failed"] } };
}
async function fixture(t: TestContext) {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "harness-repair-journal-"))); await chmod(dir, 0o700);
  t.after(() => rm(dir, { recursive: true, force: true })); return path.join(dir, "journal.db");
}
function next(s: RepairSession, state: RepairSession["state"]): RepairSession { return { ...structuredClone(s), state, version: s.version + 1 }; }
const oldRequest: OperationRequest = { executionId: "old-execution", taskId: "task", requestId: "request", projectRoot: "/synthetic", toolId: "file.read", argumentDigest: d, permission: "files:read", risk: "low", safety: "read_only", requester: { issuer: "fixture", subject: "operator" }, requiresApproval: true };

test("repair journal lazily migrates v3 to v4 preserving approvals and integrity", async t => {
  const file = await fixture(t); let store = await openSqliteOperationJournal(file);
  const old = store.register(oldRequest).operation; store.decide(old.approvalId!, old.requester, true);
  assert.equal(store.repair?.get("repair-execution"), null); store.close();
  let db = new DatabaseSync(file); assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 3); db.close();
  store = await openSqliteOperationJournal(file); const session = store.repair!.create(repairSession());
  const proposed = next(session, "AnalyzingDiagnostics"); proposed.consumed.providerRequests = 1; proposed.reserved.inputTokens = 100;
  store.repair!.compareAndSwap(session.sessionId, 0, proposed); store.close();
  store = await openSqliteOperationJournal(file); t.after(() => store.close());
  assert.equal(store.approval(old.approvalId!)?.status, "approved");
  assert.deepEqual(store.repair!.get(session.sessionId), proposed);
  assert.deepEqual(store.repair!.history(session.sessionId), [session, proposed]);
  db = new DatabaseSync(file); t.after(() => db.close());
  assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 4);
  assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  assert.equal(db.prepare("PRAGMA foreign_key_check").get(), undefined);
});

test("repair journal CAS rejects stale concurrent writers and immutable policy changes", async t => {
  const file = await fixture(t), a = await openSqliteOperationJournal(file), b = await openSqliteOperationJournal(file);
  t.after(() => { a.close(); b.close(); }); const s = a.repair!.create(repairSession());
  const n = next(s, "AnalyzingDiagnostics"); a.repair!.compareAndSwap(s.sessionId, 0, n);
  assert.throws(() => b.repair!.compareAndSwap(s.sessionId, 0, n));
  for (const mutated of [
    { ...next(n, "RepairProposed"), ownerId: "456" }, { ...next(n, "RepairProposed"), profileDigest: d },
    { ...next(n, "RepairProposed"), policy: { ...n.policy, maxIterations: 4 } },
    { ...next(n, "RepairProposed"), deadlineAt: "2026-11-25T00:02:00.000Z" },
  ]) assert.throws(() => a.repair!.compareAndSwap(s.sessionId, 1, mutated));
  assert.deepEqual(a.repair!.get(s.sessionId), n); assert.equal(a.repair!.history(s.sessionId).length, 2);
});

test("durable repair accounting reserves before effect and rejects overflow, negatives and reset", async t => {
  const file = await fixture(t), store = await openSqliteOperationJournal(file); t.after(() => store.close());
  let s = store.repair!.create(repairSession()); let n = next(s, "AnalyzingDiagnostics"); n.consumed.providerRequests = 1; n.reserved.inputTokens = 1000;
  s = store.repair!.compareAndSwap(s.sessionId, s.version, n);
  for (const value of [-1, Number.MAX_SAFE_INTEGER, Infinity, NaN]) {
    n = next(s, "RepairProposed"); n.consumed.inputTokens = value; assert.throws(() => store.repair!.compareAndSwap(s.sessionId, s.version, n));
  }
  n = next(s, "RepairProposed"); n.consumed.inputTokens = 1; assert.throws(() => store.repair!.compareAndSwap(s.sessionId, s.version, n));
  n = next(s, "RepairProposed"); n.consumed.providerRequests = 0; n.reserved.inputTokens = 0; assert.throws(() => store.repair!.compareAndSwap(s.sessionId, s.version, n));
  n = next(s, "RepairProposed"); n.consumed.inputTokens = 42; n.reserved.inputTokens = 0; s = store.repair!.compareAndSwap(s.sessionId, s.version, n);
  assert.equal(s.consumed.inputTokens, 42); assert.equal(s.consumed.providerRequests, 1);
});

test("uncertain in-flight repair closes conservatively without replay and terminal states cannot restart", async t => {
  const file = await fixture(t); let store = await openSqliteOperationJournal(file); let s = store.repair!.create(repairSession());
  const running = next(s, "AnalyzingDiagnostics"); running.consumed.providerRequests = 1; running.reserved.outputTokens = 500;
  s = store.repair!.compareAndSwap(s.sessionId, s.version, running); store.close();
  store = await openSqliteOperationJournal(file); t.after(() => store.close());
  const stopped = next(store.repair!.get(s.sessionId)!, "ReconciliationRequired");
  store.repair!.compareAndSwap(s.sessionId, s.version, stopped);
  assert.equal(stopped.reserved.outputTokens, 500);
  assert.throws(() => store.repair!.compareAndSwap(s.sessionId, stopped.version, next(stopped, "RepairRequested")));
});

test("invalid repair policy and identity never migrate or create records", async t => {
  const file = await fixture(t), store = await openSqliteOperationJournal(file); t.after(() => store.close());
  for (const policy of [ { ...repairPolicy(), maxIterations: 0 }, { ...repairPolicy(), maxGlobalMs: 900001 }, { ...repairPolicy(), maxEstimatedCostUsd: -1 }, { ...repairPolicy(), requireSeparateSandboxApproval: false }, { ...repairPolicy(), allowUnknownCost: undefined } ]) assert.throws(() => validateRepairPolicy(policy as RepairPolicy));
  for (const mutated of [{ ...repairSession(), ownerId: "model" }, { ...repairSession(), consumed: { ...zero(), estimatedCostUsd: null } }, { ...repairSession(), originalObjective: "x".repeat(4097) }]) assert.throws(() => store.repair!.create(mutated));
  assert.equal(store.repair!.get("repair-execution"), null);
  const db = new DatabaseSync(file); t.after(() => db.close()); assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 3);
});

test("repair migration SQLITE_FULL rolls back schema without changing existing approval", async t => {
  const file = await fixture(t); let store = await openSqliteOperationJournal(file, { maxDatabaseBytes: 131072 });
  const old = store.register(oldRequest).operation; store.decide(old.approvalId!, old.requester, true); store.close();
  const db = new DatabaseSync(file); const pages = Number(db.prepare("PRAGMA page_count").get()?.page_count); db.close();
  store = await openSqliteOperationJournal(file, { maxDatabaseBytes: pages * 4096 });
  assert.throws(() => store.repair!.create(repairSession()));
  assert.equal(store.approval(old.approvalId!)?.status, "approved"); store.close();
  store = await openSqliteOperationJournal(file); t.after(() => store.close()); assert.equal(store.repair!.get("repair-execution"), null);
  const check = new DatabaseSync(file); t.after(() => check.close()); assert.equal(check.prepare("PRAGMA user_version").get()?.user_version, 3); assert.equal(check.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
});

test("independent processes allow exactly one CAS claim of the provider reservation", { timeout: 15000 }, async t => {
  const file = await fixture(t); const store = await openSqliteOperationJournal(file); store.repair!.create(repairSession()); store.close();
  const children = [0, 1].map(() => fork(fileURLToPath(new URL("./repair-journal-worker.js", import.meta.url)), [file], { stdio: ["ignore", "ignore", "ignore", "ipc"] }));
  t.after(() => { for (const child of children) child.kill("SIGKILL"); });
  const exited = children.map(child => once(child, "exit"));
  await Promise.all(children.map(child => once(child, "message")));
  const done = children.map(child => once(child, "message")); for (const child of children) child.send("go");
  const messages = (await Promise.all(done)).map(([m]) => m);
  assert.equal(messages.filter(m => m === "claimed").length, 1); assert.equal(messages.filter(m => m === "blocked").length, 1);
  await Promise.all(exited);
  const final = await openSqliteOperationJournal(file); t.after(() => final.close());
  assert.equal(final.repair!.get("repair-execution")!.consumed.providerRequests, 1);
  assert.equal(final.repair!.history("repair-execution").length, 2);
});

test("unknown cost remains unknown and pending reservations cannot be erased on cancellation", async t => {
  const file = await fixture(t), store = await openSqliteOperationJournal(file); t.after(() => store.close());
  const initial = repairSession(); initial.policy.allowUnknownCost = true;
  let s = store.repair!.create(initial); let n = next(s, "AnalyzingDiagnostics"); n.consumed.estimatedCostUsd = null; n.reserved.inputTokens = 20;
  s = store.repair!.compareAndSwap(s.sessionId, s.version, n);
  n = next(s, "Cancelled"); n.reserved.inputTokens = 0;
  assert.throws(() => store.repair!.compareAndSwap(s.sessionId, s.version, n));
  n = next(s, "RepairProposed"); n.reserved.inputTokens = 0; n.consumed.estimatedCostUsd = 0;
  assert.throws(() => store.repair!.compareAndSwap(s.sessionId, s.version, n));
  n = next(s, "Cancelled"); store.repair!.compareAndSwap(s.sessionId, s.version, n);
  assert.equal(store.repair!.get(s.sessionId)!.consumed.estimatedCostUsd, null);
});

test("repair session cannot claim Passed before authorized validation and published iteration identities cannot change", async t => {
  const file = await fixture(t), store = await openSqliteOperationJournal(file); t.after(() => store.close());
  let s = store.repair!.create(repairSession());
  assert.throws(() => store.repair!.compareAndSwap(s.sessionId, s.version, next(s, "Completed")));
  let n = next(s, "AnalyzingDiagnostics"); n.iteration = 1; n.consumed.iterations = 1; n.iterations = [{ id: "iteration-1", index: 1, baseSnapshotDigest: d, diagnosticDigest: e }];
  s = store.repair!.compareAndSwap(s.sessionId, s.version, n);
  n = next(s, "RepairProposed"); n.iterations = [{ ...n.iterations[0]!, baseSnapshotDigest: e }];
  assert.throws(() => store.repair!.compareAndSwap(s.sessionId, s.version, n));
  assert.equal(store.repair!.history(s.sessionId).length, 2);
});
