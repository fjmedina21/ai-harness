import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { RuntimeExecution } from "@ai-harness/contracts";

import { FileRuntimeCheckpointStore } from "../index.js";

function execution(): RuntimeExecution {
  const now = new Date().toISOString();

  return {
    id: "execution-001",
    request: "Create a greeting module",
    projectRoot: "/tmp/example",
    state: "running",
    tasks: [],
    events: [],
    createdAt: now,
    updatedAt: now,
  };
}

test("saves and retrieves a checkpoint", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-checkpoint-"));

  try {
    const store = new FileRuntimeCheckpointStore(root);
    const original = execution();

    await store.save(original);

    const restored = await store.get(original.id);

    assert.deepEqual(restored, original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns null for an unknown execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-checkpoint-"));

  try {
    const store = new FileRuntimeCheckpointStore(root);

    assert.equal(await store.get("unknown"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid execution IDs", async () => {
  const store = new FileRuntimeCheckpointStore("/tmp/demo");

  await assert.rejects(store.get("../outside"), /Invalid execution ID/);
});
