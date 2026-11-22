import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  initializeProject,
  inspectProject,
  loadProjectConfig,
} from "../index.js";

test("initialize, inspect, and refuse to overwrite", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "harness-test-"));
  try {
    const result = await initializeProject({ root, projectName: "sample" });
    assert.equal(result.created.length, 7);
    assert.equal((await loadProjectConfig(root)).project.name, "sample");
    assert.equal((await inspectProject(root)).agentCount, 15);
    await assert.rejects(initializeProject({ root }), /Refusing to overwrite/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("dry-run does not write anything", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "harness-dry-"));
  try {
    const result = await initializeProject({ root, dryRun: true });
    assert.equal(result.dryRun, true);
    await assert.rejects(readFile(path.join(root, ".ai", "config.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
