import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_ROLES, isTerminalExecutionState } from "./index.js";

import type { Agent, RuntimeExecution, TaskState } from "./index.js";

test("all 15 agent roles remain available", () => {
  assert.equal(AGENT_ROLES.length, 15);
  assert.ok(AGENT_ROLES.includes("orchestrator"));
  assert.ok(AGENT_ROLES.includes("validator"));
});

test("terminal execution states are detected", () => {
  assert.equal(isTerminalExecutionState("completed"), true);
  assert.equal(isTerminalExecutionState("failed"), true);
  assert.equal(isTerminalExecutionState("cancelled"), true);
  assert.equal(isTerminalExecutionState("running"), false);
  assert.equal(isTerminalExecutionState("awaiting_approval"), false);
});

test("a runtime execution can represent tasks", () => {
  const state: TaskState = "pending";

  const execution: RuntimeExecution = {
    id: "execution-001",
    request: "Create a greeting module",
    projectRoot: "/workspace/demo",
    state: "pending",
    tasks: [
      {
        definition: {
          id: "task-001",
          title: "Create greeting",
          description: "Create a greeting module",
          assignedRole: "backend-developer",
          dependsOn: [],
          risk: "low",
          acceptanceCriteria: ["Module exists"],
        },
        state,
        attempts: 0,
        createdAt: new Date().toISOString(),
      },
    ],
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.equal(execution.tasks.length, 1);
  assert.equal(execution.tasks[0]?.state, "pending");
  assert.equal(execution.state, "pending");
});

test("agent contract accepts an executor", () => {
  const agent: Agent = {
    role: "backend-developer",
    async execute() {
      return {
        success: true,
        summary: "Greeting module created",
        artifacts: ["src/greeting.ts"],
      };
    },
  };

  assert.equal(agent.role, "backend-developer");
});
