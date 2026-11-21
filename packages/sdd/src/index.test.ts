import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ModelProviderAdapter } from "@ai-harness/contracts";

import {
  createSddTasks,
  loadWorkflow,
  runSddWorkflow,
  SDD_STAGES,
} from "./index.js";

const fixture: ModelProviderAdapter = {
  id: "fixture",
  async complete(request) {
    return {
      model: "fixture",
      text: `Generated output:\n${request.prompt}`,
    };
  },
};

async function createProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-harness-sdd-"));

  const workflows = path.join(root, ".ai", "workflows");
  await mkdir(workflows, { recursive: true });

  await writeFile(
    path.join(workflows, "sdd-iterative.json"),
    JSON.stringify({
      id: "sdd-iterative",
      version: 1,
      steps: [...SDD_STAGES],
      approval: "risk-based",
      status: "declarative-only",
    }),
  );

  return root;
}

test("SDD creates five dependent tasks", () => {
  const tasks = createSddTasks("Create a greeting module");

  assert.equal(tasks.length, 5);
  assert.equal(tasks[0]?.assignedRole, "requirements-analyst");
  assert.deepEqual(tasks[1]?.dependsOn, ["requirements"]);
  assert.deepEqual(tasks[4]?.dependsOn, ["implementation"]);
});

test("SDD rejects empty requests", () => {
  assert.throws(() => createSddTasks("   "), /cannot be empty/);
});

test("SDD loads the declared workflow", async () => {
  const root = await createProject();

  try {
    const stages = await loadWorkflow(root);

    assert.deepEqual(stages, [...SDD_STAGES]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SDD executes five agents and passes context", async () => {
  const root = await createProject();

  try {
    const output = await runSddWorkflow({
      projectRoot: root,
      request: "Create a greeting module",
      model: fixture,
    });

    assert.equal(output.status, "completed");
    assert.equal(output.documents.length, 5);

    const specification = output.documents.find(
      (document) => document.stage === "specification",
    );

    assert.match(specification?.content ?? "", /Dependency: requirements/);

    const validation = output.documents.find(
      (document) => document.stage === "validation",
    );

    assert.match(validation?.content ?? "", /Dependency: implementation/);

    assert.equal(
      output.events.filter((event) => event.type === "task.completed").length,
      5,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
