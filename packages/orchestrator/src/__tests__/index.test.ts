import assert from "node:assert/strict";
import test from "node:test";

import type {
  Agent,
  AgentRole,
  ModelProviderAdapter,
  TaskDefinition,
} from "@ai-harness/contracts";

import { Orchestrator } from "../index.js";

const model: ModelProviderAdapter = {
  id: "fixture",
  async complete() {
    return {
      text: "Simulated response",
      model: "fixture",
    };
  },
};

function task(
  id: string,
  role: AgentRole,
  dependsOn: string[] = [],
): TaskDefinition {
  return {
    id,
    title: id,
    description: `Execute ${id}`,
    assignedRole: role,
    dependsOn,
    risk: "low",
    acceptanceCriteria: ["Task completes"],
  };
}

function agent(role: AgentRole, onExecute: () => void): Agent {
  return {
    role,
    async execute() {
      onExecute();

      return {
        success: true,
        summary: `${role} completed`,
        artifacts: [`${role}.md`],
      };
    },
  };
}

test("orchestrator executes tasks in dependency order", async () => {
  const orchestrator = new Orchestrator();
  const order: string[] = [];

  orchestrator.register(
    agent("requirements-analyst", () => order.push("requirements")),
  );

  orchestrator.register(
    agent("software-architect", () => order.push("architecture")),
  );

  orchestrator.register(
    agent("backend-developer", () => order.push("implementation")),
  );

  const { execution, result } = await orchestrator.run({
    request: "Create a greeting module",
    projectRoot: "/tmp/demo",
    model,
    tasks: [
      task("implementation", "backend-developer", ["architecture"]),
      task("requirements", "requirements-analyst"),
      task("architecture", "software-architect", ["requirements"]),
    ],
  });

  assert.deepEqual(order, ["requirements", "architecture", "implementation"]);

  assert.equal(execution.state, "completed");
  assert.equal(result.completedTasks, 3);
  assert.equal(result.failedTasks, 0);
  assert.equal(result.artifacts.length, 3);
});

test("orchestrator detects circular dependencies", async () => {
  const orchestrator = new Orchestrator();

  await assert.rejects(
    orchestrator.run({
      request: "Invalid workflow",
      projectRoot: "/tmp/demo",
      model,
      tasks: [task("a", "planner", ["b"]), task("b", "planner", ["a"])],
    }),
    /Circular dependency/,
  );
});

test("orchestrator stops when an agent fails", async () => {
  const orchestrator = new Orchestrator();
  let downstreamExecuted = false;

  orchestrator.register({
    role: "backend-developer",
    async execute() {
      return {
        success: false,
        summary: "Implementation failed",
        error: "Compilation error",
        artifacts: [],
      };
    },
  });

  orchestrator.register(
    agent("validator", () => {
      downstreamExecuted = true;
    }),
  );

  const { execution, result } = await orchestrator.run({
    request: "Build feature",
    projectRoot: "/tmp/demo",
    model,
    tasks: [
      task("implementation", "backend-developer"),
      task("validation", "validator", ["implementation"]),
    ],
  });

  assert.equal(execution.state, "failed");
  assert.equal(result.failedTasks, 1);
  assert.equal(downstreamExecuted, false);
  assert.ok(execution.events.some((event) => event.type === "task.failed"));
});

test("orchestrator rejects duplicate task IDs", async () => {
  const orchestrator = new Orchestrator();

  await assert.rejects(
    orchestrator.run({
      request: "Invalid workflow",
      projectRoot: "/tmp/demo",
      model,
      tasks: [task("duplicate", "planner"), task("duplicate", "planner")],
    }),
    /duplicate task ID/,
  );
});

test("orchestrator forwards dependency outputs", async () => {
  const orchestrator = new Orchestrator();

  let receivedDescription = "";

  orchestrator.register({
    role: "requirements-analyst",
    async execute() {
      return {
        success: true,
        summary: "Requirement: return a greeting",
        artifacts: [],
      };
    },
  });

  orchestrator.register({
    role: "software-architect",
    async execute(task) {
      receivedDescription = task.description;

      return {
        success: true,
        summary: "Architecture proposal created",
        artifacts: [],
      };
    },
  });

  const { execution } = await orchestrator.run({
    request: "Create greeting",
    projectRoot: "/tmp/demo",
    model,
    tasks: [
      task("requirements", "requirements-analyst"),
      task("architecture", "software-architect", ["requirements"]),
    ],
  });

  assert.equal(execution.state, "completed");
  assert.match(receivedDescription, /Requirement: return a greeting/);
});

test("orchestrator persists execution checkpoints", async () => {
  const orchestrator = new Orchestrator();

  const snapshots: string[] = [];
  const states: string[] = [];

  orchestrator.register({
    role: "requirements-analyst",
    async execute() {
      return {
        success: true,
        summary: "Requirements generated",
        artifacts: [],
      };
    },
  });

  const { execution } = await orchestrator.run({
    request: "Create a greeting module",
    projectRoot: "/tmp/demo",
    model,
    tasks: [task("requirements", "requirements-analyst")],
    checkpointStore: {
      async save(value) {
        snapshots.push(JSON.stringify(value));
        states.push(value.state);
      },
      async get() {
        return null;
      },
    },
  });

  assert.equal(execution.state, "completed");

  assert.deepEqual(states, ["pending", "running", "running", "completed"]);

  const finalSnapshot = JSON.parse(snapshots.at(-1)!) as typeof execution;

  assert.equal(finalSnapshot.state, "completed");
  assert.equal(finalSnapshot.tasks[0]?.state, "completed");

  assert.ok(
    finalSnapshot.events.some((event) => event.type === "task.completed"),
  );
});
