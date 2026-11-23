import assert from "node:assert/strict";
import test from "node:test";
import { runEngineeringBenchmarks } from "../engineering-benchmark.js";
test("engineering benchmark separates simulated/provider/application time and exercises SQLite dispatch/checkpoints", async t => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Real network forbidden in benchmark"); };
  t.after(() => { globalThis.fetch = original; });
  const report = await runEngineeringBenchmarks(2, [
    { level: 1, files: 1, fileBytes: 128, simulatedLatencyMs: 1 },
    { level: 2, files: 4, fileBytes: 512, simulatedLatencyMs: 0 },
  ]);
  assert.equal(report.scope, "mocked_http_real_filesystem_sqlite"); assert.equal(report.results.length, 2);
  for (const r of report.results) {
    assert.equal(r.runs.length, 2); assert.ok(r.medianApplicationMs >= 0); assert.ok(r.medianProviderMs >= 0);
    assert.ok(r.phaseMedianMs["patch.validate"]! >= 0); assert.ok(r.phaseMedianMs["context.serialize"]! >= 0);
    assert.equal(r.medianConfiguredSimulatedMs, r.requests * r.simulatedLatencyMs);
  }
  assert.equal(report.results[0]!.requests, 4); assert.equal(report.results[1]!.requests, 5);
  assert.ok(report.results[1]!.phaseMedianMs.dispatcher! >= 0); assert.ok(report.results[1]!.phaseMedianMs["checkpoint.persist"]! >= 0);
  assert.doesNotMatch(JSON.stringify(report), /export const|fixture-not-real|sourceRoot|approvalId/);
});
test("benchmark rejects unbounded samples or context before creating a project", async () => {
  for (const n of [0, 0.5, Infinity, 11]) await assert.rejects(runEngineeringBenchmarks(n));
  await assert.rejects(runEngineeringBenchmarks(1, [{ level: 1, files: 9, fileBytes: 512, simulatedLatencyMs: 0 }]));
});
