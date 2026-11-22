import assert from "node:assert/strict";
import test from "node:test";

import type {
  RuntimeExecution,
  RuntimeTask,
  TaskState,
} from "@ai-harness/contracts";

import {
  evaluateOperationReplay,
  inspectStoredRecovery,
  planExecutionRecovery,
} from "../recovery.js";

function task(
  id: string,
  state: TaskState,
  dependsOn: string[] = [],
): RuntimeTask {
  return {
    definition: {
      id,
      title: id,
      description: "Test task",
      assignedRole: "backend-developer",
      dependsOn,
      risk: "low",
      acceptanceCriteria: [],
    },
    state,
    attempts: state === "pending" ? 0 : 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function execution(
  tasks: RuntimeTask[],
  state: RuntimeExecution["state"] = "running",
): RuntimeExecution {
  return {
    id: "execution-001",
    request: "Test recovery",
    projectRoot: "/tmp/harness-recovery",
    state,
    tasks,
    events: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("completed tasks are never replayed", () => {
  const plan = planExecutionRecovery(
    execution([task("a", "completed")]),
    "/tmp/harness-recovery",
  );

  assert.equal(plan.decisions[0]?.action, "skip");
  assert.equal(plan.resumableAutomatically, false);
});

test("running tasks require reconciliation", () => {
  const plan = planExecutionRecovery(
    execution([task("a", "running")]),
    "/tmp/harness-recovery",
  );

  assert.equal(plan.decisions[0]?.action, "reconcile");
});

test("pending approvals require reconciliation", () => {
  const plan = planExecutionRecovery(
    execution([task("a", "awaiting_approval")]),
    "/tmp/harness-recovery",
  );

  assert.equal(plan.decisions[0]?.action, "reconcile");
});

test("pending tasks with incomplete dependencies are blocked", () => {
  const plan = planExecutionRecovery(
    execution([task("a", "running"), task("b", "pending", ["a"])]),
    "/tmp/harness-recovery",
  );

  assert.equal(plan.decisions[1]?.action, "blocked");
});

test("pending tasks with completed dependencies require review", () => {
  const plan = planExecutionRecovery(
    execution([task("a", "completed"), task("b", "pending", ["a"])]),
    "/tmp/harness-recovery",
  );

  assert.equal(plan.decisions[1]?.action, "review");
});

test("terminal executions cannot restart unfinished tasks", () => {
  const plan = planExecutionRecovery(
    execution([task("a", "failed"), task("b", "pending")], "failed"),
    "/tmp/harness-recovery",
  );

  assert.equal(plan.decisions[0]?.action, "blocked");
  assert.equal(plan.decisions[1]?.action, "blocked");
});

test("rejects mismatched project roots", () => {
  assert.throws(
    () =>
      planExecutionRecovery(
        execution([task("a", "pending")]),
        "/tmp/another-project",
      ),
    /project mismatch/,
  );
});

test("read-only retries differ from writes", () => {
  const read = evaluateOperationReplay("read_only", true);

  const write = evaluateOperationReplay("create_only", true);

  const external = evaluateOperationReplay("external_side_effect", true);

  assert.equal(read.retryAllowed, true);
  assert.equal(write.retryAllowed, false);
  assert.equal(write.reconciliationRequired, true);
  assert.equal(external.retryAllowed, false);
});

test("unknown checkpoints return null", async () => {
  const plan = await inspectStoredRecovery(
    {
      save: async () => undefined,
      get: async () => null,
    },
    "missing-execution",
    "/tmp/harness-recovery",
  );

  assert.equal(plan, null);
});
