import assert from "node:assert/strict";
import test from "node:test";
import { ContainerExecutor, ContainerExecutionError, type ContainerExecutionResult } from "../container-executor.js";
import { ContainerFixture, OPTIONS } from "./container-fixture.js";

test("builds a restricted Docker invocation", async () => {
  const legacy: ContainerExecutionResult = { command: "node.version", exitCode: 0, stdout: "v24", stderr: "" };
  assert.equal(legacy.cleanup, undefined); // additive public result contract
  const runner = new ContainerFixture();
  const result = await new ContainerExecutor(OPTIONS, runner).execute("node.version");
  assert.equal(result.exitCode, 0); assert.match(result.stdout, /^v24/); assert.equal(result.cleanup, "confirmed");
  const args = runner.calls.find((call) => call.args.includes("create"))!.args;
  for (const flag of ["--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--pids-limit", "--memory", "--memory-swap", "--cpus", "--user", "--pull", "never", "--no-healthcheck"]) assert.ok(args.includes(flag));
  for (const flag of ["--privileged", "--volume", "--mount", "host"]) assert.ok(!args.includes(flag));
});
test("rejects unpinned container images", () => {
  assert.throws(() => new ContainerExecutor({ ...OPTIONS, image: "node:latest" }), /SHA-256 digest/);
});
test("rejects unsupported commands", async () => {
  const runner = new ContainerFixture();
  await assert.rejects(new ContainerExecutor(OPTIONS, runner).execute("shell.execute" as "node.version"), /Unsupported container command/);
  assert.equal(runner.calls.length, 0);
});
test("rejects unsafe Docker configuration", () => {
  assert.throws(() => new ContainerExecutor({ ...OPTIONS, dockerExecutable: "docker" }), /must be absolute/);
  assert.throws(() => new ContainerExecutor({ ...OPTIONS, dockerContext: "default --host attacker" }), /Invalid Docker context/);
});
test("performs cleanup after a Docker failure", async () => {
  const runner = new ContainerFixture(); runner.failStart = true;
  await assert.rejects(new ContainerExecutor(OPTIONS, runner).execute("node.version"), (error: unknown) =>
    error instanceof ContainerExecutionError && error.kind === "runtime_failed" && error.cleanup === "confirmed" && !error.message.includes("secret"));
  assert.equal(runner.calls.filter((c) => c.args.includes("rm")).length, 1);
});
test("rejects oversized subprocess output", async () => {
  const runner = new ContainerFixture(); runner.result.stdout = "x".repeat(5000);
  await assert.rejects(new ContainerExecutor(OPTIONS, runner).execute("node.version"), /output_limit/);
  assert.equal(runner.removed, true);
});
