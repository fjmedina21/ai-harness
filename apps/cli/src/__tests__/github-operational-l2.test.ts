import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { fork } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProposalArtifactStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";

const worker = fileURLToPath(new URL("./github-operational-l2-worker.js", import.meta.url));
interface WorkerResult { code: number; result: any; providerCalls: number; githubCalls: number; pid: number }
async function fixture(t: TestContext) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-github-l2-")));
  for (const directory of ["source", "workspaces", "state", "checkpoints"]) await mkdir(path.join(base, directory), { mode: 0o700 });
  await writeFile(path.join(base, "source", "value.ts"), "export const value = 1;\n", { mode: 0o600 });
  await writeFile(path.join(base, "source", "unselected.txt"), "PRIVATE_SYNTHETIC_SOURCE\n", { mode: 0o600 });
  t.after(() => rm(base, { recursive: true, force: true }));
  return base;
}
async function run(base: string, action: string, executionId = "", actor = "101", scenario = "valid"): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const child = fork(worker, [base, action, executionId, actor, scenario], {
      stdio: ["ignore", "ignore", "pipe", "ipc"], execArgv: [], env: { PATH: process.env.PATH, OPENAI_API_KEY: "synthetic-provider-key-never-real" },
    });
    let result: WorkerResult | undefined, stderr = "", settled = false;
    const timer = setTimeout(() => { child.kill("SIGKILL"); fail(new Error("Synthetic GitHub L2 worker deadline")); }, 15000);
    const fail = (error: Error) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
    child.on("message", message => { result = message as WorkerResult; });
    child.stderr?.on("data", chunk => { stderr += String(chunk); if (stderr.length > 65536) { child.kill("SIGKILL"); fail(new Error("Synthetic worker output limit")); } });
    child.once("error", fail);
    child.once("exit", code => {
      if (settled) return; settled = true; clearTimeout(timer);
      code === 0 && result ? resolve(result) : reject(new Error("Synthetic worker failed: " + stderr.slice(0, 4096)));
    });
  });
}
async function proposal(base: string, executionId: string) {
  const store = await openSqliteOperationJournal(path.join(base, "state", "ops.sqlite"));
  try {
    const operation = store.list(executionId).find(op => op.toolId === "patch.apply")!;
    assert.ok(operation);
    const reference = store.proposal(operation.operationId)!;
    const artifact = new ProposalArtifactStore(path.join(base, "state")).get(reference.artifactDigest);
    return { operation, artifact, approval: store.approval(operation.approvalId!) };
  } finally { store.close(); }
}
async function sourceUnchanged(base: string) {
  assert.equal(await readFile(path.join(base, "source", "value.ts"), "utf8"), "export const value = 1;\n");
  assert.equal(await readFile(path.join(base, "source", "unselected.txt"), "utf8"), "PRIVATE_SYNTHETIC_SOURCE\n");
}

test("GitHub-authenticated CLI generates, independently approves, and resumes across processes without provider calls", async t => {
  const base = await fixture(t), generated = await run(base, "generate");
  assert.equal(generated.code, 2, JSON.stringify(generated));
  assert.equal(generated.result.termination, "approval_required"); assert.equal(generated.providerCalls, 4); assert.ok(generated.githubCalls >= 2);
  const executionId = generated.result.executionId;
  const before = await proposal(base, executionId);
  assert.deepEqual(before.operation.requester, { issuer: "github.com", subject: "101" });
  assert.deepEqual(before.artifact.requester, before.operation.requester);
  const status = await run(base, "status", executionId, "404"); assert.equal(status.code, 0); assert.equal(status.result.approval, "pending");
  const diff = await run(base, "diff", executionId, "202"); assert.equal(diff.code, 0); assert.match(diff.result.diff, /value = 2/);
  const self = await run(base, "approve", executionId, "101", "renamed_session");
  assert.equal(self.code, 1); assert.equal(self.result.error.code, "forbidden_scope");
  const denied = await run(base, "continue", executionId, "404"); assert.equal(denied.code, 1); assert.equal(denied.result.error.code, "forbidden_scope");
  const approved = await run(base, "approve", executionId, "202"); assert.equal(approved.code, 0, JSON.stringify(approved));
  const decisionReplay = await run(base, "approve", executionId, "202"); assert.equal(decisionReplay.code, 1); assert.equal(decisionReplay.providerCalls, 0);
  const continued = await run(base, "continue", executionId, "303"); assert.equal(continued.code, 0, JSON.stringify(continued));
  assert.equal(continued.result.state, "ReviewPending"); assert.equal(continued.result.operationState, "Completed"); assert.equal(continued.result.integrated, false);
  for (const r of [status, diff, self, denied, approved, continued]) { assert.equal(r.providerCalls, 0); assert.ok(r.githubCalls >= 2); }
  assert.equal(new Set([generated.pid, approved.pid, continued.pid]).size, 3);
  const after = await proposal(base, executionId);
  assert.equal(after.artifact.patchDigest, before.artifact.patchDigest); assert.equal(after.operation.state, "Completed");
  assert.equal(after.approval?.status, "consumed"); assert.deepEqual(after.approval?.approver, { issuer: "github.com", subject: "202" });
  assert.equal(await readFile(path.join(after.artifact.receipt.root, "value.ts"), "utf8"), "export const value = 2;\n");
  const replay = await run(base, "continue", executionId, "303"); assert.equal(replay.code, 1); assert.equal(replay.providerCalls, 0);
  await sourceUnchanged(base);
  assert.doesNotMatch(JSON.stringify([generated.result, status.result, diff.result, self.result, approved.result, continued.result]), /ghu_|synthetic-app-secret|synthetic-provider-key|PRIVATE_SYNTHETIC_SOURCE/);
});

for (const scenario of ["missing_session", "revoked", "wrong_account", "wrong_workspace"] as const)
  test("GitHub L2 rejects " + scenario + " across processes before approval or provider calls", async t => {
    const base = await fixture(t), generated = await run(base, "generate"); assert.equal(generated.code, 2);
    const executionId = generated.result.executionId, before = await proposal(base, executionId);
    const rejected = await run(base, "approve", executionId, "202", scenario);
    assert.equal(rejected.code, 1, JSON.stringify(rejected)); assert.equal(rejected.providerCalls, 0);
    const after = await proposal(base, executionId);
    assert.equal(after.operation.version, before.operation.version); assert.equal(after.operation.state, "PendingApproval"); assert.equal(after.approval?.status, "pending");
    await sourceUnchanged(base);
  });

test("GitHub requester role is enforced before generation and workspace creation", async t => {
  const base = await fixture(t), denied = await run(base, "generate", "", "404");
  assert.equal(denied.code, 1); assert.equal(denied.result.error.code, "forbidden_scope"); assert.equal(denied.providerCalls, 0);
  assert.deepEqual(await readdir(path.join(base, "workspaces")), []); assert.deepEqual(await readdir(path.join(base, "state")), []);
  await sourceUnchanged(base);
});

for (const decision of ["reject", "revoke"] as const)
  test("GitHub " + decision + " durably blocks an independently authenticated operator", async t => {
    const base = await fixture(t), generated = await run(base, "generate"); assert.equal(generated.code, 2);
    const executionId = generated.result.executionId;
    if (decision === "revoke") assert.equal((await run(base, "approve", executionId, "202")).code, 0);
    assert.equal((await run(base, decision, executionId, "202")).code, 0);
    const denied = await run(base, "continue", executionId, "303"); assert.equal(denied.code, 1); assert.equal(denied.providerCalls, 0);
    const record = await proposal(base, executionId); assert.equal(record.operation.state, "Cancelled");
    assert.equal(record.approval?.status, decision === "reject" ? "denied" : "revoked"); await sourceUnchanged(base);
  });
