import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ENGINEERING_TIME_LIMITS, type EngineeringTimingPolicy } from "@ai-harness/contracts";
import { EngineeringCheckpointStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { InMemoryTelemetrySink, TelemetrySession, buildExecutionMetrics } from "@ai-harness/observability";
import { inspectEngineeringRecovery } from "@ai-harness/tools";
import { createOpenAIEngineeringAgent, FixtureEngineeringAgent, resolveEngineeringTiming, runEngineeringWorkflow, type EngineeringAgentPort, type EngineeringOptions } from "../index.js";
async function fixture(t: TestContext) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "harness-stabilization-")));
  const source = path.join(root, "source"), workspace = path.join(root, "workspace"), state = path.join(root, "state");
  for (const dir of [source, workspace, state]) await mkdir(dir, { mode: 0o700 });
  await writeFile(path.join(source, "value.ts"), "export const value = 1;\n", { mode: 0o600 });
  let now = Date.now(); const journal = path.join(state, "ops.sqlite");
  const store = await openSqliteOperationJournal(journal, { now: () => now, approvalTtlMs: 1000 });
  t.after(async () => { try { store.close(); } catch {} await rm(root, { recursive: true, force: true }); });
  const agent = new FixtureEngineeringAgent("value.ts", "export const value = 2;\n");
  const options: EngineeringOptions = { projectRoot: source, request: "Synthetic value replacement", files: ["value.ts"], level: 1, agent,
    budget: { timeoutMs: 5000, maxIterations: 1, maxRequests: 8, maxTokens: 80000, maxEstimatedCostUsd: 0, maxFiles: 1, maxBytes: 8192 },
    policy: { version: "fixture", allowedPaths: ["value.ts"], allowedOperations: ["replace"], maxFiles: 1, maxBytes: 8192 },
    workspace: { directory: workspace, binding: { store, requester: { issuer: "fixture", subject: "requester" }, safetyByTool: {} }, ttlMs: 60000, createAuthorized: true },
    checkpoint: new EngineeringCheckpointStore(state) };
  return { options, source, workspace, state, store, journal, advance: () => { now += 1001; } };
}
for (const [field, max] of [["roleTimeoutMs", 300000], ["finalizationTimeoutMs", 5000]] as const) test(`${field} has finite minimum, maximum and strict rejection bounds`, () => {
  for (const n of [1, max]) assert.equal(resolveEngineeringTiming(900000, { [field]: n })[field], n);
  for (const n of [0, -1, 0.5, Infinity, NaN, max + 1]) assert.throws(() => resolveEngineeringTiming(900000, { [field]: n }));
});
test("global budget and absolute deadlines reject invalid values; future absolute cannot extend global", () => {
  const now = 1000000;
  for (const n of [1, 900000]) assert.equal(resolveEngineeringTiming(n, {}, now).deadlineAt, now + n);
  for (const n of [0, -1, 0.5, Infinity, NaN, 900001]) assert.throws(() => resolveEngineeringTiming(n));
  assert.equal(resolveEngineeringTiming(100, { deadlineAt: now + 500 }, now).deadlineAt, now + 100);
  assert.equal(resolveEngineeringTiming(100, { deadlineAt: now + 20 }, now).scope, "absolute");
  for (const n of [0, 0.5, Infinity, now + 900001]) assert.throws(() => resolveEngineeringTiming(100, { deadlineAt: n }, now));
});
test("role overrides are host-owned, closed and copied", () => {
  const raw: EngineeringTimingPolicy = { roleTimeouts: { "code-reviewer": 180000 } };
  const policy = resolveEngineeringTiming(360000, raw); raw.roleTimeouts!["code-reviewer"] = 1;
  assert.equal(policy.roleTimeouts["code-reviewer"], 180000);
  for (const raw of [{ roleTimeouts: { invented: 10 } }, { roleTimeouts: { planner: 300001 } }, { roleTimeouts: [] }, { approved: true }])
    assert.throws(() => resolveEngineeringTiming(100, raw as EngineeringTimingPolicy));
  assert.equal(ENGINEERING_TIME_LIMITS.requestDefaultMs, 30000);
});
test("expired absolute deadline stops before workspace or provider work", async t => {
  const f = await fixture(t); let calls = 0;
  const agent = { ...f.options.agent, execute: async () => { calls++; throw new Error("Must not execute"); } } as EngineeringAgentPort;
  const r = await runEngineeringWorkflow({ ...f.options, level: 2, agent, timing: { deadlineAt: Date.now() - 1 } });
  assert.equal(r.termination, "timeout"); assert.equal(r.timing.timeoutScope, "absolute"); assert.equal(calls, 0); assert.deepEqual(await readdir(f.workspace), []);
});
test("global deadline clips a longer role and an uncooperative provider", async t => {
  const f = await fixture(t);
  const r = await runEngineeringWorkflow({ ...f.options, budget: { ...f.options.budget, timeoutMs: 40 }, timing: { roleTimeoutMs: 1000 },
    agent: { ...f.options.agent, execute: () => new Promise(() => {}) } });
  assert.equal(r.termination, "timeout"); assert.equal(r.timing.timeoutScope, "workflow"); assert.ok(r.usage.requests <= 1); assert.equal(r.usageComplete, r.usage.requests === 0);
});
test("reviewer timeout preserves the validated proposal without claiming full workflow success", async t => {
  const f = await fixture(t); const base = f.options.agent;
  const r = await runEngineeringWorkflow({ ...f.options, timing: { roleTimeouts: { "code-reviewer": 10 } }, agent: { ...base,
    execute: input => input.role === "code-reviewer" ? new Promise(() => {}) : base.execute(input) } });
  assert.equal(r.termination, "timeout"); assert.equal(r.timing.timeoutScope, "role"); assert.equal(r.proposalValidation, "passed"); assert.equal(r.reviews.length, 0); assert.ok(r.usage.requests >= 3 && r.usage.requests <= 4);
  assert.equal(await readFile(path.join(f.source, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("HTTP deadline is independent of longer role/global limits and never retries", async t => {
  const f = await fixture(t); let calls = 0;
  const agent = createOpenAIEngineeringAgent({ model: "fixture-model", maxRequests: 6, maxOutputTokens: 512, maxContextBytes: 16384, maxContextTokens: 8192,
    paidCallConfirmed: true, allowUncertainCost: true, timeoutMs: 10, providerOptions: { apiKey: "fixture-not-real", fetcher: async () => { calls++; return new Promise(() => {}); } } });
  const r = await runEngineeringWorkflow({ ...f.options, agent, modelAdapterAuthorized: true, allowUncertainCost: true, timing: { roleTimeoutMs: 1000 } });
  assert.equal(r.termination, "timeout"); assert.equal(r.timing.timeoutScope, "request"); assert.equal(calls, 1); assert.equal(r.usageComplete, false);
});
test("cancellation wins over role timeout and late provider completion cannot mutate the returned snapshot", async t => {
  const f = await fixture(t), controller = new AbortController(); let release!: (v: Awaited<ReturnType<EngineeringAgentPort["execute"]>>) => void;
  const agent = { ...f.options.agent, execute: async () => { setImmediate(() => controller.abort()); return new Promise<Awaited<ReturnType<EngineeringAgentPort["execute"]>>>(resolve => { release = resolve; }); } };
  const r = await runEngineeringWorkflow({ ...f.options, agent, signal: controller.signal }); const before = JSON.stringify(r);
  assert.equal(r.termination, "cancelled"); release({ summary: "Late advisory", usage: { tokens: 0, estimatedCostUsd: 0 } });
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(JSON.stringify(r), before);
});
test("one bounded terminal persistence allowance makes a stalled L2 checkpoint Uncertain", async t => {
  const f = await fixture(t); const started = performance.now();
  const r = await runEngineeringWorkflow({ ...f.options, level: 2, timing: { roleTimeoutMs: 10, finalizationTimeoutMs: 20 },
    agent: { ...f.options.agent, execute: () => new Promise(() => {}) }, checkpoint: { save: cp => cp.state === "Proposed" ? Promise.resolve() : new Promise(() => {}) } });
  assert.equal(r.termination, "uncertain"); assert.equal(r.timing.timeoutScope, "persistence"); assert.equal(r.timing.finalizationAllowanceMs, 20); assert.ok(performance.now() - started < 2000);
});
test("L2 terminal cancellation persists independently of the aborted run signal", async t => {
  const f = await fixture(t), controller = new AbortController();
  const r = await runEngineeringWorkflow({ ...f.options, level: 2, signal: controller.signal,
    agent: { ...f.options.agent, execute: async () => { controller.abort(); throw new Error("Cancelled fixture"); } } });
  assert.equal(r.termination, "cancelled");
  const files = (await readdir(f.state)).filter(n => n.endsWith(".json"));
  const final = JSON.parse(await readFile(path.join(f.state, files.at(-1)!), "utf8")); assert.equal(final.state, "Cancelled");
});
test("pending L2 survives SQLite reopen but cannot approve/continue under a new session", async t => {
  const f = await fixture(t), r = await runEngineeringWorkflow({ ...f.options, level: 2 }); f.store.close();
  const reopened = await openSqliteOperationJournal(f.journal); t.after(() => reopened.close());
  const op = reopened.list(r.executionId).find(op => op.toolId === "patch.apply")!;
  assert.equal(op.state, "PendingApproval"); assert.throws(() => reopened.decide(op.approvalId!, { issuer: "fixture", subject: "human" }, true));
  assert.equal((await inspectEngineeringRecovery(r.workspace!, r.snapshotDigest, reopened)).action, "blocked");
  assert.equal(await readFile(path.join(r.workspace!.root, "value.ts"), "utf8"), "export const value = 1;\n");
});
test("expired approval and concurrent workspace edits cannot be treated as resumable authorization", async t => {
  const f = await fixture(t), r = await runEngineeringWorkflow({ ...f.options, level: 2 }); f.advance();
  assert.throws(() => f.store.decide(r.pendingApprovals[0]!, { issuer: "fixture", subject: "human" }, true));
  await writeFile(path.join(r.workspace!.root, "value.ts"), "concurrent fixture edit\n");
  assert.equal((await inspectEngineeringRecovery(r.workspace!, r.snapshotDigest, f.store)).action, "blocked");
});
test("performance telemetry covers every required role, phases, HTTP success and reported usage without content", async t => {
  const f = await fixture(t), sink = new InMemoryTelemetrySink(), telemetry = new TelemetrySession({ sink }); let call = 0;
  const agent = createOpenAIEngineeringAgent({ model: "fixture-model", maxRequests: 6, maxOutputTokens: 512, maxContextBytes: 16384, maxContextTokens: 8192, paidCallConfirmed: true, allowUncertainCost: true,
    providerOptions: { apiKey: "fixture-not-real", fetcher: async (_url, init) => {
      call++; const input = JSON.parse(JSON.parse(String(init?.body)).input);
      const output = input.role === "backend-developer" ? { summary: "Synthetic proposal", proposal: { baseRevision: input.snapshot.digest, changes: [{ path: "value.ts", operation: "replace", baseHash: input.snapshot.files[0].hash, content: "export const value = 2;\n", resultHash: null }] } } : { summary: "Synthetic advisory" };
      return Response.json({ status: "completed", output_text: JSON.stringify(output), usage: { input_tokens: 50 + call, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 } } });
    } } });
  const r = await runEngineeringWorkflow({ ...f.options, agent, modelAdapterAuthorized: true, allowUncertainCost: true, telemetry: telemetry.trace("host-diagnostic-only") }); await telemetry.flush();
  assert.equal(r.termination, "proposed"); const events = sink.events();
  const roles = events.filter(e => e.type === "span.end" && e.attributes.phase === "role");
  assert.deepEqual(roles.map(e => e.context.agentRole), ["requirements-analyst", "planner", "backend-developer", "code-reviewer"]);
  assert.deepEqual(roles.map(e => e.attributes.requestIndex), [1, 2, 3, 4]); assert.ok(roles.every(e => e.durationMs! >= 0));
  for (const phase of ["context.read", "context.serialize", "request.serialize", "transport.parse", "response.parse", "patch.validate", "report.prepare"]) assert.ok(events.some(e => e.attributes.phase === phase), phase);
  const requests = events.filter(e => e.type === "span.end" && e.name === "provider.request"); assert.equal(requests.length, 4); assert.ok(requests.every(e => e.usage?.reasoningTokens === 5));
  assert.ok(events.filter(e => e.type === "span.end" && e.name === "provider.http").every(e => e.attributes.providerHttpStatus === 200));
  assert.equal(buildExecutionMetrics(events, r.executionId).complete, true); assert.doesNotMatch(JSON.stringify(events), /export const|fixture-not-real|Synthetic advisory|sourceRoot/);
});

for (const scope of ["workflow", "role"] as const) test(`elapsed ${scope} deadline cannot be cleared by a synchronous callback before timer dispatch`, async t => {
  const f = await fixture(t); const base = f.options.agent;
  const r = await runEngineeringWorkflow({ ...f.options, budget: { ...f.options.budget, timeoutMs: scope === "workflow" ? 10 : 5000 }, timing: { roleTimeoutMs: scope === "role" ? 10 : 1000 },
    agent: { ...base, execute: async input => { const end = performance.now() + 20; while (performance.now() < end) { /* Trusted deterministic test callback only. */ } return base.execute(input); } } });
  assert.equal(r.termination, "timeout"); assert.equal(r.timing.timeoutScope, scope); assert.equal(r.proposals.length, 0); assert.ok(r.usage.requests <= 1);
});
