import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";

import { readFileSync } from "node:fs";
import { chmod, lstat, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { DurableStoreError, EngineeringResumeError, canonicalProposalJson, type EngineeringResumeStore, type ProposalReference } from "@ai-harness/contracts";
import { ProposalArtifactStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { ApprovalBroker } from "@ai-harness/security";
import { ContinuationCoordinator } from "../engineering-resume.js";
import { confirmation, credential, directories, generate, openFixture, policy, verifier } from "./resume-fixture.js";

const original = "export const value = 1;\n", changed = "export const value = 2;\n";
const worker = fileURLToPath(new URL("./resume-worker.js", import.meta.url));
async function baseFixture(t: TestContext) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-resume-")));
  await chmod(base, 0o700); await directories(base);
  await writeFile(path.join(base, "source", "value.ts"), original, { mode: 0o600 });
  await writeFile(path.join(base, "source", "second.ts"), original, { mode: 0o600 });
  await writeFile(path.join(base, "source", ".env"), "PRIVATE UNSELECTED SECRET", { mode: 0o600 });
  t.after(() => rm(base, { recursive: true, force: true }));
  return base;
}
async function fixture(t: TestContext, twoFiles = false) {
  const base = await baseFixture(t), g = await generate(base, undefined, twoFiles);
  assert.equal(g.result.termination, "approval_required"); assert.equal(g.calls, 4); assert.ok(g.operationId);
  const { store, artifacts } = await openFixture(base); t.after(() => store.close());
  const id = g.operationId!, ref = store.proposal(id)!;
  assert.ok(ref);
  const coordinator = new ContinuationCoordinator({ store, artifacts, policy, verifier });
  return { base, ...g, id, ref, store, artifacts, coordinator, artifact: artifacts.get(ref.artifactDigest) };
}
function message(child: ChildProcess): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("Fixture worker timed out")); }, 10000);
    const receive = (value: unknown) => { cleanup(); resolve(value); };
    const exit = () => { cleanup(); reject(new Error("Fixture worker exited without evidence")); };
    const cleanup = () => { clearTimeout(timer); child.off("message", receive); child.off("exit", exit); };
    child.once("message", receive); child.once("exit", exit);
  });
}
async function spawn(t: TestContext, base: string, mode: string, id?: string) {
  const child = fork(worker, [base, mode, ...(id ? [id] : [])], { stdio: ["ignore", "ignore", "pipe", "ipc"], env: { PATH: process.env.PATH }, execArgv: [] });
  let stderr = ""; child.stderr?.on("data", data => { stderr += String(data); });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); assert.doesNotMatch(stderr, /PRIVATE|fixture-not-real|export const/); });
  const first = await message(child); return { child, first };
}
async function invoke(t: TestContext, base: string, mode: string, id: string) {
  const { child, first } = await spawn(t, base, mode, id); assert.equal(first.ready, true);
  const next = message(child); child.send({ go: true }); return next;
}
const token = (f: { ref: ProposalReference }, action: Parameters<typeof credential>[1]) => credential(f.ref, action);
async function approve(f: Awaited<ReturnType<typeof fixture>>) { await f.coordinator.decide(f.id, token(f, "approve"), true, confirmation); }

test("three independent processes generate via mocked OpenAI, approve, and apply exact durable proposal with zero resume HTTP", async t => {
  const base = await baseFixture(t), a = await spawn(t, base, "generate");
  assert.equal(a.first.result.termination, "approval_required"); assert.equal(a.first.calls, 4);
  const id = a.first.operationId as string;
  const b = await invoke(t, base, "approve", id); assert.equal(b.ok, true); assert.equal(b.calls, 0);
  const c = await invoke(t, base, "continue", id); assert.equal(c.ok, true, JSON.stringify(c)); assert.equal(c.state, "Completed"); assert.equal(c.calls, 0);
  assert.notEqual(a.first.pid, b.pid); assert.notEqual(b.pid, c.pid);
  assert.equal(await readFile(path.join(a.first.result.workspace.root, "value.ts"), "utf8"), changed);
  assert.equal(await readFile(path.join(base, "source", "value.ts"), "utf8"), original);
  assert.equal(await readFile(path.join(base, "source", ".env"), "utf8"), "PRIVATE UNSELECTED SECRET");
  const replay = await invoke(t, base, "continue", id); assert.equal(replay.ok, false); assert.equal(replay.calls, 0);
  const { store, artifacts } = await openFixture(base); t.after(() => store.close());
  const ref = store.proposal(id)!, artifact = artifacts.get(ref.artifactDigest);
  assert.equal(artifact.accounting.requests, 4); assert.equal(artifact.accounting.tokens, 480); assert.equal(artifact.accounting.estimatedCostUsd, null);
  assert.equal(artifact.accounting.cost.status, "unknown"); assert.equal(store.approval(store.get(id)!.approvalId!)?.status, "consumed");
});
test("durable artifact survives reopen with restrictive modes, exact diff, scope and read-only status", async t => {
  const f = await fixture(t);
  const before = await readFile(path.join(f.base, "state", "ops.sqlite"));
  const status = await f.coordinator.status(f.id, token(f, "status")); assert.equal(status.state, "PendingApproval");
  assert.deepEqual(await readFile(path.join(f.base, "state", "ops.sqlite")), before);
  assert.equal(await f.coordinator.diff(f.id, token(f, "diff")), f.result.diff);
  for (const name of ["proposal-host.key", "proposals/" + f.ref.artifactDigest + ".json"]) assert.equal((await lstat(path.join(f.base, "state", name))).mode & 0o777, 0o600);
  assert.equal((await lstat(path.join(f.base, "state", "proposals"))).mode & 0o777, 0o700);
  assert.equal(f.artifact.executionId, f.result.executionId); assert.equal(f.artifact.patchDigest, f.result.proposals[0]!.digest);
  assert.doesNotMatch(JSON.stringify(f.artifact), /PRIVATE UNSELECTED|fixture-not-real|Bearer|credential/);
});
for (const kind of ["incomplete", "corrupt", "digest", "missing", "symlink", "mode"] as const) test("artifact " + kind + " fails closed before approval/effects", async t => {
  const f = await fixture(t), file = path.join(f.base, "state", "proposals", f.ref.artifactDigest + ".json");
  if (kind === "missing") await rename(file, file + ".quarantine");
  else if (kind === "symlink") { await rename(file, file + ".quarantine"); await symlink(file + ".quarantine", file); }
  else if (kind === "mode") await chmod(file, 0o644);
  else if (kind === "digest") { const data = JSON.parse(await readFile(file, "utf8")); data.artifact.patchDigest = "0".repeat(64); await writeFile(file, JSON.stringify(data)); }
  else await writeFile(file, kind === "incomplete" ? "{\"artifact\":" : "PRIVATE CORRUPTED");
  await assert.rejects(f.coordinator.decide(f.id, token(f, "approve"), true, confirmation), EngineeringResumeError);
  assert.equal(f.store.get(f.id)!.state, "PendingApproval"); assert.equal(await readFile(path.join(f.artifact.receipt.root, "value.ts"), "utf8"), original);
});
for (const scope of ["policy", "source", "workspace", "receipt", "root_identity"] as const) test("changed " + scope + " invalidates previous approval before effects", async t => {
  const f = await fixture(t); await approve(f);
  let coordinator = f.coordinator;
  if (scope === "policy") coordinator = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy: { ...policy, version: "changed-v2" }, verifier });
  if (scope === "source") await writeFile(path.join(f.base, "source", "value.ts"), "CHANGED SOURCE");
  if (scope === "workspace") await writeFile(path.join(f.artifact.receipt.root, "value.ts"), "CHANGED WORKSPACE");
  if (scope === "receipt") await writeFile(path.join(path.dirname(f.artifact.receipt.root), "receipt.json"), "{}");
  if (scope === "root_identity") { await rename(f.artifact.receipt.root, f.artifact.receipt.root + "-old"); await import("node:fs/promises").then(fs => fs.mkdir(f.artifact.receipt.root, { mode: 0o700 })); }
  await assert.rejects(coordinator.continue(f.id, token(f, "continue"), 5000));
  assert.equal(f.store.get(f.id)!.state, "Approved"); assert.equal(f.store.approval(f.store.get(f.id)!.approvalId!)!.status, "approved");
});
for (const kind of ["self", "forged", "audience", "expired", "wrong_scope", "missing_role", "operator_role"] as const) test("independent authentication rejects " + kind, async t => {
  const f = await fixture(t), action = kind === "operator_role" ? "continue" : "approve";
  let c = credential(f.ref, action, kind === "self" ? { subject: "requester" } : kind === "audience" ? { audience: "wrong" } : kind === "expired" ? { expiresAt: Date.now() - 1 } : kind === "missing_role" ? { roles: [] } : kind === "operator_role" ? { roles: ["harness:approver"] } : {});
  if (kind === "forged") c += "forged";
  if (kind === "wrong_scope") c = credential({ ...f.ref, workspaceId: "other" }, action);
  if (kind === "operator_role") { await approve(f); await assert.rejects(f.coordinator.continue(f.id, c, 5000)); }
  else await assert.rejects(f.coordinator.decide(f.id, c, true));
  assert.equal(f.store.get(f.id)!.state, kind === "operator_role" ? "Approved" : "PendingApproval");
});
test("no production authenticator means private status/diff/approve/continue remain disabled", async t => {
  const f = await fixture(t), host = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy });
  for (const action of [() => host.status(f.id, "--approve"), () => host.diff(f.id, "requester"), () => host.decide(f.id, "true", true), () => host.continue(f.id, f.result.executionId, 5000)])
    await assert.rejects(action(), (e: EngineeringResumeError) => e.code === "authentication_required");
});
test("single-use approval replay and concurrent independent approvers admit one decision", async t => {
  const f = await fixture(t);
  const [a, b] = await Promise.all([invoke(t, f.base, "approve", f.id), invoke(t, f.base, "approve", f.id)]);
  assert.equal([a, b].filter(x => x.ok).length, 1);
  await assert.rejects(f.coordinator.decide(f.id, token(f, "approve"), true, confirmation));
});
for (const choice of ["denied", "revoked"] as const) test(choice + " approval is terminal across sessions", async t => {
  const f = await fixture(t);
  if (choice === "denied") await f.coordinator.decide(f.id, token(f, "reject"), false);
  else { await approve(f); await new ApprovalBroker(f.store, verifier).revoke(f.id, token(f, "revoke")); }
  const resumed = await invoke(t, f.base, "continue", f.id); assert.equal(resumed.ok, false); assert.equal(resumed.calls, 0);
  assert.equal(f.store.get(f.id)!.state, "Cancelled");
});
test("expired approval cannot be revived after restart", async t => {
  const base = await baseFixture(t), opened = await openFixture(base);
  const g = await generate(base, opened.store); opened.store.close(); assert.equal(g.result.termination, "approval_required");
  const expired = await openFixture(base, { now: () => Date.now() + 300_001 }); t.after(() => expired.store.close());
  const ref = expired.store.proposal(g.operationId!)!;
  await assert.rejects(new ContinuationCoordinator({ store: expired.store, artifacts: expired.artifacts, policy, verifier }).decide(g.operationId!, credential(ref, "approve"), true));
});
test("concurrent continuation processes admit one exact application and never replay", async t => {
  const f = await fixture(t); await approve(f);
  const [a, b] = await Promise.all([invoke(t, f.base, "continue", f.id), invoke(t, f.base, "continue", f.id)]);
  assert.equal([a, b].filter(x => x.ok).length, 1, JSON.stringify([a, b])); assert.equal(a.calls + b.calls, 0);
  assert.equal(f.store.get(f.id)!.state, "Completed"); assert.equal(await readFile(path.join(f.artifact.receipt.root, "value.ts"), "utf8"), changed);
});
test("expired effect-free lease can transfer with increasing epoch; live old owner is fenced", async t => {
  const f = await fixture(t); await approve(f);
  const old = await spawn(t, f.base, "old-worker", f.id), leased = message(old.child); old.child.send({ go: true }); assert.equal((await leased).leased, true);
  await delay(100);
  const op = f.store.get(f.id)!, lease = f.store.acquireLease(f.id, op.version, 5000, { issuer: "github.com", subject: "101" }); assert.equal(lease.epoch, 2);
  const stale = message(old.child); old.child.send({ check: true }); assert.equal((await stale).staleBlocked, true);
  f.store.assertLease(lease);
  assert.throws(() => f.store.assertLease({ ...lease, epoch: 1 }));
  assert.equal(await readFile(path.join(f.artifact.receipt.root, "value.ts"), "utf8"), original);
});
for (const crash of ["prepared", "running", "after_effect"] as const) test("actual SIGKILL at " + crash + " blocks cross-session effects even after lease expiry", async t => {
  const f = await fixture(t); await approve(f);
  const p = await spawn(t, f.base, crash, f.id), paused = message(p.child); p.child.send({ go: true }); assert.equal((await paused).paused, true);
  const exited = once(p.child, "exit"); p.child.kill("SIGKILL"); await exited;
  const { store, artifacts } = await openFixture(f.base, { now: () => Date.now() + 10000 });
  try {
    const op = store.get(f.id)!; assert.equal(op.state, crash === "prepared" ? "Prepared" : "Running");
    assert.throws(() => store.acquireLease(f.id, op.version, 1000, { issuer: "github.com", subject: "101" }));
    const c = new ContinuationCoordinator({ store, artifacts, policy, verifier }); await assert.rejects(c.continue(f.id, token(f, "continue"), 1000));
    assert.equal(store.approval(op.approvalId!)!.status, "consumed");
    assert.equal(await readFile(path.join(f.artifact.receipt.root, "value.ts"), "utf8"), crash === "after_effect" ? changed : original);
  } finally { store.close(); }
});
test("artifact filesystem commit before SQLite failure preserves orphan without publishing pending resume", async t => {
  const base = await baseFixture(t), opened = await openFixture(base); t.after(() => opened.store.close());
  const proxy = new Proxy(opened.store, { get(target, key) {
    if (key === "bindProposal") return () => { throw new DurableStoreError("unavailable"); };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  const g = await generate(base, proxy); assert.equal(g.result.pendingApprovals.length, 0); assert.notEqual(g.result.termination, "approval_required");
  assert.ok((await readdir(path.join(base, "state", "proposals"))).some(x => x.endsWith(".json")));
  assert.equal(opened.store.proposal(g.operationId!), null);
  assert.equal(await readFile(path.join(g.result.workspace!.root, "value.ts"), "utf8"), original);
});
test("unknown commit acknowledgment after Prepared leaves consumed authorization and blocks replay", async t => {
  const f = await fixture(t); await approve(f);
  const proxy = new Proxy(f.store, { get(target, key) {
    if (key === "prepare") return (...args: Parameters<EngineeringResumeStore["prepare"]>) => { target.prepare(...args); throw new DurableStoreError("unavailable"); };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  await assert.rejects(new ContinuationCoordinator({ store: proxy, artifacts: f.artifacts, policy, verifier }).continue(f.id, token(f, "continue"), 5000));
  assert.equal(f.store.get(f.id)!.state, "Prepared");
  const resumed = await invoke(t, f.base, "continue", f.id); assert.equal(resumed.ok, false);
  assert.equal(await readFile(path.join(f.artifact.receipt.root, "value.ts"), "utf8"), original);
});
test("partial patch effects retain uncertain evidence, prevent replacement lease and preserve original", async t => {
  const f = await fixture(t, true); await approve(f);
  const firstPath = path.join(f.artifact.receipt.root, "second.ts"); // inventory ordering determines first effect
  const proxy = new Proxy(f.store, { get(target, key) {
    if (key === "assertLease") return (...args: Parameters<EngineeringResumeStore["assertLease"]>) => {
      target.assertLease(...args);
      if (readFileSync(firstPath, "utf8") === changed) throw new Error("Injected fence loss after first effect");
    };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  await assert.rejects(new ContinuationCoordinator({ store: proxy, artifacts: f.artifacts, policy, verifier }).continue(f.id, token(f, "continue"), 5000));
  assert.ok(["Uncertain", "Running"].includes(f.store.get(f.id)!.state));
  assert.equal(await readFile(firstPath, "utf8"), changed);
  assert.equal(await readFile(path.join(f.artifact.receipt.root, "value.ts"), "utf8"), original);
  assert.ok((await readdir(path.dirname(f.artifact.receipt.root))).includes("uncertain"));
  const resumed = await invoke(t, f.base, "continue", f.id); assert.equal(resumed.ok, false);
  assert.equal(await readFile(path.join(f.base, "source", "second.ts"), "utf8"), original);
});
test("cancellation and finite timeout stop before effects without consuming authorization", async t => {
  const f = await fixture(t); await approve(f); const abort = new AbortController(); abort.abort();
  await assert.rejects(f.coordinator.continue(f.id, token(f, "continue"), 5000, abort.signal), (e: EngineeringResumeError) => e.code === "cancelled");
  await assert.rejects(f.coordinator.continue(f.id, token(f, "continue"), 0), (e: EngineeringResumeError) => e.code === "timeout");
  const slow = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy, verifier: { async verify(c, b) { await delay(10); return verifier.verify(c, b); } } });
  await assert.rejects(slow.continue(f.id, token(f, "continue"), 1), (e: EngineeringResumeError) => e.code === "timeout");
  assert.equal(f.store.get(f.id)!.state, "Approved"); assert.equal(f.store.approval(f.store.get(f.id)!.approvalId!)!.status, "approved");
});
test("journal checksum corruption blocks reopen without dropping existing records", async t => {
  const f = await fixture(t), db = new DatabaseSync(path.join(f.base, "state", "ops.sqlite"));
  db.prepare("UPDATE engineering_proposals SET checksum=? WHERE operation_id=?").run("0".repeat(64), f.id); db.close();
  await assert.rejects(openFixture(f.base));
});
test("schema v1 migrates additively; legacy ownership/state guarantees remain unchanged", async t => {
  const base = await baseFixture(t), filename = path.join(base, "state", "ops.sqlite");
  const store = await openSqliteOperationJournal(filename);
  const legacy = store.register({ executionId: "old", taskId: "task", requestId: "request", projectRoot: path.join(base, "source"), toolId: "file.read", argumentDigest: "a".repeat(64), permission: "files:read", risk: "low", safety: "read_only", requester: { issuer: "fixture", subject: "old" }, requiresApproval: false }).operation;
  store.close();
  const db = new DatabaseSync(filename); db.exec("DROP TABLE human_confirmation_ids; DROP TABLE approval_reviews; DROP TABLE engineering_proposals; DROP TABLE continuation_leases; DROP TABLE continuation_lease_events; PRAGMA user_version=1;"); db.close();
  const migrated = await openSqliteOperationJournal(filename); t.after(() => migrated.close());
  assert.deepEqual(migrated.get(legacy.operationId), legacy); assert.equal(migrated.proposal(legacy.operationId), null);
  assert.throws(() => migrated.prepare(legacy.operationId, legacy.version, legacy.scopeDigest));
  const check = new DatabaseSync(filename); assert.equal(check.prepare("PRAGMA user_version").get()!.user_version, 3); check.close();
});
test("canonical artifact JSON rejects authority-bearing non-JSON data and is key-order stable", () => {
  assert.equal(canonicalProposalJson({ b: 2, a: 1 }), canonicalProposalJson({ a: 1, b: 2 }));
  for (const value of [{ value: undefined }, { value: NaN }, { value: () => true }, { value: "x".repeat(65536) }]) assert.throws(() => canonicalProposalJson(value));
});

for (const boundary of ["artifact_unbound", "artifact_transaction"]) test("SIGKILL after durable artifact publication " + boundary + " never reconstructs an orphan", async t => {
  const base = await baseFixture(t), p = await spawn(t, base, boundary);
  assert.equal(p.first.paused, true);
  const exited = once(p.child, "exit"); p.child.kill("SIGKILL"); await exited;
  const { store } = await openFixture(base); t.after(() => store.close());
  assert.equal(store.proposal(p.first.operationId), null);
  assert.ok((await readdir(path.join(base, "state", "proposals"))).some(name => name.endsWith(".json")));
  const resumed = await invoke(t, base, "continue", p.first.operationId); assert.equal(resumed.ok, false); assert.equal(resumed.calls, 0);
  assert.equal(await readFile(path.join(base, "source", "value.ts"), "utf8"), original);
});
test("host key loss never silently replaces authority for retained proposals", async t => {
  const f = await fixture(t), key = path.join(f.base, "state", "proposal-host.key");
  await rename(key, key + ".quarantine");
  assert.throws(() => new ProposalArtifactStore(path.join(f.base, "state")), EngineeringResumeError);
  await assert.rejects(lstat(key));
});
test("leased approval cannot be consumed without current ownership; fence rejects expired lease and Completed state", async t => {
  const f = await fixture(t); await approve(f);
  const op = f.store.get(f.id)!;
  assert.throws(() => f.store.prepare(f.id, op.version, op.scopeDigest, op.approvalId));
  const clock = { now: Date.now() }, owned = await openFixture(f.base, { now: () => clock.now }); t.after(() => owned.store.close());
  const lease = owned.store.acquireLease(f.id, op.version, 1, { issuer: "github.com", subject: "101" });
  clock.now += 2; assert.throws(() => owned.store.assertLease(lease));
  clock.now -= 2;
  const prepared = owned.store.prepare(f.id, op.version, op.scopeDigest, op.approvalId)!;
  const running = owned.store.start(f.id, prepared.version);
  owned.store.finish(f.id, running.version, "Completed"); // Fixed test-only journal effect, no patch invocation.
  assert.throws(() => owned.store.assertLease(lease));
});
test("unknown final commit acknowledgment never re-applies an already Completed operation", async t => {
  const f = await fixture(t); await approve(f);
  const proxy = new Proxy(f.store, { get(target, key) {
    if (key === "finish") return (...args: Parameters<EngineeringResumeStore["finish"]>) => { target.finish(...args); throw new DurableStoreError("unavailable"); };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  await assert.rejects(new ContinuationCoordinator({ store: proxy, artifacts: f.artifacts, policy, verifier }).continue(f.id, token(f, "continue"), 5000));
  assert.equal(f.store.get(f.id)!.state, "Completed"); assert.equal(await readFile(path.join(f.artifact.receipt.root, "value.ts"), "utf8"), changed);
  const resumed = await invoke(t, f.base, "continue", f.id); assert.equal(resumed.ok, false); assert.equal(resumed.calls, 0);
});
test("authentication callbacks which never settle respect the finite continuation deadline", async t => {
  const f = await fixture(t); await approve(f);
  const coordinator = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy, verifier: { verify: () => new Promise(() => {}) } });
  await assert.rejects(coordinator.continue(f.id, token(f, "continue"), 10), (e: EngineeringResumeError) => e.code === "timeout");
  assert.equal(f.store.get(f.id)!.state, "Approved");
});
test("metadata telemetry contains no patch/source/credential and observer failures cannot change authorization", async t => {
  const f = await fixture(t);
  const { InMemoryTelemetrySink, TelemetrySession } = await import("@ai-harness/observability");
  const sink = new InMemoryTelemetrySink(), session = new TelemetrySession({ sink });
  const coordinator = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy, verifier, telemetry: session.trace(f.result.executionId) });
  await coordinator.decide(f.id, token(f, "approve"), true, confirmation);
  await coordinator.continue(f.id, token(f, "continue"), 5000); await session.flush();
  const events = JSON.stringify(sink.events());
  for (const name of ["approval.granted", "lease.acquired", "reconciliation.started", "continuation.started", "continuation.completed"]) assert.ok(events.includes(name));
  assert.doesNotMatch(events, /export const|PRIVATE|credential|fixture-not-real|sourceRoot|Bearer|binding/);
  assert.equal(await coordinator.diff(f.id, token(f, "diff")), f.artifact.diff);
  const g = await fixture(t), binding = session.trace(g.result.executionId);
  const bad = new ContinuationCoordinator({ store: g.store, artifacts: g.artifacts, policy, verifier, telemetry: { context: binding.context, observer: { ...binding.observer, trace: () => { throw new Error("PRIVATE observer"); }, event: () => { throw new Error("PRIVATE observer"); }, startSpan: () => { throw new Error("PRIVATE observer"); } } } });
  await bad.decide(g.id, token(g, "approve"), true, confirmation); assert.equal((await bad.continue(g.id, token(g, "continue"), 5000)).operationState, "Completed");
});
test("replay with a different artifact challenge is rejected by the existing durable decision transaction", async t => {
  const f = await fixture(t), op = f.store.get(f.id)!;
  assert.throws(() => f.store.decideScoped(op.approvalId!, { issuer: "fixture", subject: "human" }, true, { artifactDigest: f.ref.artifactDigest, challenge: "f".repeat(64) }));
  assert.equal(f.store.get(f.id)!.state, "PendingApproval");
});

test("semantically identical reordered host policy preserves legacy policy/patch digests on resume", async t => {
  const f = await fixture(t); await approve(f);
  const reordered = Object.fromEntries(Object.entries(policy).reverse()) as unknown as typeof policy;
  const coordinator = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy: reordered, verifier });
  assert.equal((await coordinator.continue(f.id, token(f, "continue"), 5000)).operationState, "Completed");
});
