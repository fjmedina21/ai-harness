import assert from "node:assert/strict";
import test from "node:test";
import { ContainerExecutor, ContainerExecutionError } from "../container-executor.js";
import { ContainerFixture, OPTIONS } from "./container-fixture.js";
const execute = (runner: ContainerFixture) => new ContainerExecutor(OPTIONS, runner).execute("node.version");

test("missing dedicated profile cannot reach any Docker operation", async () => {
  const runner = new ContainerFixture();
  await assert.rejects(new ContainerExecutor({ ...OPTIONS, securityProfile: undefined }, runner).execute("node.version"), /preflight_failed/);
  assert.equal(runner.calls.length, 0);
});
for (const field of ["id", "os", "arch", "cgroup", "driver", "security", "memory", "swap", "cpu", "pids"]) {
  test(`preflight rejects missing or wrong ${field} capability without creating anything`, async () => {
    const runner = new ContainerFixture(); delete runner.info[field];
    await assert.rejects(execute(runner), /preflight_failed/);
    assert.ok(runner.calls.every((c) => !c.args.includes("create")));
  });
}
test("endpoint changes and remote endpoints cannot redirect Docker commands", async () => {
  const runner = new ContainerFixture(); runner.endpoint = "unix:///wrong.sock";
  await assert.rejects(execute(runner), /preflight_failed/);
  assert.equal(runner.calls.length, 1);
  await assert.rejects(new ContainerExecutor({ ...OPTIONS, securityProfile: { ...OPTIONS.securityProfile, endpoint: "tcp://attacker:2375" } }, runner).execute("node.version"), /preflight_failed/);
});
for (const field of ["id", "os", "arch", "digests", "volumes"]) {
  test(`preflight rejects unsafe image ${field}`, async () => {
    const runner = new ContainerFixture(); runner.image[field] = field === "volumes" ? { "/host": {} } : "invalid";
    await assert.rejects(execute(runner), /preflight_failed/);
    assert.ok(runner.calls.every((c) => !c.args.includes("create")));
  });
}
test("effective restrictions are checked before starting created resources", async () => {
  for (const [field, value] of Object.entries({ Privileged: true, NetworkMode: "host", ReadonlyRootfs: false,
    CapAdd: ["SYS_ADMIN"], SecurityOpt: ["no-new-privileges", "seccomp=unconfined"], Memory: 0, NanoCpus: 0,
    Binds: ["/:/host"], Devices: [{}], PidMode: "host", CgroupnsMode: "host", Tmpfs: {}, PublishAllPorts: true })) {
    const runner = new ContainerFixture(); runner.host[field] = value;
    await assert.rejects(execute(runner), /effective_configuration_mismatch/);
    assert.ok(runner.calls.every((c) => !c.args.includes("start")));
    assert.equal(runner.removed, true);
  }
});
test("foreign ownership cannot trigger removal even after an execution failure", async () => {
  const runner = new ContainerFixture(); runner.foreignOwner = true;
  await assert.rejects(execute(runner), (e: unknown) => e instanceof ContainerExecutionError && e.cleanup === "uncertain");
  assert.ok(runner.calls.every((c) => !c.args.includes("rm")));
});
test("cleanup failures and remaining resources cannot produce success", async () => {
  for (const mode of ["failCleanup", "remain"] as const) {
    const runner = new ContainerFixture(); runner[mode] = true;
    await assert.rejects(execute(runner), (e: unknown) => e instanceof ContainerExecutionError && e.cleanup === "uncertain");
    assert.equal(runner.calls.filter((c) => c.args.includes("rm")).length, 1);
  }
});
test("a timed-out create with no visible container remains uncertain", async () => {
  const runner = new ContainerFixture(); runner.createFailure = true; runner.lateAbsent = true;
  await assert.rejects(execute(runner), (e: unknown) => e instanceof ContainerExecutionError && e.kind === "timeout" && e.cleanup === "uncertain");
  assert.ok(runner.calls.every((c) => !c.args.includes("rm")));
});
test("a late owned creation is reconciled once and removed by immutable ID", async () => {
  const runner = new ContainerFixture(); runner.createFailure = true;
  await assert.rejects(execute(runner), (e: unknown) => e instanceof ContainerExecutionError && e.kind === "timeout" && e.cleanup === "confirmed");
  const removal = runner.calls.find((c) => c.args.includes("rm"))!;
  assert.equal(removal.args.at(-1), runner.id);
  assert.equal(runner.calls.filter((c) => c.args.includes("create")).length, 1);
});
test("cancellation prevents start while cleanup uses its independent deadlines", async () => {
  const runner = new ContainerFixture(); const controller = new AbortController(); runner.signalOnCreate = controller;
  await assert.rejects(new ContainerExecutor(OPTIONS, runner).execute("node.version", { signal: controller.signal }),
    (e: unknown) => e instanceof ContainerExecutionError && e.kind === "cancelled" && e.cleanup === "confirmed");
  assert.ok(runner.calls.every((c) => !c.args.includes("start")));
  assert.ok(runner.calls.filter((c) => c.args.includes("ls") || c.args.includes("rm")).every((c) => c.signal === undefined));
});
test("runtime always pins the validated endpoint and freezes host options", async () => {
  const runner = new ContainerFixture(); const options = structuredClone(OPTIONS);
  const executor = new ContainerExecutor(options, runner); options.securityProfile.endpoint = "unix:///changed.sock";
  const result = await executor.execute("node.version");
  assert.equal(result.cleanup, "confirmed");
  assert.ok(runner.calls.slice(1).every((c) => c.args[0] === "--host" && c.args[1] === OPTIONS.securityProfile.endpoint));
});
test("nonzero operation exit is not hidden by successful cleanup", async () => {
  const runner = new ContainerFixture(); runner.result.exitCode = 9;
  await assert.rejects(execute(runner), (e: unknown) => e instanceof ContainerExecutionError && e.kind === "nonzero_exit" && e.cleanup === "confirmed");
});
