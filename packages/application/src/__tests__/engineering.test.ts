import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EngineeringCheckpointStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import type { ValidationEvidence, WorkspaceSnapshot } from "@ai-harness/contracts";
import { engineeringHash } from "@ai-harness/tools";
import { InMemoryTelemetrySink, TelemetrySession } from "@ai-harness/observability";
import { runEngineeringWorkflow, type EngineeringAgentPort, type EngineeringOptions } from "../engineering.js";
async function setup(t: TestContext) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "harness-engineering-e2e-")));
  const source = path.join(root, "source"), workspaces = path.join(root, "workspaces"), state = path.join(root, "state");
  for (const directory of [source, workspaces, state]) await mkdir(directory, { mode: 0o700 });
  await writeFile(path.join(source, "value.ts"), "export const value = 1;\n", { mode: 0o600 });
  const store = await openSqliteOperationJournal(path.join(state, "journal.sqlite"));
  t.after(async () => { try { store.close(); } catch {} await rm(root, { recursive: true, force: true }); });
  let turn = 0;
  const agent: EngineeringAgentPort = { id: "fixture", mode: "fixture", maxTokensPerRequest: 5, maxEstimatedCostUsdPerRequest: 0,
    async execute(input) {
      if (input.role !== "backend-developer") return { summary: "Synthetic fixture plan and review", usage: { tokens: 1, estimatedCostUsd: 0 } };
      const content = `export const value = ${++turn + 1};\n`;
      return { summary: "Synthetic proposal", usage: { tokens: 1, estimatedCostUsd: 0 }, proposal: { baseRevision: input.snapshot.digest,
        changes: [{ path: "value.ts", operation: "replace", baseHash: input.snapshot.files[0]!.hash, content, resultHash: engineeringHash(content) }] } };
    } };
  const options: EngineeringOptions = { projectRoot: source, request: "Synthetic fixture change", files: ["value.ts"], level: 2, agent,
    budget: { maxIterations: 3, maxRequests: 16, maxTokens: 100, maxEstimatedCostUsd: 0, timeoutMs: 10_000, maxFiles: 4, maxBytes: 8192 },
    policy: { version: "fixture", allowedPaths: ["value.ts", "new.ts"], allowedOperations: ["create", "replace", "delete"], maxFiles: 4, maxBytes: 8192 },
    workspace: { directory: workspaces, binding: { store, requester: { issuer: "fixture", subject: "requester" }, safetyByTool: {} }, createAuthorized: true, ttlMs: 60_000 },
    checkpoint: new EngineeringCheckpointStore(state),
    async requestApproval(request) { store.decide(request.approvalId, { issuer: "fixture", subject: "human" }, true); return request.approvalId; } };
  const evidence = (snapshot: WorkspaceSnapshot, workspaceId: string, pass: boolean, checks: string[] = []): ValidationEvidence => ({ snapshotDigest: snapshot.digest, workspaceId,
    kind: "fixture", profile: "fixture-profile", environment: "fixture-node", validationId: "unit_tests", durationMs: 1, exitCode: pass ? 0 : 1,
    result: pass ? "passed" : "failed", cleanup: "confirmed", logDigest: engineeringHash(pass ? "passed" : "failed"), passedChecks: checks,
    resources: { cpu: 0.5, memoryBytes: 268435456, pids: 64 } });
  return { options, source, workspaces, state, store, evidence };
}
test("engineering L1 produces a reviewed proposal without any source/workspace/checkpoint writes", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow({ ...f.options, level: 1, workspace: undefined, checkpoint: undefined });
  assert.equal(result.state, "Proposed"); assert.equal(result.patches.length, 1); assert.equal(result.integrated, false);
  assert.match(result.diff, /value = 2/); assert.deepEqual(await readdir(f.workspaces), []);
  assert.deepEqual((await readdir(f.state)).filter(f => f.endsWith(".json")), []);
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("L2 request pauses without approval and cannot claim applied or completed", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow({ ...f.options, requestApproval: undefined });
  assert.equal(result.termination, "approval_required"); assert.equal(result.pendingApprovals.length, 1);
  assert.equal(result.patches[0]!.status, "proposed"); assert.equal(result.state, "ReviewPending");
  assert.equal(await readFile(path.join(result.workspace!.root, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("L2 applies authorized code, emits final net diff and checkpoints, and leaves human review pending", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow(f.options);
  assert.equal(result.state, "ReviewPending"); assert.equal(result.termination, "review_pending");
  assert.deepEqual(result.filesModified, ["value.ts"]); assert.ok(result.events.includes("Applying")); assert.ok(result.events.includes("Applied"));
  assert.equal(result.patches[0]!.status, "applied"); assert.equal(result.validations.length, 0);
  assert.ok((await readdir(f.state)).some(f => f.endsWith(".json")));
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("fixture repair fails once, corrects once and requires final independent human review", async t => {
  const f = await setup(t); let validation = 0;
  const result = await runEngineeringWorkflow({ ...f.options, level: 3, sensitive: true,
    validation: { kind: "fixture", async validate(s, w) { return f.evidence(s, w, ++validation > 1, validation > 1 ? ["unit"] : []); } },
    humanReview: async () => true });
  assert.equal(result.state, "Completed"); assert.equal(result.repairAttempts, 1); assert.equal(result.validations.length, 2);
  assert.equal(result.levelAvailable, 2); assert.equal(result.l3Gate, "blocked"); assert.equal(result.validationScope, "fixture");
  assert.equal(result.integrated, false); assert.ok(result.participants.includes("software-architect")); assert.ok(result.participants.includes("security-specialist"));
  assert.match(result.diff, /-export const value = 1;/); assert.match(result.diff, /\+export const value = 3;/);
  assert.doesNotMatch(result.diff, /value = 2/);
});
test("real L3 request is blocked before workspace creation or agent requests", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow({ ...f.options, level: 3, realValidationRequested: true });
  assert.equal(result.termination, "sandbox_blocked"); assert.equal(result.usage.requests, 0); assert.deepEqual(await readdir(f.workspaces), []);
});
test("repair stops after repeated errors and preserves reviewable applied evidence", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow({ ...f.options, level: 3, validation: { kind: "fixture", async validate(s, w) { return f.evidence(s, w, false); } } });
  assert.equal(result.termination, "no_progress"); assert.equal(result.validations.length, 2); assert.equal(result.state, "Failed"); assert.match(result.diff, /value = 3/);
});
test("repair detects regression of a previously passing host check", async t => {
  const f = await setup(t); let validation = 0;
  const result = await runEngineeringWorkflow({ ...f.options, level: 3, validation: { kind: "fixture", async validate(s, w) { return f.evidence(s, w, false, ++validation === 1 ? ["passed_before"] : []); } } });
  assert.equal(result.termination, "regression"); assert.equal(result.repairAttempts, 1);
});
test("repair iteration limit is finite even when errors differ", async t => {
  const f = await setup(t); let n = 0;
  const result = await runEngineeringWorkflow({ ...f.options, budget: { ...f.options.budget, maxIterations: 2 }, level: 3,
    validation: { kind: "fixture", async validate(s, w) { return { ...f.evidence(s, w, false), logDigest: engineeringHash(String(++n)) }; } } });
  assert.equal(result.termination, "budget"); assert.equal(result.validations.length, 2);
});
for (const kind of ["requests", "tokens", "cost"] as const) test(`host ${kind} budget stops before modifying files`, async t => {
  const f = await setup(t); const budget = { ...f.options.budget };
  const agent = { ...f.options.agent };
  if (kind === "requests") budget.maxRequests = 1;
  if (kind === "tokens") agent.execute = async () => ({ summary: "fixture", usage: { tokens: 6, estimatedCostUsd: 0 } });
  if (kind === "cost") agent.maxEstimatedCostUsdPerRequest = 1;
  const result = await runEngineeringWorkflow({ ...f.options, budget, agent }); assert.equal(result.termination, "budget"); assert.equal(result.patches.length, 0);
});
test("unknown usage fails closed and never applies a model proposal", async t => {
  const f = await setup(t); const agent = { ...f.options.agent, execute: async () => ({ summary: "unknown usage", usage: undefined as never }) };
  const result = await runEngineeringWorkflow({ ...f.options, agent }); assert.equal(result.termination, "budget");
});
test("cancellation before start leaves no workspace", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow({ ...f.options, signal: AbortSignal.abort() });
  assert.equal(result.state, "Cancelled"); assert.equal(result.termination, "cancelled"); assert.deepEqual(await readdir(f.workspaces), []);
});
test("timeout bounds a provider port that ignores cancellation", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow({ ...f.options, level: 1, budget: { ...f.options.budget, timeoutMs: 30 }, agent: { ...f.options.agent, execute: () => new Promise(() => {}) } });
  assert.equal(result.termination, "timeout"); assert.equal(result.patches.length, 0);
});
test("engineering accepts the host-selected 600 second ceiling and rejects larger deadlines before agent calls", async t => {
  const f = await setup(t); let calls = 0;
  const agent: EngineeringAgentPort = { ...f.options.agent, async execute(input) { calls++; return f.options.agent.execute(input); } };
  const options = { ...f.options, level: 1 as const, agent };
  await assert.rejects(runEngineeringWorkflow({ ...options, budget: { ...options.budget, timeoutMs: 600001 } }), /Invalid engineering limit/);
  assert.equal(calls, 0); assert.deepEqual(await readdir(f.workspaces), []);
  const result = await runEngineeringWorkflow({ ...options, budget: { ...options.budget, timeoutMs: 600000 } });
  assert.equal(result.termination, "proposed"); assert.ok(calls > 0);
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("validation cancellation leaves uncertainty rather than replaying effects", async t => {
  const f = await setup(t), abort = new AbortController();
  const result = await runEngineeringWorkflow({ ...f.options, level: 3, signal: abort.signal, validation: { kind: "fixture", async validate() { abort.abort(); return new Promise(() => {}); } } });
  assert.equal(result.state, "Uncertain"); assert.equal(result.validations.length, 0); assert.equal(result.repairAttempts, 0);
});
for (const kind of ["cleanup", "snapshot", "real_evidence"] as const) test(`invalid ${kind} evidence blocks completion`, async t => {
  const f = await setup(t);
  const result = await runEngineeringWorkflow({ ...f.options, level: 3, validation: { kind: "fixture", async validate(s, w) {
    const e = f.evidence(s, w, true); if (kind === "cleanup") e.cleanup = "uncertain"; if (kind === "snapshot") e.snapshotDigest = "0".repeat(64); if (kind === "real_evidence") e.kind = "real_podman"; return e;
  } } });
  assert.equal(result.state, "Uncertain"); assert.equal(result.l3Gate, "blocked");
});
test("checkpoint failure prevents further mutation and is reported uncertain", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow({ ...f.options, checkpoint: { async save() { throw new Error("fixture storage fault"); } } });
  assert.equal(result.state, "Uncertain"); assert.equal(result.usage.requests, 0);
});
test("engineering telemetry redacts file content, patches, prompts and approval IDs", async t => {
  const f = await setup(t), sink = new InMemoryTelemetrySink(), telemetry = new TelemetrySession({ sink });
  const result = await runEngineeringWorkflow({ ...f.options, telemetry: telemetry.trace("fixture-execution") });
  await telemetry.flush(); const events = JSON.stringify(sink.events());
  assert.match(events, /engineering.state/); assert.doesNotMatch(events, /export const|Synthetic fixture change|approvalId|content|diff/);
  assert.equal(result.state, "ReviewPending");
});

test("repair detects repeated snapshots and clears the net diff when restored to base", async t => {
  const f = await setup(t); let count = 0;
  const execute = f.options.agent.execute.bind(f.options.agent);
  const result = await runEngineeringWorkflow({ ...f.options, level: 3,
    agent: { ...f.options.agent, async execute(input) {
      const output = await execute(input);
      if (input.role === "backend-developer" && ++count === 2) {
        const content = "export const value = 1;\n";
        output.proposal = { baseRevision: input.snapshot.digest, changes: [{ path: "value.ts", operation: "replace", baseHash: input.snapshot.files[0]!.hash, content, resultHash: engineeringHash(content) }] };
      }
      return output;
    } }, validation: { kind: "fixture", async validate(s, w) { return f.evidence(s, w, false); } } });
  assert.equal(result.termination, "no_progress"); assert.equal(result.diff, ""); assert.deepEqual(result.filesModified, []);
});
test("a host callback returning an undecided approval ID cannot claim authorization", async t => {
  const f = await setup(t), result = await runEngineeringWorkflow({ ...f.options, requestApproval: async r => r.approvalId });
  assert.equal(result.termination, "failed"); assert.ok(!result.events.includes("Authorized")); assert.equal(result.patches[0]!.status, "proposed");
});

test("L2 cancellation before patch effects persists terminal checkpoint independently", async t => {
  const f = await setup(t), controller = new AbortController();
  const result = await runEngineeringWorkflow({ ...f.options, signal: controller.signal, agent: { ...f.options.agent, async execute() { controller.abort(); return { summary: "fixture", usage: { tokens: 0, estimatedCostUsd: 0 } }; } } });
  assert.equal(result.termination, "cancelled"); assert.equal(result.state, "Cancelled"); assert.equal(result.patches.length, 0);
  assert.equal(result.usageComplete, false);
});
