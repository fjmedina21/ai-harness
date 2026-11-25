import assert from "node:assert/strict";
import test from "node:test";
import { chmod, link, lstat, readFile, readdir, rename, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { FileValidationEvidenceStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import type { SnapshotValidationRuntime, SnapshotRuntimeResult } from "../snapshot-validation-runtime.js";
import { SandboxValidationRegistry, PodmanSnapshotValidationRuntime } from "../snapshot-validation-runtime.js";
import { ValidationCoordinator, expectedApprovedSnapshot } from "../validation-coordinator.js";
import { captureValidationSnapshot, decodeValidationSnapshot, validateSnapshotManifest, validationTransferDigest } from "../validation-snapshot.js";
import { engineeringHash } from "../engineering-workspace.js";
import { action, approver, operator, validationFixture, ValidationPodmanFixture } from "./phase9-validation-fixture.js";
import { PODMAN_OPTIONS } from "./podman-fixture.js";

const result: SnapshotRuntimeResult = { classification: "passed", exitCode: 0, timedOut: false, cancelled: false, cleanup: "confirmed", output: "ok", diagnostics: ["action.passed"] };
const runtime = (): SnapshotValidationRuntime => ({ execute: async () => structuredClone(result) });
const snapshot = (f: Awaited<ReturnType<typeof validationFixture>>) => captureValidationSnapshot(f.workspace, expectedApprovedSnapshot(f.artifact), {
  sourceRevision: f.artifact.sourceRevision, policyVersion: f.artifact.policy.version, policyDigest: f.artifact.policyDigest, allowedPaths: f.artifact.allowedPaths });
function coordinator(f: Awaited<ReturnType<typeof validationFixture>>, selected = runtime(), authorize = async () => operator) {
  return new ValidationCoordinator({ store: f.store, evidence: f.evidence, registry: f.registry, runtime: selected, authorize });
}
async function approved(f: Awaited<ReturnType<typeof validationFixture>>, c = coordinator(f)) {
  const pending = await c.prepare(f.artifact, f.workspace, "test"); assert.equal(pending.status, "approval_required");
  f.store.decide(pending.approvalId!, approver, true); return { c, pending };
}

test("snapshot has exact approved resulting inventory, immutable transport and stable identity", async t => {
  const f = await validationFixture(t), s = await snapshot(f), again = await snapshot(f);
  assert.notEqual(s.manifest.snapshotDigest, f.artifact.baseSnapshot.digest);
  assert.equal(s.manifest.snapshotDigest, (await f.workspace.inspect()).digest);
  assert.equal(s.manifest.executionId, f.artifact.executionId); assert.equal(s.manifest.workspaceId, f.artifact.workspaceId);
  assert.equal(s.manifest.snapshotId, again.manifest.snapshotId);
  const bytes = s.payload(); bytes[0] = 0; assert.notEqual(s.payload()[0], 0);
  assert.throws(() => { (s.manifest.files[0] as { bytes: number }).bytes = 999; });
  assert.equal(Buffer.from(decodeValidationSnapshot(s.payload()).contents[0]!, "base64").toString(), f.changed);
  assert.equal(await readFile(path.join(f.base, "source", "value.js"), "utf8"), f.original);
});
for (const field of ["snapshotDigest", "transferDigest", "workspaceId", "executionId", "policyDigest", "totalBytes"] as const) test("snapshot rejects corrupt " + field, async t => {
  const f = await validationFixture(t), s = await snapshot(f), m = structuredClone(s.manifest);
  if (field === "totalBytes") m.totalBytes++;
  else (m as unknown as Record<string, unknown>)[field] = field.includes("Digest") ? "0".repeat(64) : "different";
  assert.throws(() => validateSnapshotManifest(m));
});
for (const unsafe of ["../escape", "/root", "nested//x", "nested/.env", "node_modules/x", "pnpm-lock.yaml", "CON.txt", "nested/secret.key"]) test("manifest rejects traversal/reserved path " + unsafe, async t => {
  const f = await validationFixture(t), s = await snapshot(f), m = structuredClone(s.manifest);
  (m.files[0] as { path: string }).path = unsafe; m.snapshotDigest = engineeringHash(JSON.stringify(m.files)); m.transferDigest = validationTransferDigest(m);
  assert.throws(() => validateSnapshotManifest(m));
});
test("snapshot rejects corrupt content, additional fields, over-limit and noncanonical base64", async t => {
  const f = await validationFixture(t), s = await snapshot(f), raw = JSON.parse(Buffer.from(s.payload()).toString());
  raw.contents[0] += "\n"; assert.throws(() => decodeValidationSnapshot(Buffer.from(JSON.stringify(raw))));
  assert.throws(() => decodeValidationSnapshot(new Uint8Array(6 * 1024 * 1024 + 1)));
  const extra = { ...s.manifest, authority: true }; assert.throws(() => validateSnapshotManifest(extra));
});
test("manifest rejects nonstring hashes even if their string coercion resembles a digest", async t => {
  const f = await validationFixture(t), s = await snapshot(f), m = structuredClone(s.manifest);
  (m.files[0] as unknown as { hash: unknown }).hash = [m.files[0]!.hash];
  m.snapshotDigest = engineeringHash(JSON.stringify(m.files)); m.transferDigest = validationTransferDigest(m);
  assert.throws(() => validateSnapshotManifest(m));
});
test("manifest rejects file and descendant path collisions before staging", async t => {
  const f = await validationFixture(t), s = await snapshot(f), m = structuredClone(s.manifest);
  (m.files as { path: string; hash: string; bytes: number }[]).push({ path: "value.js/child.js", hash: engineeringHash(""), bytes: 0 });
  m.snapshotDigest = engineeringHash(JSON.stringify(m.files)); m.transferDigest = validationTransferDigest(m);
  assert.throws(() => validateSnapshotManifest(m));
});
for (const attack of ["changed", "symlink", "hardlink", "executable", "extra"] as const) test("capture rejects workspace " + attack, async t => {
  const f = await validationFixture(t), file = path.join(f.workspace.receipt.root, "value.js");
  if (attack === "changed") await writeFile(file, "modified after approval");
  if (attack === "symlink") { await rename(file, file + ".saved"); await symlink(file + ".saved", file); }
  if (attack === "hardlink") await link(file, path.join(f.base, "alias.js"));
  if (attack === "executable") await chmod(file, 0o700);
  if (attack === "extra") await writeFile(path.join(f.workspace.receipt.root, "extra.js"), "extra");
  await assert.rejects(snapshot(f));
});
test("host registry rejects commands, network, image drift, weaker limits and unsafe working directory", () => {
  const invalid = [{ ...action, executable: "sh" }, { ...action, network: "host" }, { ...action, image: "latest" }, { ...action, timeoutMs: Infinity },
    { ...action, timeoutMs: 10001 }, { ...action, maxOutputBytes: 1025 }, { ...action, workingDirectory: "../escape" }, { ...action, args: ["x\n--privileged"] },
    { ...action, resources: { ...action.resources, cpu: 2 } }, { ...action, resources: { ...action.resources, pids: 128 } }, { ...action, mount: "/host" }];
  for (const p of invalid) assert.throws(() => new SandboxValidationRegistry().register(p as typeof action));
  const r = new SandboxValidationRegistry(); r.register(action); const copy = r.get(action.id); (copy.args as string[])[0] = "tamper";
  assert.equal(r.get(action.id).args[0], "--test"); assert.throws(() => r.register(action)); assert.throws(() => r.get("model-command"));
});
test("runtime refuses missing live host acceptance before any process call", async t => {
  const f = await validationFixture(t), runner = new ValidationPodmanFixture();
  const sandbox = new PodmanSnapshotValidationRuntime(PODMAN_OPTIONS, runner, { verify: async () => { throw new Error("live gate pending"); } });
  await assert.rejects(sandbox.execute(await snapshot(f), action)); assert.equal(runner.calls.length, 0);
});
test("mocked runtime uses bounded stdin, same hardening, fixed receiver, no source argv and confirmed cleanup", async t => {
  const f = await validationFixture(t), runner = new ValidationPodmanFixture();
  const sandbox = new PodmanSnapshotValidationRuntime(PODMAN_OPTIONS, runner, { verify: async () => {} });
  const value = await sandbox.execute(await snapshot(f), action); assert.equal(value.classification, "passed"); assert.equal(value.cleanup, "confirmed");
  const create = runner.calls.find(c => c.args.includes("create"))!.args;
  for (const flag of ["--interactive", "--read-only", "--cap-drop", "--security-opt", "--http-proxy=false"]) assert.ok(create.includes(flag));
  assert.equal(create[create.indexOf("--network") + 1], "none"); assert.equal(create[create.indexOf("--tmpfs") + 1], "/tmp:rw,nosuid,nodev,noexec,size=16m,rprivate,notmpcopyup");
  assert.equal(create.includes("--mount"), false); assert.equal(create.includes("--volume"), false);
  assert.ok(runner.transfer); assert.equal(runner.transfer!.snapshot.manifest.workspaceId, f.artifact.workspaceId);
  assert.doesNotMatch(runner.calls.map(c => c.args.join(" ")).join("\n"), /export const value = 2/);
});
for (const mode of ["failure", "timeout", "invalid_result", "output_limit", "cleanup_uncertain", "profile_mismatch"] as const) test("runtime classifies " + mode + " safely", async t => {
  const f = await validationFixture(t), runner = new ValidationPodmanFixture();
  if (mode === "failure") runner.actionExitCode = 1;
  if (mode === "timeout") { runner.responseKind = "timeout"; runner.actionExitCode = null; }
  if (mode === "invalid_result") runner.responseOverride = "source tries to forge a successful validation";
  if (mode === "output_limit") runner.actionOutput = "x".repeat(1025);
  if (mode === "cleanup_uncertain") runner.failCleanup = true;
  const sandbox = new PodmanSnapshotValidationRuntime(PODMAN_OPTIONS, runner, { verify: async () => {} });
  if (mode === "profile_mismatch") await assert.rejects(sandbox.execute(await snapshot(f), { ...action, image: "example.invalid/node@sha256:" + "0".repeat(64) }));
  else {
    const value = await sandbox.execute(await snapshot(f), action);
    assert.equal(value.classification, mode === "failure" ? "failed" : mode === "timeout" ? "timeout" : "uncertain");
    assert.equal(value.timedOut, mode === "timeout");
  }
});
test("coordinator requires independent validation approval, commits evidence with real SQLite and rejects replay", async t => {
  const f = await validationFixture(t), calls: string[] = [], selected = runtime();
  const c = coordinator(f, { execute: async (...args) => { calls.push(args[0].manifest.transferDigest); return selected.execute(...args); } });
  const { pending } = await approved(f, c); assert.equal(calls.length, 0);
  const completed = await c.execute(f.artifact, f.workspace, "test", pending.approvalId!); assert.equal(completed.status, "executed"); assert.equal(completed.operationState, "Completed");
  const evidence = completed.data as { validationId: string; classification: string }; assert.equal(evidence.classification, "passed");
  const reopened = new FileValidationEvidenceStore(path.join(f.base, "evidence")); assert.deepEqual(await reopened.get(evidence.validationId), completed.data);
  assert.equal((await lstat(path.join(f.base, "evidence", evidence.validationId + ".json"))).mode & 0o777, 0o600);
  assert.equal((await readdir(path.join(f.base, "evidence"))).some(x => x.endsWith(".lock")), false);
  assert.equal((await c.execute(f.artifact, f.workspace, "test", pending.approvalId!)).status, "denied"); assert.equal(calls.length, 1);
  assert.equal(await readFile(path.join(f.base, "source", "value.js"), "utf8"), f.original);
});
test("coordinator rejects missing auth, wrong account provider, modified artifact and modified approved snapshot", async t => {
  const f = await validationFixture(t), c = coordinator(f);
  await assert.rejects(coordinator(f, runtime(), async () => { throw new Error("no session"); }).prepare(f.artifact, f.workspace, "test"));
  await assert.rejects(coordinator(f, runtime(), async () => ({ issuer: "fixture", subject: "1001" })).prepare(f.artifact, f.workspace, "test"));
  await assert.rejects(c.prepare({ ...f.artifact, policyDigest: "0".repeat(64) }, f.workspace, "test"));
  await writeFile(path.join(f.workspace.receipt.root, "value.js"), "changed after approved apply");
  await assert.rejects(c.prepare(f.artifact, f.workspace, "test"));
});
test("coordinator rejects validation self-approval even when a low-level host port was misused", async t => {
  const f = await validationFixture(t), c = coordinator(f), pending = await c.prepare(f.artifact, f.workspace, "test");
  f.store.decide(pending.approvalId!, operator, true);
  const blocked = await c.execute(f.artifact, f.workspace, "test", pending.approvalId!); assert.notEqual(blocked.status, "executed");
});
test("uncertain cleanup retains private claim, evidence and durable Uncertain operation", async t => {
  const f = await validationFixture(t), c = coordinator(f, { execute: async () => ({ ...result, classification: "uncertain", cleanup: "uncertain", diagnostics: ["runtime.cleanup_uncertain"] }) });
  const { pending } = await approved(f, c), failed = await c.execute(f.artifact, f.workspace, "test", pending.approvalId!);
  assert.equal(failed.operationState, "Uncertain");
  assert.equal((await readdir(path.join(f.base, "evidence"))).some(x => x.endsWith(".lock")), true);
  assert.equal((await c.execute(f.artifact, f.workspace, "test", pending.approvalId!)).status, "denied");
});
test("interrupted durable operation and claimed workspace remain blocked across reopen", async t => {
  const f = await validationFixture(t), { pending } = await approved(f);
  await f.evidence.claim(f.artifact.workspaceId, "0".repeat(64));
  const op = f.store.get(pending.operationId!)!; const prepared = f.store.prepare(op.operationId, op.version, op.scopeDigest, pending.approvalId)!;
  f.store.start(prepared.operationId, prepared.version); f.store.close();
  const reopened = await openSqliteOperationJournal(path.join(f.base, "state", "ops.sqlite")); t.after(() => reopened.close());
  assert.equal(reopened.get(op.operationId)!.state, "Running");
  await assert.rejects(new FileValidationEvidenceStore(path.join(f.base, "evidence")).claim(f.artifact.workspaceId, "1".repeat(64)));
});
test("exclusive evidence claim rejects concurrent validations and wrong release owner", async t => {
  const f = await validationFixture(t), second = new FileValidationEvidenceStore(path.join(f.base, "evidence"));
  const outcomes = await Promise.allSettled([f.evidence.claim(f.artifact.workspaceId, "1".repeat(64)), second.claim(f.artifact.workspaceId, "2".repeat(64))]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const owner = outcomes[0]!.status === "fulfilled" ? "1" : "2";
  await assert.rejects(f.evidence.release(f.artifact.workspaceId, "3".repeat(64)));
  await f.evidence.release(f.artifact.workspaceId, owner.repeat(64));
});

for (const patchState of ["approved", "running", "uncertain"] as const) test("historical lease never permits validation after patch " + patchState, async t => {
  const f = await validationFixture(t, patchState);
  await assert.rejects(coordinator(f).prepare(f.artifact, f.workspace, "test"));
  const op = f.store.register({ executionId: f.artifact.executionId, taskId: "sandbox-validation", requestId: "invalid", projectRoot: f.workspace.receipt.root,
    toolId: "sandbox.validate", argumentDigest: "0".repeat(64), permission: "shell:execute", risk: "high", safety: "side_effecting", requester: operator, requiresApproval: true }).operation;
  f.store.decide(op.approvalId!, approver, true); const current = f.store.get(op.operationId)!;
  assert.throws(() => f.store.prepare(current.operationId, current.version, current.scopeDigest, current.approvalId));
});
test("historical completed patch lease permits only separately approved exact validation operation kind", async t => {
  const f = await validationFixture(t);
  const mutations = [{ toolId: "shell.execute" }, { taskId: "other" }, { permission: "files:write" }, { risk: "low" }, { safety: "read_only" }, { requiresApproval: false }];
  for (let i = 0; i < mutations.length; i++) {
    const op = f.store.register({ executionId: f.artifact.executionId, taskId: "sandbox-validation", requestId: "invalid" + i, projectRoot: f.workspace.receipt.root,
      toolId: "sandbox.validate", argumentDigest: "0".repeat(64), permission: "shell:execute", risk: "high", safety: "side_effecting", requester: operator, requiresApproval: true,
      ...mutations[i] } as Parameters<typeof f.store.register>[0]).operation;
    if (op.approvalId) f.store.decide(op.approvalId, approver, true);
    const current = f.store.get(op.operationId)!;
    assert.throws(() => f.store.prepare(current.operationId, current.version, current.scopeDigest, current.approvalId));
  }
  const c = coordinator(f), pending = await c.prepare(f.artifact, f.workspace, "test");
  const noGrant = await c.execute(f.artifact, f.workspace, "test", pending.approvalId!);
  assert.notEqual(noGrant.status, "executed"); assert.equal(f.store.get(pending.operationId!)!.state, "PendingApproval");
});
test("operator session changing during permission revalidation cannot start a workload", async t => {
  const f = await validationFixture(t); let calls = 0, auth = 0;
  const c = coordinator(f, { execute: async () => { calls++; return result; } }, async () => ++auth < 3 ? operator : { ...operator, subject: "9009" });
  const { pending } = await approved(f, c), value = await c.execute(f.artifact, f.workspace, "test", pending.approvalId!);
  assert.notEqual(value.status, "executed"); assert.equal(calls, 0);
});
test("concurrent executions of one approved validation run workload at most once", async t => {
  const f = await validationFixture(t); let calls = 0, release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const c = coordinator(f, { execute: async () => { calls++; await gate; return result; } });
  const { pending } = await approved(f, c);
  const one = c.execute(f.artifact, f.workspace, "test", pending.approvalId!), two = c.execute(f.artifact, f.workspace, "test", pending.approvalId!);
  release(); const results = await Promise.all([one, two]);
  assert.equal(results.filter(r => r.status === "executed").length, 1); assert.equal(calls, 1);
});
for (const classification of ["failed", "timeout", "cancelled"] as const) test("bounded evidence preserves " + classification + " without provider calls or repair", async t => {
  const f = await validationFixture(t), c = coordinator(f, { execute: async () => ({ ...result, classification, exitCode: classification === "failed" ? 1 : null,
    timedOut: classification === "timeout", cancelled: classification === "cancelled", diagnostics: ["action." + classification] }) });
  const { pending } = await approved(f, c), output = await c.execute(f.artifact, f.workspace, "test", pending.approvalId!);
  assert.equal(output.status, "executed"); const stored = output.data as { classification: string; validationId: string };
  assert.equal(stored.classification, classification); assert.equal((await f.evidence.get(stored.validationId))!.classification, classification);
  assert.equal(await readFile(path.join(f.base, "source", "value.js"), "utf8"), f.original);
});
