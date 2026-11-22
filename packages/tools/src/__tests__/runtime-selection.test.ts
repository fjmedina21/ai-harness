import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { ContainerExecutor, type ContainerExecutionOptions } from "../container-executor.js";
import { executeFixedContainer, ContainerExecutionError } from "../container-runtime.js";
import type { ExecutionRuntimeOptions } from "../runtime-backend.js";
import { loadIsolationProfile } from "../isolation-profile.js";
import { ContainerFixture, OPTIONS } from "./container-fixture.js";

const docker = {
  dockerExecutable: "/usr/local/bin/docker", dockerContext: "former-context",
  image: OPTIONS.image, securityProfile: OPTIONS.securityProfile,
};
const rejected = [
  { name: "explicit Docker", value: { ...docker, backend: "docker" } },
  { name: "implicit legacy Docker", value: docker },
  { name: "mixed Podman and Docker", value: { ...OPTIONS, dockerExecutable: docker.dockerExecutable, dockerContext: docker.dockerContext } },
  { name: "unknown backend", value: { ...OPTIONS, backend: "unsupported" } },
];
for (const scenario of rejected) {
  test("removed runtime rejects " + scenario.name + " before any process call", async () => {
    const runner = new ContainerFixture();
    const raw = scenario.value as unknown as ExecutionRuntimeOptions;
    assert.throws(() => new ContainerExecutor(raw, runner), /Unsupported container/);
    await assert.rejects(executeFixedContainer(raw, runner, "node.version"),
      (error: unknown) => error instanceof ContainerExecutionError && error.kind === "preflight_failed" && error.cleanup === "not_needed");
    assert.equal(runner.calls.length, 0);
  });
}
test("private profile loader rejects former Docker profiles and requires explicit Podman", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "harness-runtime-selection-"));
  const filename = path.join(root, "profile.json");
  try {
    for (const scenario of rejected) {
      await writeFile(filename, JSON.stringify(scenario.value), { mode: 0o600 });
      await assert.rejects(loadIsolationProfile(filename), /Invalid Podman/);
    }
    const { backend: _backend, ...implicitPodman } = OPTIONS;
    await writeFile(filename, JSON.stringify(implicitPodman), { mode: 0o600 });
    await assert.rejects(loadIsolationProfile(filename), /Invalid Podman/);
    const supported: ContainerExecutionOptions = OPTIONS;
    await writeFile(filename, JSON.stringify(supported), { mode: 0o600 });
    assert.deepEqual(await loadIsolationProfile(filename), OPTIONS);
  } finally { await rm(root, { recursive: true, force: true }); }
});
