import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EvaluationRunner, type EvaluationSuite } from "@ai-harness/evaluations";
import { InMemoryTelemetrySink, TelemetrySession } from "@ai-harness/observability";
import { main } from "../index.js";
async function fixture(t: { after(callback: () => Promise<unknown>): void }) {
  const directory = await mkdtemp(path.join(tmpdir(), "harness-cli-diagnostics-"));
  await chmod(directory, 0o700); t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}
const suite: EvaluationSuite = { id: "fixture", version: "1", configurationId: "fixture", scenarios: [{ id: "case", version: "1", category: "security",
  assertions: [{ id: "denied", fact: "denied", kind: "equals", expected: true }], async execute() { return { facts: { denied: true } }; } }] };
test("CLI eval run uses only the deterministic offline suite and emits a validated report", async () => {
  const lines: string[] = []; const result = await main(["eval", "run", "--suite", "deterministic"], process.cwd(), line => lines.push(line));
  assert.equal(result, 0); const report = JSON.parse(lines[0]!);
  assert.equal(report.suiteId, "deterministic"); assert.equal(report.summary.passed, report.summary.total);
  assert.equal(await main(["eval", "run", "--suite", "paid-model"], process.cwd(), () => {}), 1);
});
test("CLI validates a private report and compares matching fixtures", async t => {
  const directory = await fixture(t), file = path.join(directory, "report.json");
  const report = await new EvaluationRunner().run(suite); await writeFile(file, JSON.stringify(report), { mode: 0o600 });
  const lines: string[] = [];
  assert.equal(await main(["eval", "report", "--input", file, "--baseline", file], directory, line => lines.push(line)), 0);
  assert.equal(JSON.parse(lines[0]!).comparison.regressions.length, 0);
});
test("CLI rejects unsafe, linked, oversized and corrupted report files without echoing content", async t => {
  const directory = await fixture(t), file = path.join(directory, "report.json"), link = path.join(directory, "linked.json");
  const report = await new EvaluationRunner().run(suite); await writeFile(file, JSON.stringify(report), { mode: 0o600 });
  await chmod(file, 0o644); assert.equal(await main(["eval", "report", "--input", file], directory, () => {}), 1);
  await chmod(file, 0o600); await symlink(file, link);
  assert.equal(await main(["eval", "report", "--input", link], directory, () => {}), 1);
  await writeFile(file, "x".repeat(1_048_577)); assert.equal(await main(["eval", "report", "--input", file], directory, () => {}), 1);
  await writeFile(file, '{"private-prompt":"secret"}'); assert.equal(await main(["eval", "report", "--input", file], directory, () => {}), 1);
});
test("CLI trace and metrics inspect only an explicitly supplied execution from private JSONL", async t => {
  const directory = await fixture(t), file = path.join(directory, "trace.jsonl");
  const sink = new InMemoryTelemetrySink(), session = new TelemetrySession({ sink });
  const root = session.trace("fixture-execution");
  const span = session.startSpan(root, "execution"); span.end({ status: "ok" }); await session.flush();
  await writeFile(file, sink.events().map(event => JSON.stringify(event)).join("\n") + "\n", { mode: 0o600 });
  const metrics: string[] = [], trace: string[] = [];
  assert.equal(await main(["metrics", "--input", file, "--id", "fixture-execution"], directory, line => metrics.push(line)), 0);
  assert.equal(JSON.parse(metrics[0]!).executionId, "fixture-execution");
  assert.equal(await main(["trace", "--input", file, "--id", "fixture-execution"], directory, line => trace.push(line)), 0);
  assert.equal(JSON.parse(trace[0]!).spans.length, 1);
  assert.equal(await main(["trace", "--input", file, "--id", "unknown"], directory, () => {}), 1);
  assert.equal((await readFile(file, "utf8")).includes("fixture-execution"), true);
});
test("CLI diagnostic arguments reject duplicates, extra options and missing values", async () => {
  for (const args of [["eval", "run"], ["eval", "run", "--suite", "deterministic", "--suite", "deterministic"],
    ["eval", "report", "--input"], ["metrics", "--input", "unused", "--id", "id", "--export", "https://example.test"]]) {
    assert.equal(await main(args, process.cwd(), () => {}), 1);
  }
});
