import assert from "node:assert/strict";
import test from "node:test";
import { compareEvaluationReports, createDeterministicEvaluationSuite, EVALUATION_LIMITS, EvaluationRunner, parseEvaluationReport, runDeterministicEvaluations,
  type EvaluationScenario, type EvaluationSuite } from "../index.js";
function suite(scenarios?: readonly EvaluationScenario[]): EvaluationSuite {
  return { id: "unit", version: "1", configurationId: "fixture", scenarios: scenarios ?? [{
    id: "one", version: "1", category: "functional", assertions: [{ id: "done", kind: "equals", fact: "done", expected: true }],
    async execute() { return { facts: { done: true }, metrics: { modelCalls: 2 } }; },
  }] };
}
test("deterministic runner reports the same bounded facts without timestamps or IDs", async () => {
  const runner = new EvaluationRunner(); const first = await runner.run(suite()), second = await runner.run(suite());
  assert.deepEqual(first, second); assert.equal(first.summary.passRate, 1); assert.equal(first.timing, "disabled");
  assert.equal(first.results[0]?.durationMs, undefined); assert.deepEqual(parseEvaluationReport(first), first);
});
test("numeric assertions require explicit absolute tolerance and include its boundary", async () => {
  const input = suite(); input.scenarios[0]!.assertions = [
    { id: "within", kind: "number", fact: "measurement", expected: 10, absoluteTolerance: 0.5 },
    { id: "outside", kind: "number", fact: "measurement", expected: 10, absoluteTolerance: 0.49 },
  ];
  input.scenarios[0]!.execute = async () => ({ facts: { measurement: 10.5 } });
  const report = await new EvaluationRunner().run(input);
  assert.deepEqual(report.results[0]?.assertions.map(item => item.passed), [true, false]);
  assert.equal(report.results[0]?.failureKind, "assertion");
});
test("missing facts fail assertions rather than becoming false or zero", async () => {
  const input = suite(); input.scenarios[0]!.execute = async () => ({ facts: {} });
  const report = await new EvaluationRunner().run(input);
  assert.equal(report.results[0]?.status, "failed"); assert.equal(report.results[0]?.assertions[0]?.actual, undefined);
});
test("execution failures sanitize secret-bearing errors", async () => {
  const input = suite(); input.scenarios[0]!.execute = async () => { throw new Error("API_KEY=private-file-data"); };
  const report = await new EvaluationRunner().run(input);
  assert.equal(report.results[0]?.failureKind, "execution"); assert.doesNotMatch(JSON.stringify(report), /API_KEY|private-file/);
});
test("invalid or oversized observations become execution failures and payloads are absent", async () => {
  for (const facts of [{ done: { secret: "private" } }, { done: "secret\nnewline" }, { done: "x".repeat(129) }, Object.fromEntries(Array.from({ length: 129 }, (_, index) => ["key" + index, true]))]) {
    const input = suite(); input.scenarios[0]!.execute = async () => ({ facts } as never);
    const report = await new EvaluationRunner().run(input);
    assert.equal(report.results[0]?.failureKind, "execution"); assert.equal(report.results[0]?.assertions.length, 0);
  }
});
test("duplicate scenarios and assertions reject before executing host code", async () => {
  const runner = new EvaluationRunner(); let calls = 0; const input = suite();
  input.scenarios[0]!.execute = async () => { calls++; return { facts: {} }; };
  await assert.rejects(runner.run({ ...input, scenarios: [input.scenarios[0]!, input.scenarios[0]!] }), /scenario/);
  input.scenarios[0]!.assertions = [input.scenarios[0]!.assertions[0]!, input.scenarios[0]!.assertions[0]!];
  await assert.rejects(runner.run(input), /Duplicate/); assert.equal(calls, 0);
});
test("scenario and assertion limits are checked before execution", async () => {
  const runner = new EvaluationRunner(); const input = suite();
  await assert.rejects(runner.run({ ...input, scenarios: Array.from({ length: EVALUATION_LIMITS.scenarios + 1 }, (_, i) => ({ ...input.scenarios[0]!, id: "id-" + i })) }), /suite/);
  input.scenarios[0]!.assertions = Array.from({ length: EVALUATION_LIMITS.assertions + 1 }, (_, i) => ({ id: "assert-" + i, fact: "done", kind: "equals", expected: true }));
  await assert.rejects(runner.run(input), /scenario/);
});
test("cancellation before run never invokes fixtures", async () => {
  const input = suite(); let calls = 0; input.scenarios[0]!.execute = async () => { calls++; return { facts: {} }; };
  const controller = new AbortController(); controller.abort();
  const report = await new EvaluationRunner().run(input, { signal: controller.signal });
  assert.equal(calls, 0); assert.equal(report.results[0]?.failureKind, "cancelled"); assert.equal(report.summary.cancelled, 1);
});
test("cancellation during a fixture aborts its signal and returns a classified result", async () => {
  const controller = new AbortController(); let observedSignal: AbortSignal | undefined;
  const input = suite(); input.scenarios[0]!.execute = async ({ signal }) => { observedSignal = signal; controller.abort(); return new Promise(() => {}); };
  const report = await new EvaluationRunner().run(input, { signal: controller.signal });
  assert.equal(observedSignal?.aborted, true); assert.equal(report.results[0]?.status, "cancelled");
});
test("real controlled deadline bounds an uncooperative async fixture", async () => {
  const input = suite(); let observedSignal: AbortSignal | undefined;
  input.scenarios[0]!.execute = async ({ signal }) => { observedSignal = signal; return new Promise(() => {}); };
  const report = await new EvaluationRunner().run(input, { timeoutMs: 5 });
  assert.equal(observedSignal?.aborted, true); assert.equal(report.results[0]?.failureKind, "timeout");
});
test("timing is opt-in and uses a validated monotonic host clock", async () => {
  let ticks = 0; const report = await new EvaluationRunner().run(suite(), { measureDuration: true, now: () => ticks++ * 2 });
  assert.equal(report.results[0]?.durationMs, 2); assert.equal(report.timing, "measured");
  await assert.rejects(new EvaluationRunner().run(suite(), { measureDuration: true, now: () => NaN }), /clock/);
});
test("external reports reject unknown fields, forged summary, duplicate IDs and inconsistent outcomes", async () => {
  const report = await new EvaluationRunner().run(suite());
  assert.throws(() => parseEvaluationReport({ ...report, rawPrompt: "private" }));
  assert.throws(() => parseEvaluationReport({ ...report, summary: { ...report.summary, passed: 0 } }));
  assert.throws(() => parseEvaluationReport({ ...report, results: [report.results[0], report.results[0]] }));
  assert.throws(() => parseEvaluationReport({ ...report, results: [{ ...report.results[0], failureKind: "timeout" }] }));
});
test("comparison detects result regressions, missing scenarios and unavailable metrics", async () => {
  const baseline = await new EvaluationRunner().run(suite());
  const input = suite(); input.scenarios[0]!.execute = async () => ({ facts: { done: false } });
  const candidate = await new EvaluationRunner().run(input);
  const comparison = compareEvaluationReports(baseline, candidate, [{ metric: "modelCalls", direction: "lower", absolute: 0, relative: 0 }]);
  assert.deepEqual(comparison.regressions.map(item => item.kind), ["result", "metric_unavailable"]);
  const extra = suite([{ ...suite().scenarios[0]!, id: "other" }]);
  const missing = compareEvaluationReports(baseline, await new EvaluationRunner().run(extra));
  assert.equal(missing.comparable, false); assert.equal(missing.regressions[0]?.kind, "scenario_missing");
});
test("metric comparison applies explicit absolute or relative tolerance without weakening assertions", async () => {
  const baseline = await new EvaluationRunner().run(suite());
  const input = suite(); input.scenarios[0]!.execute = async () => ({ facts: { done: true }, metrics: { modelCalls: 3 } });
  const candidate = await new EvaluationRunner().run(input);
  assert.equal(compareEvaluationReports(baseline, candidate, [{ metric: "modelCalls", direction: "lower", absolute: 0, relative: 0.49 }]).regressions.length, 1);
  assert.equal(compareEvaluationReports(baseline, candidate, [{ metric: "modelCalls", direction: "lower", absolute: 1, relative: 0 }]).regressions.length, 0);
  assert.equal(compareEvaluationReports(baseline, candidate, [{ metric: "modelCalls", direction: "higher", absolute: 0, relative: 0 }]).regressions.length, 0);
});
test("changed scenario or suite versions are explicitly incomparable", async () => {
  const baseline = await new EvaluationRunner().run(suite()), input = suite(); input.scenarios[0]!.version = "2";
  const candidate = await new EvaluationRunner().run(input);
  assert.equal(compareEvaluationReports(baseline, candidate).comparable, false);
});
test("invalid tolerances, infinite metrics and negative values fail explicitly", async () => {
  const report = await new EvaluationRunner().run(suite());
  assert.throws(() => compareEvaluationReports(report, report, [{ metric: "modelCalls", direction: "lower", absolute: -1, relative: 0 }]));
  const input = suite(); input.scenarios[0]!.execute = async () => ({ facts: { done: true }, metrics: { calls: Infinity } });
  assert.equal((await new EvaluationRunner().run(input)).results[0]?.failureKind, "execution");
});
test("assertion definitions are snapshotted before asynchronous fixture execution", async () => {
  const input = suite();
  input.scenarios[0]!.execute = async () => { (input.scenarios[0]!.assertions[0]! as { expected: boolean }).expected = false; return { facts: { done: true } }; };
  const report = await new EvaluationRunner().run(input);
  assert.equal(report.results[0]?.assertions[0]?.expected, true); assert.equal(report.summary.passed, 1);
});
test("offline acceptance suite exercises all categories and real SQLite, producing reproducible reports", async () => {
  const scenarios = createDeterministicEvaluationSuite().scenarios;
  assert.deepEqual(new Set(scenarios.map(item => item.category)), new Set(["functional", "security", "reliability", "efficiency"]));
  const first = await runDeterministicEvaluations(), second = await runDeterministicEvaluations();
  assert.equal(first.summary.total, 19); assert.equal(first.summary.passed, 19); assert.equal(first.summary.failed, 0);
  assert.deepEqual(first, second); assert.equal(compareEvaluationReports(first, second).regressions.length, 0);
});
