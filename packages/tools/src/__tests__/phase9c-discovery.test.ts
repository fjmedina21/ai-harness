import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverProjects, type ProjectDiscoveryOptions } from "../project-discovery.js";
async function fixture(t: { after(fn: () => Promise<void>): void }) { const root = await realpath(await mkdtemp(path.join(tmpdir(), "harness-discovery-"))); t.after(() => rm(root, { recursive: true, force: true })); return root; }
const options = (root: string): ProjectDiscoveryOptions => ({ root, authorizedPaths: [""], maxDepth: 5, maxFiles: 256, maxFileBytes: 8192, maxTotalBytes: 32768, timeoutMs: 2000 });
test("Phase9C discovery finds static Node metadata without executing scripts", async t => {
  const root = await fixture(t); const manifest = JSON.stringify({ packageManager: "pnpm@12.21.0", engines: { node: ">=22" }, dependencies: { react: "1" }, scripts: { test: "touch forbidden" } });
  await writeFile(path.join(root, "package.json"), manifest);
  const result = await discoverProjects(options(root)); assert.equal(result.units.length, 1); assert.equal(result.inspectedFiles, 1); assert.equal(result.truncated, false);
  const signals = result.units[0]!.signals; assert.ok(signals.some(s => s.id === "node-react")); assert.ok(signals.some(s => s.version === "12.21.0"));
  await assert.rejects(readFile(path.join(root, "forbidden"))); assert.equal(await readFile(path.join(root, "package.json"), "utf8"), manifest);
});
test("Phase9C discovery finds language-independent units in a polyglot monorepo", async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: [apps/*]");
  for (const [dir, filename, text] of [["api", "app.csproj", "<Project><TargetFramework>net9.0</TargetFramework></Project>"], ["web", "package.json", "{}"], ["python", "pyproject.toml", "[tool.pytest]"], ["go", "go.mod", "module example\ngo 1.24"], ["rust", "Cargo.toml", "[package]"]]) { await mkdir(path.join(root, dir!)); await writeFile(path.join(root, dir!, filename!), text!); }
  const result = await discoverProjects(options(root)); assert.equal(result.units.length, 6);
  assert.ok(result.units.find(u => u.root === "api")!.signals.some(s => s.version === "net9.0"));
  assert.ok(result.units.find(u => u.root === "go")!.signals.some(s => s.version === "1.24"));
});
test("Phase9C discovery reports ambiguous manifests and unknown frameworks conservatively", async t => {
  const root = await fixture(t); await writeFile(path.join(root, "pom.xml"), "<project/>"); await writeFile(path.join(root, "build.gradle"), "// no execution");
  assert.equal((await discoverProjects(options(root))).units[0]!.ambiguous, true);
  await rm(path.join(root, "pom.xml")); await rm(path.join(root, "build.gradle")); await writeFile(path.join(root, "package.json"), '{"dependencies":{"unknown-framework":"1"}}');
  const result = await discoverProjects(options(root)); assert.ok(result.units[0]!.signals.every(s => s.framework === undefined));
});
test("Phase9C discovery supports trusted custom detectors without changing the engine", async t => {
  const root = await fixture(t); await writeFile(path.join(root, "synthetic.manifest"), "fixture");
  const result = await discoverProjects({ ...options(root), detectors: [{ id: "synthetic-toolchain", fileNames: ["synthetic.manifest"], language: "synthetic" }] });
  assert.equal(result.units[0]!.signals[0]!.language, "synthetic");
});
test("Phase9C discovery rejects symlinks and scoped traversal", async t => {
  const root = await fixture(t); await symlink("/etc/passwd", path.join(root, "package.json"));
  await assert.rejects(discoverProjects(options(root)), /unsafe_path/);
  await assert.rejects(discoverProjects({ ...options(root), authorizedPaths: ["../outside"] }), /invalid_scope/);
  await assert.rejects(discoverProjects({ ...options(root), root: "/" }), /invalid_scope/);
});
test("Phase9C discovery only reads authorized subtrees", async t => {
  const root = await fixture(t); await mkdir(path.join(root, "allowed")); await mkdir(path.join(root, "denied"));
  await writeFile(path.join(root, "allowed", "go.mod"), "module example"); await symlink("/etc/passwd", path.join(root, "denied", "package.json"));
  const result = await discoverProjects({ ...options(root), authorizedPaths: ["allowed"] }); assert.equal(result.units.length, 1); assert.equal(result.units[0]!.root, "allowed");
});
test("Phase9C discovery enforces depth, entry, total byte and per-file ceilings", async t => {
  const root = await fixture(t); await mkdir(path.join(root, "nested")); await writeFile(path.join(root, "nested", "package.json"), "{}");
  const shallow = await discoverProjects({ ...options(root), maxDepth: 0 }); assert.equal(shallow.truncated, true); assert.ok(shallow.limitsReached.includes("depth"));
  await writeFile(path.join(root, "package.json"), "{}"); const bounded = await discoverProjects({ ...options(root), maxFiles: 1 }); assert.equal(bounded.truncated, true);
  const byteLimit = await discoverProjects({ ...options(root), maxTotalBytes: 1 }); assert.ok(byteLimit.limitsReached.includes("bytes"));
  await assert.rejects(discoverProjects({ ...options(root), maxFileBytes: 1 }), /manifest_limit/);
});
test("Phase9C discovery rejects inaccessible manifests and cancellation", async t => {
  const root = await fixture(t); const filename = path.join(root, "package.json"); await writeFile(filename, "{}"); await chmod(filename, 0);
  if (process.getuid?.() !== 0) await assert.rejects(discoverProjects(options(root)), /unreadable/);
  await chmod(filename, 0o600); const abort = new AbortController(); abort.abort();
  await assert.rejects(discoverProjects({ ...options(root), signal: abort.signal }), /cancelled/);
});
