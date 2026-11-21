import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentExecutionContext,
  TaskDefinition,
} from "@ai-harness/contracts";

import { FixtureProvider } from "@ai-harness/providers";
import { PromptAgent } from "./index.js";

const task: TaskDefinition = {
  id: "task-001",
  title: "Analyze requirements",
  description: "Define a greeting module",
  assignedRole: "requirements-analyst",
  dependsOn: [],
  risk: "low",
  acceptanceCriteria: ["Requirements are documented"],
};

const context: AgentExecutionContext = {
  executionId: "execution-001",
  projectRoot: "/tmp/demo",
  model: new FixtureProvider(),
  grantedPermissions: ["files:read"],
};

test("prompt agent executes a task through a model provider", async () => {
  const agent = new PromptAgent({
    role: "requirements-analyst",
    systemPrompt: "Analyze software requirements.",
  });

  const result = await agent.execute(task, context);

  assert.equal(result.success, true);
  assert.match(result.summary, /Analyze requirements/);
  assert.deepEqual(result.artifacts, []);
});

test("prompt agent rejects tasks assigned to another role", async () => {
  const agent = new PromptAgent({
    role: "software-architect",
    systemPrompt: "Design software architecture.",
  });

  const result = await agent.execute(task, context);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /requirements-analyst/);
});
