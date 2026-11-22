import assert from "node:assert/strict";
import test from "node:test";
import { NodeProcessRunner, ProcessExecutionError } from "../process-runner.js";
const runner = new NodeProcessRunner();
const run = (code: string, timeout = 1000, signal?: AbortSignal) => runner.run(process.execPath, ["-e", code], timeout, { signal });
const kind = (name: string) => (error: unknown) => error instanceof ProcessExecutionError && error.kind === name && !error.message.includes("secret");

test("process runner preserves nonzero exit without exposing runtime errors", async () => {
  const result = await run('process.stdout.write("fixture"); process.exitCode=7');
  assert.equal(result.exitCode, 7); assert.equal(result.stdout, "fixture");
});
test("process runner sanitizes spawn failures", async () => {
  await assert.rejects(runner.run("/nonexistent/secret-program", [], 1000), kind("start_failed"));
  await assert.rejects(runner.run("node", [], 1000), kind("start_failed"));
});
test("pre-cancelled process cannot start", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(run('throw Error("secret")', 1000, controller.signal), kind("cancelled"));
});
test("process runner bounds combined stdout and stderr", async () => {
  await assert.rejects(run('process.stdout.write("x".repeat(3000)); process.stderr.write("x".repeat(3000))'), kind("output_limit"));
});
test("timeout terminates a real fixed fixture process", async () => {
  await assert.rejects(run('setInterval(()=>{},1000)', 50), kind("timeout"));
});
test("abort terminates a real fixture process", async () => {
  const controller = new AbortController();
  const active = run('setInterval(()=>{},1000)', 1000, controller.signal);
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(active, kind("cancelled"));
});
test("invalid deadlines cannot create a process", async () => {
  for (const timeout of [0, -1, 1.5, 10001, Infinity]) await assert.rejects(run("", timeout), kind("start_failed"));
});
