import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { normalizeApprovalPolicy, type HumanApprovalPort } from "@ai-harness/contracts";
import { openSqliteOperationJournal, ProposalArtifactStore } from "@ai-harness/checkpointing";
import { ContinuationCoordinator } from "../engineering-resume.js";
import { generate, policy } from "./resume-fixture.js";
import { personal, owner, confirmation, authentication } from "./personal-fixture.js";
import { GitHubAuthError } from "@ai-harness/security";
async function directory(t: TestContext) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-personal-"))); await chmod(base, 0o700);
  for (const name of ["source", "state", "workspaces"]) await mkdir(path.join(base, name), { mode: 0o700 });
  await writeFile(path.join(base, "source", "value.ts"), "export const value = 1;\n", { mode: 0o600 }); t.after(() => rm(base, { recursive: true, force: true })); return base;
}
async function fixture(t: TestContext, options: { scenario?: string } = {}) {
  const base = await directory(t), selected = personal;
  const store = await openSqliteOperationJournal(path.join(base, "state", "ops.sqlite"), { approvalPolicy: selected, approvalTtlMs: 300000 }); t.after(() => { try { store.close(); } catch {} });
  const generated = await generate(base, store, false, { approvalPolicy: selected, requester: owner });
  assert.equal(generated.result.termination, "approval_required"); const id = generated.operationId!, artifacts = new ProposalArtifactStore(path.join(base, "state")), ref = store.proposal(id)!;
  const auth = authentication(path.join(base, "source"), path.join(base, "workspaces"), owner.subject, options.scenario);
  const bound = auth.auth.resumeVerifier({ sourceRoot: path.join(base, "source"), workspaceDirectory: path.join(base, "workspaces"), executionId: ref.executionId, workspaceId: ref.workspaceId });
  const coordinator = new ContinuationCoordinator({ store, artifacts, policy, approvalPolicy: selected, verifier: bound.verifier });
  return { base, store, generated, id, artifacts, ref, coordinator, credential: bound.credential, verifier: bound.verifier, selected };
}
test("Personal Mode records explicit reviewed scope, same GitHub identity, intent and single-use durable approval", async t => {
  const f = await fixture(t), before = f.artifacts.get(f.ref.artifactDigest); let reviewed = false;
  const port: HumanApprovalPort = { async confirm(review) { reviewed = true; assert.equal(review.diff, before.diff); assert.equal(review.context.patchDigest, before.patchDigest); assert.equal(review.context.workspaceId, before.workspaceId); assert.equal(review.actor.subject, owner.subject); return confirmation.confirm(review); } };
  await assert.rejects(f.coordinator.continue(f.id, f.credential, 5000)); assert.equal(f.store.approval(f.store.get(f.id)!.approvalId!)!.status, "pending");
  await f.coordinator.decide(f.id, f.credential, true, port); assert.equal(reviewed, true);
  const grant = f.store.approval(f.store.get(f.id)!.approvalId!)!;
  assert.deepEqual(grant.approver, grant.requester); assert.equal(grant.decision!.mode, "personal"); assert.equal(grant.decision!.patchDigest, before.patchDigest); assert.ok(grant.decision!.intent?.id);
  await assert.rejects(f.coordinator.decide(f.id, f.credential, true, port));
  const result = await f.coordinator.continue(f.id, f.credential, 5000); assert.equal(result.state, "ReviewPending");
  assert.equal(await readFile(path.join(before.receipt.root, "value.ts"), "utf8"), "export const value = 2;\n"); assert.equal(await readFile(path.join(f.base, "source", "value.ts"), "utf8"), "export const value = 1;\n");
  await assert.rejects(f.coordinator.continue(f.id, f.credential, 5000));
});
for (const variant of ["missing", "cancelled", "wrong_binding", "expired", "fake_method"] as const) test("Personal Mode rejects human confirmation " + variant, async t => {
  const f = await fixture(t); const port: HumanApprovalPort | undefined = variant === "missing" ? undefined : { async confirm(review) {
    if (variant === "cancelled") return null; const receipt = (await confirmation.confirm(review))!;
    return { ...receipt, ...(variant === "wrong_binding" ? { bindingDigest: "0".repeat(64) } : variant === "expired" ? { expiresAt: Date.now() - 1 } : { method: "agent-asserted" as typeof receipt.method }) };
  } };
  await assert.rejects(f.coordinator.decide(f.id, f.credential, true, port)); assert.equal(f.store.get(f.id)!.state, "PendingApproval");
});
for (const scenario of ["roles", "expired", "revoked", "wrong_account"]) test("Personal Mode rejects GitHub " + scenario, async t => {
  const f = await fixture(t, { scenario }); await assert.rejects(f.coordinator.decide(f.id, f.credential, true, confirmation)); assert.equal(f.store.get(f.id)!.state, "PendingApproval");
});
test("Team configuration is rejected rather than retained as an operational mode", async t => {
  assert.throws(() => normalizeApprovalPolicy({ ...personal, mode: "team", allowRequesterApproval: false }));
});
for (const [failure, code] of [[new GitHubAuthError("github_unavailable"), "authentication_unavailable"], [new GitHubAuthError("cancelled"), "cancelled"], [new Error("PRIVATE VERIFIER ERROR"), "authentication_required"]] as const)
test("approval broker distinguishes unavailable verification without granting authority: " + code, async t => {
  const f = await fixture(t);
  const coordinator = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy, approvalPolicy: personal, verifier: { async verify() { throw failure; } } });
  await assert.rejects(coordinator.decide(f.id, f.credential, true, confirmation), e => { assert.equal((e as { code?: string }).code, code); assert.doesNotMatch(String(e), /PRIVATE/); return true; });
  assert.equal(f.store.get(f.id)!.state, "PendingApproval"); assert.equal(f.store.approval(f.store.get(f.id)!.approvalId!)!.status, "pending");
});
for (const change of ["identity", "roles", "revocation"] as const) test("Personal Mode revalidates GitHub after human review: " + change, async t => {
  const f = await fixture(t); let reviewed = false;
  const coordinator = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy, approvalPolicy: personal, verifier: { async verify(credential, challenge) {
    const actor = await f.verifier.verify(credential, challenge);
    if (!reviewed) return actor;
    if (change === "revocation") throw new Error("Synthetic revoked session");
    return { ...actor, ...(change === "identity" ? { subject: "70000002" } : { roles: ["harness:reader"] }) };
  } } });
  await assert.rejects(coordinator.decide(f.id, f.credential, true, { async confirm(review) { const receipt = await confirmation.confirm(review); reviewed = true; return receipt; } }));
  assert.equal(reviewed, true); assert.equal(f.store.get(f.id)!.state, "PendingApproval");
});
test("Personal Mode cannot approve an expired durable challenge", async t => {
  const f = await fixture(t); f.store.close();
  const store = await openSqliteOperationJournal(path.join(f.base, "state", "ops.sqlite"), { approvalPolicy: personal, now: () => Date.now() + 301000 }); t.after(() => store.close());
  const coordinator = new ContinuationCoordinator({ store, artifacts: f.artifacts, policy, approvalPolicy: personal, verifier: f.verifier });
  await assert.rejects(coordinator.decide(f.id, f.credential, true, confirmation)); assert.equal(store.get(f.id)!.state, "PendingApproval");
});
test("low-level legacy decision methods cannot grant a reviewed Personal Mode operation", async t => {
  const f = await fixture(t), approvalId = f.store.get(f.id)!.approvalId!;
  assert.throws(() => f.store.decideScoped(approvalId, owner, true, { artifactDigest: f.ref.artifactDigest, challenge: f.ref.challenge }));
  assert.throws(() => f.store.decideReviewed!(approvalId, owner, true)); assert.equal(f.store.get(f.id)!.state, "PendingApproval");
});
for (const change of ["workspace", "source", "artifact", "policy"] as const) test("Personal Mode rejects changed " + change + " after review", async t => {
  const f = await fixture(t), a = f.artifacts.get(f.ref.artifactDigest);
  if (change === "policy") {
    const changed = new ContinuationCoordinator({ store: f.store, artifacts: f.artifacts, policy: { ...policy, version: "changed" }, verifier: f.verifier });
    await assert.rejects(changed.decide(f.id, f.credential, true, confirmation));
  } else {
    const port: HumanApprovalPort = { async confirm(review) {
      if (change === "workspace" || change === "source") await writeFile(path.join(change === "workspace" ? a.receipt.root : path.join(f.base, "source"), "value.ts"), "changed after review");
      else await writeFile(path.join(f.base, "state", "proposals", f.ref.artifactDigest + ".json"), "corrupted after review");
      return confirmation.confirm(review);
    } };
    await assert.rejects(f.coordinator.decide(f.id, f.credential, true, port));
  }
  assert.equal(f.store.get(f.id)!.state, "PendingApproval");
});
test("Personal Mode admits one concurrent approval and rejects reused confirmation for another proposal", async t => {
  const f = await fixture(t); const results = await Promise.allSettled([f.coordinator.decide(f.id, f.credential, true, confirmation), f.coordinator.decide(f.id, f.credential, true, confirmation)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const receipt = f.store.approval(f.store.get(f.id)!.approvalId!)!.decision!.intent!;
  const second = await fixture(t); await assert.rejects(second.coordinator.decide(second.id, second.credential, true, { confirm: async () => receipt }));
});
test("Personal approval cannot be leased by a changed owner", async t => {
  const f = await fixture(t); await f.coordinator.decide(f.id, f.credential, true, confirmation); f.store.close();
  const store = await openSqliteOperationJournal(path.join(f.base, "state", "ops.sqlite")); t.after(() => store.close());
  const op = store.get(f.id)!; assert.throws(() => store.acquireLease(f.id, op.version, 5000, { issuer: "github.com", subject: "70000002" })); assert.equal(store.approval(op.approvalId!)!.status, "approved");
});
async function worker(base: string, mode: string, operationId?: string): Promise<any> {
  const child = fork(fileURLToPath(new URL("./personal-worker.js", import.meta.url)), [base, mode, ...(operationId ? [operationId] : [])], { env: { PATH: process.env.PATH }, stdio: ["ignore", "ignore", "ignore", "ipc"], execArgv: [] });
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Personal worker timeout")); }, 10000); child.once("message", value => { clearTimeout(timer); resolve(value); }); child.once("error", e => { clearTimeout(timer); reject(e); }); });
}
test("three processes use one mocked GitHub identity for generation, explicit approval, and continuation with zero new model calls", async t => {
  const base = await directory(t), generated = await worker(base, "generate"); assert.equal(generated.ok, true); assert.equal(generated.calls, 4); assert.equal(generated.result.termination, "approval_required");
  const approved = await worker(base, "approve", generated.operationId); assert.equal(approved.ok, true); assert.equal(approved.providerCalls, 0);
  const continued = await worker(base, "continue", generated.operationId); assert.equal(continued.ok, true); assert.equal(continued.state, "Completed"); assert.equal(continued.providerCalls, 0); assert.ok(continued.githubCalls >= 2);
  assert.notEqual(generated.pid, approved.pid); assert.notEqual(approved.pid, continued.pid); assert.equal((await worker(base, "continue", generated.operationId)).ok, false);
  assert.equal(await readFile(path.join(base, "source", "value.ts"), "utf8"), "export const value = 1;\n");
});
test("process death during Personal review leaves the durable proposal pending and cannot authorize continuation", async t => {
  const base = await directory(t), generated = await worker(base, "generate"); assert.equal(generated.ok, true);
  const child = fork(fileURLToPath(new URL("./personal-worker.js", import.meta.url)), [base, "review", generated.operationId], { env: { PATH: process.env.PATH }, stdio: ["ignore", "ignore", "ignore", "ipc"], execArgv: [] });
  t.after(() => child.kill("SIGKILL"));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Synthetic review timeout")); }, 10000);
    child.once("message", message => { clearTimeout(timer); if ((message as { reviewing?: boolean }).reviewing) resolve(); else reject(new Error("Review did not start")); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
  });
  await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill("SIGKILL"); });
  const store = await openSqliteOperationJournal(path.join(base, "state", "ops.sqlite"), { approvalPolicy: personal }); t.after(() => store.close());
  assert.equal(store.get(generated.operationId)!.state, "PendingApproval"); assert.equal(store.approval(store.get(generated.operationId)!.approvalId!)!.status, "pending");
  assert.equal((await worker(base, "continue", generated.operationId)).ok, false);
  assert.equal(await readFile(path.join(base, "source", "value.ts"), "utf8"), "export const value = 1;\n");
});
test("v2 migration preserves historical Team operations and cannot reinterpret them as Personal", async t => {
  const f = await fixture(t), before = f.store.get(f.id)!; f.store.close();
  const filename = path.join(f.base, "state", "ops.sqlite"), db = new DatabaseSync(filename);
  db.exec("DROP TABLE human_confirmation_ids; DROP TABLE approval_reviews; PRAGMA user_version=2;"); db.close();
  const store = await openSqliteOperationJournal(filename, { approvalPolicy: personal }); t.after(() => store.close()); assert.deepEqual(store.get(f.id), before); assert.equal(store.approvalReview!(f.id), null);
  const ref = store.proposal(f.id)!, auth = authentication(path.join(f.base, "source"), path.join(f.base, "workspaces"));
  const bound = auth.auth.resumeVerifier({ sourceRoot: path.join(f.base, "source"), workspaceDirectory: path.join(f.base, "workspaces"), executionId: ref.executionId, workspaceId: ref.workspaceId });
  await assert.rejects(new ContinuationCoordinator({ store, artifacts: f.artifacts, policy, approvalPolicy: personal, verifier: bound.verifier }).decide(f.id, bound.credential, true, confirmation));
  assert.equal(store.get(f.id)!.state, "PendingApproval");
});
test("Personal Mode keeps stale leases fenced and uncertain execution non-replayable", async t => {
  const f = await fixture(t); await f.coordinator.decide(f.id, f.credential, true, confirmation);
  const op = f.store.get(f.id)!, lease = f.store.acquireLease(f.id, op.version, 5000, owner);
  assert.throws(() => f.store.assertLease({ ...lease, epoch: lease.epoch + 1 }));
  const prepared = f.store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId)!, running = f.store.start(prepared.operationId, prepared.version);
  f.store.finish(running.operationId, running.version, "Uncertain"); f.store.close();
  const reopened = await openSqliteOperationJournal(path.join(f.base, "state", "ops.sqlite"), { approvalPolicy: personal }); t.after(() => reopened.close());
  assert.throws(() => reopened.acquireLease(f.id, reopened.get(f.id)!.version, 5000, owner)); assert.equal(reopened.get(f.id)!.state, "Uncertain");
  assert.equal(await readFile(path.join(f.base, "source", "value.ts"), "utf8"), "export const value = 1;\n");
});
test("an interrupted review leaves approval pending and cannot be treated as confirmation", async t => {
  const f = await fixture(t);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(f.coordinator.decide(f.id, f.credential, true, { confirm: async () => { abort.signal.throwIfAborted(); return null; } }, abort.signal));
  assert.equal(f.store.get(f.id)!.state, "PendingApproval"); assert.equal(f.store.approval(f.store.get(f.id)!.approvalId!)!.decision, undefined);
});

test("historical reviewed Team context stays readable but cannot authorize a new decision, lease or effect", async t => {
  const f = await fixture(t), op = f.store.get(f.id)!, before = f.store.events(f.id); f.store.close();
  const db = new DatabaseSync(path.join(f.base, "state", "ops.sqlite"));
  const row = db.prepare("SELECT data FROM approval_reviews WHERE operation_id=?").get(f.id)!;
  const context = JSON.parse(String(row.data));
  context.policy = { version: 1, mode: "team", requireHumanConfirmation: true, allowRequesterApproval: false, requireExactPatchReview: true, requireSeparateSandboxApproval: true };
  context.policyDigest = createHash("sha256").update(JSON.stringify(context.policy)).digest("hex");
  const data = JSON.stringify(context); db.prepare("UPDATE approval_reviews SET data=?,checksum=? WHERE operation_id=?").run(data, createHash("sha256").update(data).digest("hex"), f.id); db.close();
  const store = await openSqliteOperationJournal(path.join(f.base, "state", "ops.sqlite")); t.after(() => store.close());
  assert.deepEqual(store.get(f.id), op); assert.deepEqual(store.events(f.id), before); assert.equal(store.approvalReview!(f.id)!.policy.mode as string, "team");
  assert.throws(() => store.decideReviewed!(op.approvalId!, owner, true)); assert.throws(() => store.acquireLease(f.id, op.version, 5000, owner));
  assert.equal(store.approval(op.approvalId!)!.status, "pending"); assert.equal(await readFile(path.join(f.base, "source", "value.ts"), "utf8"), "export const value = 1;\n");
});
