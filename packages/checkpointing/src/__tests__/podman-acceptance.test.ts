import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FilePodmanAcceptanceStore } from "../podman-acceptance-store.js";
async function fixture(t: import("node:test").TestContext) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "harness-acceptance-"))); await chmod(root, 0o700); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "proposal-host.key"), Buffer.alloc(32, 7), { mode: 0o600 }); return { root, store: new FilePodmanAcceptanceStore(root) };
}
test("host acceptance is absent by default, create-only, domain-signed and reopens privately", async t => {
  const f = await fixture(t); assert.equal(await f.store.get(), null); const record = { schemaVersion: 1, scope: "synthetic-test-only" };
  await f.store.publish(record); assert.deepEqual(await new FilePodmanAcceptanceStore(f.root).get(), record); await assert.rejects(f.store.publish(record));
  const raw = await readFile(path.join(f.root, "podman-validation-acceptance.json"), "utf8"); assert.doesNotMatch(raw, /proposal-host.key|credential|token/);
});
for (const change of ["mac", "payload", "mode", "link", "key"] as const) test("signed acceptance fails closed on " + change, async t => {
  const f = await fixture(t); await f.store.publish({ scope: "fixture" }); const filename = path.join(f.root, "podman-validation-acceptance.json");
  if (change === "mode") await chmod(filename, 0o644);
  else if (change === "key") await writeFile(path.join(f.root, "proposal-host.key"), Buffer.alloc(32, 8));
  else if (change === "link") { const link = path.join(f.root, "linked.json"); await symlink(filename, link); const other = path.join(f.root, "other"); await mkdir(other, { mode: 0o700 }); await symlink(filename, path.join(other, "podman-validation-acceptance.json")); await writeFile(path.join(other, "proposal-host.key"), Buffer.alloc(32, 7), { mode: 0o600 }); await assert.rejects(new FilePodmanAcceptanceStore(other).get()); return; }
  else { const envelope = JSON.parse(await readFile(filename, "utf8")); envelope[change] = change === "mac" ? "0".repeat(64) : JSON.stringify({ scope: "forged" }); await writeFile(filename, JSON.stringify(envelope)); }
  await assert.rejects(f.store.get());
});
