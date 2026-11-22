import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ContainerExecutor, ContainerExecutionError } from "../container-executor.js";
import { loadIsolationProfile } from "../isolation-profile.js";
import { PodmanFixture, PODMAN_OPTIONS } from "./podman-fixture.js";
const execute = (runner: PodmanFixture) => new ContainerExecutor(PODMAN_OPTIONS, runner).execute("node.version");
const noCreate = (runner: PodmanFixture) => assert.ok(runner.calls.every((c) => !c.args.includes("create")));

test("Podman native backend validates machine, pins socket and executes the same fixed restricted operation", async () => {
  const runner = new PodmanFixture(); const result = await execute(runner);
  assert.equal(result.cleanup, "confirmed"); assert.equal(result.preflight?.backend, "podman"); assert.match(result.stdout, /^v24/);
  const native = runner.calls.filter((c) => c.args[0] !== "machine" && c.args[0] !== "--version");
  assert.ok(native.every((c) => c.args.slice(0, 3).join(" ") === `--remote --url ${PODMAN_OPTIONS.securityProfile!.endpoint}`));
  assert.ok(runner.calls.find((c) => c.args.includes("info"))!.args.at(-1)!.includes(".Host.CgroupsVersion"));
  assert.ok(runner.calls.find((c) => c.args.includes("info"))!.args.at(-1)!.includes(".Host.Security.SECCOMPEnabled"));
  assert.ok(runner.calls.find((c) => c.args.includes("image") && c.args.includes("inspect"))!.args.at(-1)!.includes(".ID"));
  const args = runner.calls.find((c) => c.args.includes("create"))!.args;
  for (const value of ["--pull", "never", "--read-only", "--network", "none", "--cap-drop", "ALL", "--http-proxy=false", "--image-volume=ignore", "--init=false", "--no-healthcheck", "--read-only-tmpfs=false", "--systemd=false"]) assert.ok(args.includes(value));
  const removal = runner.calls.find((c) => c.args.includes("rm"))!.args;
  assert.deepEqual(removal.slice(-4), ["--force", "--time", "0", runner.id]);
  assert.ok(!args.includes("--privileged")); assert.ok(!args.includes("--mount")); assert.ok(!args.includes("--volume"));
});
for (const [field, value] of Object.entries({ name: "other", created: "2020-01-01T00:00:00Z", rootful: true, state: "stopped", socket: "/different.sock" })) {
  test(`Podman rejects unsafe or substituted machine ${field}`, async () => {
    const runner = new PodmanFixture(); runner.machine[field] = value;
    await assert.rejects(execute(runner), /preflight_failed/); noCreate(runner);
  });
}
for (const field of ["version", "kernel", "os", "arch", "cgroup", "manager", "controllers", "rootless", "seccomp"]) {
  test(`Podman fails closed on missing native ${field}`, async () => {
    const runner = new PodmanFixture(); delete runner.podmanInfo[field];
    await assert.rejects(execute(runner), /preflight_failed/); noCreate(runner);
  });
}
test("Podman client/server mismatch and insufficient delegated controllers cannot execute", async () => {
  for (const scenario of ["version", "controller"]) {
    const runner = new PodmanFixture();
    if (scenario === "version") runner.clientVersion = "podman version 5.7.0";
    else runner.podmanInfo.controllers = ["memory"];
    await assert.rejects(execute(runner), /preflight_failed/); noCreate(runner);
  }
});
test("Podman rejects image drift, volumes and wrong platform", async () => {
  for (const [field, value] of Object.entries({ digests: ["other"], volumes: { "/host": {} }, arch: "amd64", id: "invalid" })) {
    const runner = new PodmanFixture(); runner.image[field] = value;
    await assert.rejects(execute(runner), /preflight_failed/); noCreate(runner);
  }
});
test("Podman CPU normalization cannot invent missing or accept conflicting evidence", async () => {
  for (const scenario of ["missing", "conflict", "unsafe"]) {
    const runner = new PodmanFixture();
    if (scenario === "missing") delete runner.host.CpuQuota;
    if (scenario === "conflict") runner.host.NanoCpus = 900000000;
    if (scenario === "unsafe") runner.host.CpuQuota = 100000;
    await assert.rejects(execute(runner)); assert.ok(runner.calls.every((c) => !c.args.includes("start"))); assert.equal(runner.removed, true);
  }
});
test("Podman cannot clean up foreign resources or hide failed cleanup", async () => {
  for (const scenario of ["owner", "cleanup"]) {
    const runner = new PodmanFixture(); if (scenario === "owner") runner.foreignOwner = true; else runner.failCleanup = true;
    await assert.rejects(execute(runner), (e: unknown) => e instanceof ContainerExecutionError && e.cleanup === "uncertain");
    assert.equal(runner.calls.filter((c) => c.args.includes("rm")).length, scenario === "owner" ? 0 : 1);
  }
});
test("Podman cancellation blocks start and retains independent cleanup", async () => {
  const runner = new PodmanFixture(); const controller = new AbortController(); runner.signalOnCreate = controller;
  await assert.rejects(new ContainerExecutor(PODMAN_OPTIONS, runner).execute("node.version", { signal: controller.signal }),
    (e: unknown) => e instanceof ContainerExecutionError && e.kind === "cancelled" && e.cleanup === "confirmed");
  assert.ok(runner.calls.every((c) => !c.args.includes("start")));
});
test("Podman private profile selection is explicit and cannot include Docker fields or arbitrary flags", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "harness-podman-profile-")); const file = path.join(root, "profile.json");
  try {
    await writeFile(file, JSON.stringify(PODMAN_OPTIONS), { mode: 0o600 }); assert.deepEqual(await loadIsolationProfile(file), PODMAN_OPTIONS);
    for (const extra of [{ dockerContext: "default" }, { flags: ["--privileged"] }, { backend: "unknown" }]) {
      await writeFile(file, JSON.stringify({ ...PODMAN_OPTIONS, ...extra })); await assert.rejects(loadIsolationProfile(file));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("Podman absent profile and unsupported model commands cannot query any engine", async () => {
  const runner = new PodmanFixture();
  await assert.rejects(new ContainerExecutor({ ...PODMAN_OPTIONS, securityProfile: undefined }, runner).execute("node.version"));
  await assert.rejects(new ContainerExecutor(PODMAN_OPTIONS, runner).execute("shell.execute" as "node.version"));
  assert.equal(runner.calls.length, 0);
});

test("Podman guest mount verification rejects host sharing and unavailable evidence", async () => {
  for (const mode of ["shared", "unavailable"]) {
    const runner = new PodmanFixture();
    if (mode === "shared") runner.guestMounts = [{ target: "/Users", fstype: "virtiofs" }];
    else runner.guestExitCode = 127;
    await assert.rejects(execute(runner), /preflight_failed/); noCreate(runner);
  }
});
test("Podman native cgroup and device policies must be explicit", async () => {
  for (const [key, value] of Object.entries({ CgroupMode: "host", Cgroups: "disabled", Devices: [{ PathOnHost: "/dev/dri" }], RestartPolicy: { Name: "always", MaximumRetryCount: 0 } })) {
    const runner = new PodmanFixture(); runner.host[key] = value;
    await assert.rejects(execute(runner)); assert.ok(runner.calls.every((c) => !c.args.includes("start")));
  }
});

test("Podman requires empty native effective and bounding capabilities", async () => {
  for (const field of ["effectiveCaps", "boundingCaps"] as const) {
    const runner = new PodmanFixture(); runner[field] = ["CAP_SYS_ADMIN"];
    await assert.rejects(execute(runner)); assert.ok(runner.calls.every((c) => !c.args.includes("start")));
  }
});


test("Podman accepts explicit native nil capabilities but rejects missing evidence", async () => {
  const native = new PodmanFixture();
  Object.assign(native, { effectiveCaps: null, boundingCaps: null });
  assert.equal((await execute(native)).cleanup, "confirmed");
  for (const field of ["effectiveCaps", "boundingCaps"] as const) {
    const missing = new PodmanFixture();
    Object.assign(missing, { [field]: undefined });
    await assert.rejects(execute(missing));
    assert.ok(missing.calls.every((c) => !c.args.includes("start")));
  }
});

test("Podman requires private empty tmpfs with every restrictive flag", async () => {
  for (const flags of ["rw,nosuid,nodev,noexec,size=16m,rprivate,tmpcopyup", "rw,nosuid,nodev,exec,size=16m,rprivate,notmpcopyup", "rw,nosuid,nodev,noexec,size=16m,rshared,notmpcopyup"]) {
    const runner = new PodmanFixture(); runner.host.Tmpfs = { "/tmp": flags };
    await assert.rejects(execute(runner));
    assert.ok(runner.calls.every((c) => !c.args.includes("start")));
    assert.equal(runner.removed, true);
  }
});
