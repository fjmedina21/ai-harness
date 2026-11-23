import assert from "node:assert/strict";
import test from "node:test";
import { runPhase9Evaluations } from "../index.js";
test("Phase 9 deterministic evaluations use real local filesystem/SQLite and bounded fixtures only", async () => {
  const report = await runPhase9Evaluations(); assert.equal(report.summary.total, 10); assert.equal(report.summary.failed, 0); assert.equal(report.summary.passed, 10);
  assert.equal(report.suiteId, "phase9"); assert.doesNotMatch(JSON.stringify(report), /fixture-before|fixture-after|approvalId|requester|diff/);
});
