import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FIXED_CONTAINER_OPERATIONS } from "../container-operations.js";
import { loadIsolationProfile } from "../isolation-profile.js";
import { OPTIONS } from "./container-fixture.js";

test("fixed isolation probe source compiles without executing on the host", () => {
  for (const [id, args] of Object.entries(FIXED_CONTAINER_OPERATIONS)) {
    if (id !== "node.version") assert.doesNotThrow(() => new Script(args[1]!));
  }
});
async function profileTest(fn: (file: string, root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "harness-profile-")); const file = path.join(root, "profile.json");
  try { await writeFile(file, JSON.stringify(OPTIONS), { mode: 0o600 }); await fn(file, root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
test("private explicit host profile loads without discovering or querying Podman", async () => {
  await profileTest(async (file) => assert.deepEqual(await loadIsolationProfile(file), OPTIONS));
});
test("profile loader rejects absent, relative, world-readable and symlink paths", async () => {
  await assert.rejects(loadIsolationProfile(undefined)); await assert.rejects(loadIsolationProfile("profile.json"));
  await profileTest(async (file, root) => {
    await chmod(file, 0o644); await assert.rejects(loadIsolationProfile(file));
    await chmod(file, 0o600); const link = path.join(root, "link.json"); await symlink(file, link);
    await assert.rejects(loadIsolationProfile(link));
  });
});
test("profile cannot carry arbitrary flags, commands, credentials or oversized content", async () => {
  await profileTest(async (file) => {
    for (const value of [{ ...OPTIONS, command: "arbitrary" }, { ...OPTIONS, apiKey: "fixture-only" },
      { ...OPTIONS, securityProfile: { ...OPTIONS.securityProfile, dedicated: false } }, { huge: "x".repeat(9000) }]) {
      await writeFile(file, JSON.stringify(value)); await assert.rejects(loadIsolationProfile(file));
    }
  });
});
test("real-suite command fails blocked with no profile, never passing or silently skipping", async () => {
  const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../integration/isolation.js", import.meta.url).pathname], {
      env: { PATH: "/usr/bin:/bin" }, stdio: ["ignore", "ignore", "pipe"], timeout: 3000,
    });
    let output = "";
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", reject); child.on("close", (code) => resolve({ code, output }));
  });
  assert.equal(result.code, 2); assert.equal(JSON.parse(result.output).status, "blocked");
  assert.equal(JSON.parse(result.output).stage, "profile");
});

test("fixed probe allowlist and command arrays are immutable", () => {
  assert.equal(Object.isFrozen(FIXED_CONTAINER_OPERATIONS), true);
  for (const args of Object.values(FIXED_CONTAINER_OPERATIONS)) assert.equal(Object.isFrozen(args), true);
});
