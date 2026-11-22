import assert from "node:assert/strict";
import test from "node:test";

import {
  ContainerExecutor,
  type ProcessResult,
  type ProcessRunner,
} from "../container-executor.js";

const IMAGE = "node@sha256:" + "a".repeat(64);

const OPTIONS = {
  dockerExecutable: "/usr/local/bin/docker",
  dockerContext: "default",
  image: IMAGE,
};

class RecordingRunner implements ProcessRunner {
  readonly calls: Array<{
    executable: string;
    args: string[];
    timeoutMs: number;
  }> = [];

  constructor(
    private readonly result: ProcessResult = {
      exitCode: 0,
      stdout: "v24.18.0\n",
      stderr: "",
    },
    private readonly failRun = false,
  ) {}

  async run(
    executable: string,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<ProcessResult> {
    this.calls.push({
      executable,
      args: [...args],
      timeoutMs,
    });

    if (this.failRun && args.includes("run")) {
      throw new Error("Simulated Docker failure");
    }

    return this.result;
  }
}

test("builds a restricted Docker invocation", async () => {
  const runner = new RecordingRunner();
  const executor = new ContainerExecutor(OPTIONS, runner);

  const result = await executor.execute("node.version");

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^v24/);

  const args = runner.calls[0]!.args;

  for (const flag of [
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "--memory",
    "--memory-swap",
    "--cpus",
    "--user",
    "--pull",
    "never",
  ]) {
    assert.ok(args.includes(flag), `Missing Docker restriction: ${flag}`);
  }

  assert.ok(!args.includes("--privileged"));
  assert.ok(!args.includes("--volume"));
  assert.ok(!args.includes("--mount"));
  assert.ok(!args.includes("host"));
});

test("rejects unpinned container images", () => {
  assert.throws(
    () =>
      new ContainerExecutor({
        ...OPTIONS,
        image: "node:latest",
      }),
    /SHA-256 digest/,
  );
});

test("rejects unsupported commands", async () => {
  const runner = new RecordingRunner();
  const executor = new ContainerExecutor(OPTIONS, runner);

  await assert.rejects(
    executor.execute("shell.execute" as "node.version"),
    /Unsupported container command/,
  );

  assert.equal(runner.calls.length, 0);
});

test("rejects unsafe Docker configuration", () => {
  assert.throws(
    () =>
      new ContainerExecutor({
        ...OPTIONS,
        dockerExecutable: "docker",
      }),
    /must be absolute/,
  );

  assert.throws(
    () =>
      new ContainerExecutor({
        ...OPTIONS,
        dockerContext: "default --host attacker",
      }),
    /Invalid Docker context/,
  );
});

test("performs cleanup after a Docker failure", async () => {
  const runner = new RecordingRunner(
    {
      exitCode: 0,
      stdout: "",
      stderr: "",
    },
    true,
  );

  const executor = new ContainerExecutor(OPTIONS, runner);

  await assert.rejects(
    executor.execute("node.version"),
    /Simulated Docker failure/,
  );

  assert.equal(runner.calls.length, 2);
  assert.ok(runner.calls[1]!.args.includes("rm"));
  assert.ok(runner.calls[1]!.args.includes("--force"));
});

test("rejects oversized subprocess output", async () => {
  const runner = new RecordingRunner({
    exitCode: 0,
    stdout: "x".repeat(5000),
    stderr: "",
  });

  const executor = new ContainerExecutor(OPTIONS, runner);

  await assert.rejects(executor.execute("node.version"), /output limit/);

  assert.equal(runner.calls.length, 2);
});
