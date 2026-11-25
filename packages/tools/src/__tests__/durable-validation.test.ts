import assert from "node:assert/strict";
import test from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { ProposalArtifactStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { validationFixture } from "./phase9-validation-fixture.js";
const executable = fileURLToPath(new URL("./durable-validation-worker.js", import.meta.url));
function worker(base: string, mode: string, scenario = "valid") {
  const child = fork(executable, [base, mode, scenario], { env: { PATH: process.env.PATH }, stdio: ["ignore", "ignore", "ignore", "ipc"], execArgv: [] });
  const result = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Durable validation worker deadline")); }, 15000);
    child.once("message", value => { clearTimeout(timer); resolve(value); }); child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); if (code !== 0) reject(new Error("Durable validation worker exited")); });
  });
  return { child, result };
}
async function fixture(t: Parameters<typeof validationFixture>[0]) {
  const f = await validationFixture(t); new ProposalArtifactStore(path.join(f.base, "state")).put(f.artifact); f.store.close(); return f;
}
test("durable sandbox prepares, confirms, executes and reopens evidence in four separate processes", async t => {
  const f = await fixture(t), prepared = await worker(f.base, "prepare").result; assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.equal(prepared.result.status, "approval_required"); assert.equal(prepared.podmanCalls, 0);
  const approved = await worker(f.base, "approve").result; assert.equal(approved.ok, true, JSON.stringify(approved)); assert.equal(approved.podmanCalls, 0);
  const executed = await worker(f.base, "execute").result; assert.equal(executed.ok, true); assert.equal(executed.result.status, "executed"); assert.equal(executed.result.data.classification, "passed"); assert.equal(executed.result.data.cleanup, "confirmed"); assert.equal(executed.podmanCalls, 1);
  const evidence = await worker(f.base, "inspect").result; assert.equal(evidence.ok, true); assert.equal(evidence.result.validationId, executed.result.data.validationId); assert.equal(evidence.podmanCalls, 0);
  assert.equal(new Set([prepared.pid, approved.pid, executed.pid, evidence.pid]).size, 4);
  const replay = await worker(f.base, "execute").result; assert.notEqual(replay.result?.status, "executed"); assert.equal(replay.podmanCalls, 0);
  assert.equal(await readFile(path.join(f.base, "source", "value.js"), "utf8"), f.original);
  assert.equal((await readdir(path.join(f.base, "evidence"))).some(f => f.endsWith(".lock")), false);
});
for (const scenario of ["second-owner", "profile", "policy", "cancelled"])
test("separate sandbox approval rejects " + scenario + " without any workload", async t => {
  const f = await fixture(t); assert.equal((await worker(f.base, "prepare").result).ok, true);
  const rejected = await worker(f.base, "approve", scenario).result; assert.equal(rejected.ok, false); assert.equal(rejected.podmanCalls, 0);
  const store = await openSqliteOperationJournal(path.join(f.base, "state", "ops.sqlite")); t.after(() => store.close());
  assert.equal(store.list(f.artifact.executionId).find(o => o.toolId === "sandbox.validate")!.state, "PendingApproval");
});
test("concurrent validation processes consume one grant and fence the other operator", async t => {
  const f = await fixture(t); assert.equal((await worker(f.base, "approve").result).ok, true);
  const outcomes = await Promise.all([worker(f.base, "execute").result, worker(f.base, "execute").result]);
  assert.equal(outcomes.filter(o => o.result?.status === "executed").length, 1); assert.equal(outcomes.reduce((n, o) => n + o.podmanCalls, 0), 1);
});
test("process death after Running keeps the grant consumed, claim retained and never replays", async t => {
  const f = await fixture(t); assert.equal((await worker(f.base, "approve").result).ok, true);
  const running = worker(f.base, "crash"); assert.equal((await running.result).paused, true);
  const exited = once(running.child, "exit"); running.child.kill("SIGKILL"); await exited;
  const store = await openSqliteOperationJournal(path.join(f.base, "state", "ops.sqlite"));
  const op = store.list(f.artifact.executionId).find(o => o.toolId === "sandbox.validate")!; assert.equal(op.state, "Running"); assert.equal(store.approval(op.approvalId!)!.status, "consumed"); store.close();
  const replay = await worker(f.base, "execute").result; assert.notEqual(replay.result?.status, "executed"); assert.equal(replay.podmanCalls, 0);
  assert.equal((await readdir(path.join(f.base, "evidence"))).some(f => f.endsWith(".lock")), true);
});
for (const scenario of ["timeout", "output-limit"])
test("durable coordinator persists mocked runtime " + scenario + " and reopens without execution", async t => {
  const f = await fixture(t); assert.equal((await worker(f.base, "approve").result).ok, true);
  const executed = await worker(f.base, "execute", scenario).result; assert.equal(executed.result.status, "executed");
  assert.equal(executed.result.data.classification, scenario === "timeout" ? "timeout" : "failed"); assert.equal(executed.result.data.cleanup, "confirmed");
  const evidence = await worker(f.base, "inspect").result; assert.equal(evidence.ok, true); assert.equal(evidence.podmanCalls, 0); assert.equal(evidence.result.validationId, executed.result.data.validationId);
});
