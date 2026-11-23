import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { openSqliteOperationJournal, inspectDurableRecovery } from "@ai-harness/checkpointing";
import type { EngineeringPolicy, FileChange } from "@ai-harness/contracts";
import { EngineeringWorkspace, EngineeringPatchEngine, createEngineeringTools, engineeringHash, engineeringPath, openEngineeringSource, patchInvocation, inspectEngineeringRecovery, cleanupEngineeringWorkspace } from "../index.js";

async function fixture(t: TestContext, options: { now?: () => number; ttl?: number } = {}) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-engineering-")));
  const source = path.join(base, "source"), directory = path.join(base, "workspaces"), journal = path.join(base, "journal");
  for (const dir of [source, directory, journal]) await mkdir(dir, { mode: 0o700 });
  await writeFile(path.join(source, "value.ts"), "export const value = 1;\n", { mode: 0o600 });
  const store = await openSqliteOperationJournal(path.join(journal, "ops.sqlite"), { now: options.now, approvalTtlMs: options.ttl });
  const binding = { store, requester: { issuer: "fixture", subject: "requester" }, safetyByTool: {} };
  const policy: EngineeringPolicy = { version: "fixture-v1", allowedPaths: ["value.ts", "new.ts", "nested/new.ts"], allowedOperations: ["create", "replace", "delete"], maxFiles: 4, maxBytes: 8192 };
  const create = (executionId = "execution", signal?: AbortSignal) => EngineeringWorkspace.create({ directory, sourceRoot: source, executionId, files: ["value.ts"], maxFiles: 16, maxBytes: 65536, ttlMs: 60_000, binding, createAuthorized: true, signal });
  t.after(async () => { try { store.close(); } catch { /* Reopen tests close it. */ } await rm(base, { recursive: true, force: true }); });
  return { base, source, directory, journal, store, binding, policy, create };
}
async function proposal(engine: EngineeringPatchEngine, content = "export const value = 2;\n") {
  const snap = await engine.view.inspect();
  return engine.propose({ baseRevision: snap.digest, changes: [{ path: "value.ts", operation: "replace", baseHash: snap.files.find(f => f.path === "value.ts")!.hash, content, resultHash: engineeringHash(content) }] });
}
const human = { issuer: "fixture", subject: "human" };

test("L1 proposals and diffs leave source and directory inventory unchanged", async t => {
  const f = await fixture(t); const before = await readdir(f.source);
  const view = await openEngineeringSource(f.source, "proposal", ["value.ts"]);
  const engine = new EngineeringPatchEngine(view, f.policy), p = await proposal(engine);
  assert.match(await engine.diff(p.digest), /-export const value = 1;\n\+export const value = 2;/);
  assert.deepEqual(await readdir(f.source), before);
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
  await assert.rejects(engine.apply(p.digest), /L1/);
  assert.equal(f.store.list("proposal").length, 0);
});
for (const unsafe of ["../escape", "/absolute", "C:/drive", "a/../b", "a//b", "a/.git/config", ".env", "a/.ai/config", "node_modules/x", "a.pem", "a\\b", "CON.txt", "x/credentials", "x/."]) {
  test(`path rejects ${unsafe}`, () => assert.throws(() => engineeringPath(unsafe)));
}
test("workspace copies only selected regular files with exclusive ownership and durable creation", async t => {
  const f = await fixture(t); await writeFile(path.join(f.source, ".env"), "fixture-only");
  const w = await f.create(); assert.notEqual(w.receipt.root, f.source);
  assert.equal((await lstat(w.receipt.root)).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(w.receipt.root), ["value.ts"]);
  assert.equal((await w.inspect()).digest, w.receipt.baseRevision);
  assert.equal(f.store.list("execution")[0]!.state, "Completed");
});
test("concurrent executions get distinct private workspaces", async t => {
  const f = await fixture(t); const [a, b] = await Promise.all([f.create("first"), f.create("second")]);
  assert.notEqual(a.receipt.workspaceId, b.receipt.workspaceId);
  await writeFile(path.join(a.receipt.root, "value.ts"), "changed");
  assert.equal(await b.read("value.ts"), "export const value = 1;\n");
});
for (const mode of ["symlink", "hardlink", "executable"] as const) test(`workspace rejects source ${mode}`, async t => {
  const f = await fixture(t), target = path.join(f.source, "value.ts");
  if (mode === "symlink") { await rm(target); await symlink(path.join(f.source, "other"), target); }
  if (mode === "hardlink") await link(target, path.join(f.source, "alias"));
  if (mode === "executable") await chmod(target, 0o700);
  await assert.rejects(f.create()); assert.equal((await readdir(f.directory)).length, 0);
});
test("workspace root replacement and permissions fail ownership checks", async t => {
  const f = await fixture(t), w = await f.create(); await chmod(w.receipt.root, 0o755);
  await assert.rejects(w.inspect(), /ownership/);
});
test("workspace rejects source overlap, missing authorization, file and byte limits", async t => {
  const f = await fixture(t);
  const options = { directory: f.directory, sourceRoot: f.source, executionId: "limits", files: ["value.ts"], maxFiles: 1, maxBytes: 1, ttlMs: 1000, binding: f.binding, createAuthorized: true as const };
  await assert.rejects(EngineeringWorkspace.create(options), /budget/);
  await assert.rejects(EngineeringWorkspace.create({ ...options, createAuthorized: false as true }), /authorization/);
  await assert.rejects(EngineeringWorkspace.create({ ...options, directory: f.source }), /separate/);
});
test("patch schema rejects extra keys, scope changes, invalid hashes and wrong revision", async t => {
  const f = await fixture(t), e = new EngineeringPatchEngine(await f.create(), f.policy), p = await proposal(e);
  for (const invalid of [null, { baseRevision: p.baseRevision, changes: [], authority: true }, { baseRevision: "wrong", changes: p.changes },
    { baseRevision: p.baseRevision, changes: [{ ...p.changes[0], resultHash: "0".repeat(64) }] },
    { baseRevision: p.baseRevision, changes: [{ ...p.changes[0], path: "outside.ts" }] }]) await assert.rejects(e.propose(invalid));
  const mutated = e.get(p.digest); (mutated.changes[0] as FileChange).content = "substitution";
  assert.notEqual(e.get(p.digest).changes[0]!.content, "substitution");
});
test("changed workspace snapshot conflicts before application", async t => {
  const f = await fixture(t), w = await f.create(), e = new EngineeringPatchEngine(w, f.policy), p = await proposal(e);
  await writeFile(path.join(w.receipt.root, "value.ts"), "concurrent change");
  await assert.rejects(e.validate(p.digest), /changed/);
  assert.equal(await w.read("value.ts"), "concurrent change");
});
test("durable patch requires independent approval, applies exactly the reviewed digest and rejects replay", async t => {
  const f = await fixture(t), w = await f.create(), e = new EngineeringPatchEngine(w, f.policy), p = await proposal(e), tools = createEngineeringTools(e, f.binding);
  const identity = { taskId: "apply", requestId: "first" }, invocation = patchInvocation(p);
  const waiting = await tools.dispatch(invocation, identity);
  assert.equal(waiting.status, "approval_required");
  assert.throws(() => f.store.decide(waiting.approvalId!, f.binding.requester, true));
  f.store.decide(waiting.approvalId!, human, true);
  const applied = await tools.dispatch(invocation, identity, waiting.approvalId);
  assert.equal(applied.status, "executed"); assert.equal(applied.operationState, "Completed");
  assert.equal(await w.read("value.ts"), p.changes[0]!.content);
  assert.equal((await tools.dispatch(invocation, identity, waiting.approvalId)).status, "denied");
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("approval cannot authorize a substituted patch", async t => {
  const f = await fixture(t), w = await f.create(), e = new EngineeringPatchEngine(w, f.policy), tools = createEngineeringTools(e, f.binding);
  const a = await proposal(e, "first"), b = await proposal(e, "second"), identity = { taskId: "apply", requestId: "one" };
  const waiting = await tools.dispatch(patchInvocation(a), identity); f.store.decide(waiting.approvalId!, human, true);
  assert.equal((await tools.dispatch(patchInvocation(b), identity, waiting.approvalId)).status, "denied");
  assert.equal(await w.read("value.ts"), "export const value = 1;\n");
});
test("expired durable approval never mutates workspace", async t => {
  let now = Date.now(); const f = await fixture(t, { now: () => now, ttl: 20 });
  const w = await f.create(), e = new EngineeringPatchEngine(w, f.policy), p = await proposal(e), tools = createEngineeringTools(e, f.binding), identity = { taskId: "apply", requestId: "expire" };
  const waiting = await tools.dispatch(patchInvocation(p), identity); f.store.decide(waiting.approvalId!, human, true); now += 30;
  assert.equal((await tools.dispatch(patchInvocation(p), identity, waiting.approvalId)).status, "denied");
  assert.equal(await w.read("value.ts"), "export const value = 1;\n");
});
test("unknown tools, invalid schema and missing permission cannot dispatch patches", async t => {
  const f = await fixture(t), w = await f.create(), e = new EngineeringPatchEngine(w, f.policy), p = await proposal(e), tools = createEngineeringTools(e, f.binding);
  assert.equal((await tools.dispatch({ toolId: "shell.execute", arguments: {} }, { taskId: "t", requestId: "r" })).status, "invalid");
  assert.equal((await tools.dispatch({ toolId: "patch.apply", arguments: { digest: p.digest } }, { taskId: "t", requestId: "r" })).status, "invalid");
  assert.equal((await tools.dispatcher.dispatch(patchInvocation(p), { executionId: "execution", projectRoot: w.receipt.root, defaultDeny: true, grantedPermissions: [], requireApprovalFor: [] })).status, "denied");
});
test("create, replace, delete and no-newline diffs are bounded and verified", async t => {
  const f = await fixture(t), w = await f.create(), e = new EngineeringPatchEngine(w, f.policy);
  const snap = await w.inspect(); const content = "new content";
  const p = await e.propose({ baseRevision: snap.digest, changes: [
    { path: "nested/new.ts", operation: "create", baseHash: null, content, resultHash: engineeringHash(content) },
    { path: "value.ts", operation: "delete", baseHash: snap.files[0]!.hash, content: null, resultHash: null } ] });
  assert.match(await e.diff(p.digest), /No newline at end of file/);
  await e.apply(p.digest); assert.equal(await w.read("nested/new.ts"), content);
  assert.deepEqual((await w.inspect()).files.map(f => f.path), ["nested/new.ts"]);
});
test("concurrent mutations cannot both acquire the workspace lock", async t => {
  const f = await fixture(t), w = await f.create(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const first = w.mutate(async () => { started(); await gate; }); await ready;
  await assert.rejects(w.mutate(async () => {})); release(); await first;
});
test("cancel before creation and application causes no writes", async t => {
  const f = await fixture(t), signal = AbortSignal.abort(); await assert.rejects(f.create("cancelled", signal));
  assert.equal((await readdir(f.directory)).length, 0);
  const w = await f.create(), e = new EngineeringPatchEngine(w, f.policy), p = await proposal(e);
  await assert.rejects(e.apply(p.digest, signal));
  assert.equal(await w.read("value.ts"), "export const value = 1;\n");
});
test("partial effect poisons workspace, persists lock and survives SQLite reopen without replay", async t => {
  const f = await fixture(t), w = await f.create();
  await assert.rejects(w.mutate(async () => { await writeFile(path.join(w.receipt.root, "value.ts"), "partial"); throw new Error("fixture crash"); }), /uncertain/);
  await assert.rejects(w.inspect(), /uncertain/);
  assert.ok((await readdir(path.dirname(w.receipt.root))).includes("mutation.lock"));
  let op = f.store.register({ executionId: "execution", taskId: "crash", requestId: "effect", projectRoot: w.receipt.root, toolId: "patch.apply", permission: "files:write", risk: "medium", safety: "side_effecting", requester: f.binding.requester, requiresApproval: false, argumentDigest: engineeringHash("fixture") }).operation;
  op = f.store.prepare(op.operationId, op.version, op.scopeDigest)!; f.store.start(op.operationId, op.version); f.store.close();
  const reopened = await openSqliteOperationJournal(path.join(f.journal, "ops.sqlite"));
  try { const decision = inspectDurableRecovery(reopened, "execution").find(r => r.operationId === op.operationId)!; assert.equal(decision.retryAllowed, false); assert.ok(["reconcile", "blocked"].includes(decision.action)); }
  finally { reopened.close(); }
  assert.equal(await readFile(path.join(w.receipt.root, "value.ts"), "utf8"), "partial");
});

test("recovery compares receipt, current snapshot and journal without granting resume", async t => {
  const f = await fixture(t), w = await f.create();
  const clean = await inspectEngineeringRecovery(w.receipt, w.receipt.baseRevision, f.store);
  assert.equal(clean.action, "host_review"); assert.equal(clean.retryAllowed, false);
  await writeFile(path.join(w.receipt.root, "value.ts"), "external change");
  assert.equal((await inspectEngineeringRecovery(w.receipt, w.receipt.baseRevision, f.store)).reason, "snapshot_changed");
});
test("real process crash preserves applied files, stale lock and durable Running without replay", async t => {
  const f = await fixture(t); f.store.close();
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL("./engineering-crash-worker.js", import.meta.url)), f.source, f.directory, path.join(f.journal, "ops.sqlite")]), (e: unknown) => (e as { code?: number }).code === 86);
  const id = (await readdir(f.directory))[0]!, control = path.join(f.directory, id);
  assert.ok((await readdir(control)).includes("mutation.lock"));
  assert.equal(await readFile(path.join(control, "files", "value.ts"), "utf8"), "crash fixture replacement\n");
  const receipt = JSON.parse(await readFile(path.join(control, "receipt.json"), "utf8"));
  const reopened = await openSqliteOperationJournal(path.join(f.journal, "ops.sqlite"));
  try {
    const operations = reopened.list("crash-execution"), operation = operations.find(op => op.toolId === "patch.apply")!;
    assert.equal(operation.state, "Running");
    assert.equal(inspectDurableRecovery(reopened, "crash-execution").find(op => op.operationId === operation.operationId)!.retryAllowed, false);
    assert.equal((await inspectEngineeringRecovery(receipt, receipt.baseRevision, reopened)).action, "blocked");
  } finally { reopened.close(); }
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("workspace identity cannot be reused for a second copy in the same execution", async t => {
  const f = await fixture(t); await f.create(); await assert.rejects(f.create()); assert.equal((await readdir(f.directory)).length, 1);
});

test("host-only exact-snapshot cleanup removes owned workspace without touching source", async t => {
  const f = await fixture(t), w = await f.create();
  await assert.rejects(cleanupEngineeringWorkspace(w.receipt, w.receipt.baseRevision, f.binding, false as true));
  await assert.rejects(cleanupEngineeringWorkspace(w.receipt, "0".repeat(64), f.binding, true));
  const result = await cleanupEngineeringWorkspace(w.receipt, w.receipt.baseRevision, f.binding, true);
  assert.equal(result.cleanup, "confirmed"); assert.deepEqual(await readdir(f.directory), []);
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
  assert.equal(f.store.list("execution").find(op => op.toolId === "workspace.cleanup")!.state, "Completed");
});
test("cleanup preserves uncertain effects and crash evidence", async t => {
  const f = await fixture(t), w = await f.create(); await assert.rejects(w.mutate(async () => { throw new Error("fixture fault"); }));
  await assert.rejects(cleanupEngineeringWorkspace(w.receipt, w.receipt.baseRevision, f.binding, true));
  assert.equal((await readdir(f.directory)).length, 1);
});

test("source proposals cannot create over an existing unselected file or directory", async t => {
  const f = await fixture(t); await writeFile(path.join(f.source, "new.ts"), "unselected"); await mkdir(path.join(f.source, "nested"));
  const view = await openEngineeringSource(f.source, "proposal", ["value.ts"]), policy = { ...f.policy, allowedPaths: ["new.ts", "nested"] }, engine = new EngineeringPatchEngine(view, policy);
  for (const target of ["new.ts", "nested"]) await assert.rejects(engine.propose({ baseRevision: (await view.inspect()).digest, changes: [{ path: target, operation: "create", baseHash: null, content: "x", resultHash: engineeringHash("x") }] }));
});
test("empty-file creation has a reviewable Git diff without a zero-length hunk", async t => {
  const f = await fixture(t), w = await f.create(), e = new EngineeringPatchEngine(w, f.policy);
  const p = await e.propose({ baseRevision: (await w.inspect()).digest, changes: [{ path: "new.ts", operation: "create", baseHash: null, content: "", resultHash: engineeringHash("") }] });
  const diff = await e.diff(p.digest); assert.match(diff, /new file mode 100644/); assert.doesNotMatch(diff, /@@/); await e.apply(p.digest); assert.equal(await w.read("new.ts"), "");
});
for (const attack of ["symlink", "hardlink"] as const) test(`workspace inventory rejects introduced ${attack}`, async t => {
  const f = await fixture(t), w = await f.create();
  if (attack === "symlink") await symlink(f.source, path.join(w.receipt.root, "linked"));
  else await link(path.join(w.receipt.root, "value.ts"), path.join(w.receipt.root, "linked.ts"));
  await assert.rejects(w.inspect());
});
