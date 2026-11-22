import path from "node:path";

import type {
  ExecutionRecoveryPlan,
  OperationReplayDecision,
  OperationReplaySafety,
  RuntimeCheckpointStore,
  RuntimeExecution,
  TaskRecoveryDecision,
} from "@ai-harness/contracts";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function validateExecution(
  execution: RuntimeExecution,
  expectedRoot: string,
): void {
  if (
    !execution.id ||
    path.resolve(execution.projectRoot) !== path.resolve(expectedRoot)
  ) {
    throw new Error("Checkpoint project mismatch");
  }

  if (!Array.isArray(execution.tasks)) {
    throw new Error("Invalid checkpoint tasks");
  }

  const ids = new Set<string>();

  for (const task of execution.tasks) {
    const id = task.definition?.id;

    if (typeof id !== "string" || !id.trim() || ids.has(id)) {
      throw new Error("Invalid checkpoint task ID");
    }

    ids.add(id);
  }

  for (const task of execution.tasks) {
    if (
      !Array.isArray(task.definition.dependsOn) ||
      task.definition.dependsOn.some((dependency) => !ids.has(dependency))
    ) {
      throw new Error("Invalid checkpoint dependencies");
    }
  }
}

/**
 * Builds an inspection-only recovery plan.
 *
 * Never dispatches tools or replays agent execution.
 */
export function planExecutionRecovery(
  execution: RuntimeExecution,
  expectedProjectRoot: string,
): ExecutionRecoveryPlan {
  validateExecution(execution, expectedProjectRoot);

  const completed = new Set(
    execution.tasks
      .filter((task) => task.state === "completed")
      .map((task) => task.definition.id),
  );

  const terminal = TERMINAL.has(execution.state);

  const decisions: TaskRecoveryDecision[] = execution.tasks.map((task) => {
    const taskId = task.definition.id;

    if (task.state === "completed") {
      return {
        taskId,
        action: "skip",
        reason: "Task already completed",
      };
    }

    if (terminal) {
      return {
        taskId,
        action: "blocked",
        reason: "Execution is terminal",
      };
    }

    if (task.state === "running" || task.state === "awaiting_approval") {
      return {
        taskId,
        action: "reconcile",
        reason: "Operation outcome or approval state is uncertain",
      };
    }

    if (task.state === "failed" || task.state === "cancelled") {
      return {
        taskId,
        action: "review",
        reason: "Explicit operator review required",
      };
    }

    if (
      task.definition.dependsOn.some((dependency) => !completed.has(dependency))
    ) {
      return {
        taskId,
        action: "blocked",
        reason: "Dependencies are not completed",
      };
    }

    return {
      taskId,
      action: "review",
      reason: "Task is eligible for review, not automatic replay",
    };
  });

  return {
    executionId: execution.id,
    executionState: execution.state,
    resumableAutomatically: false,
    decisions,
  };
}

export async function inspectStoredRecovery(
  store: RuntimeCheckpointStore,
  executionId: string,
  expectedProjectRoot: string,
): Promise<ExecutionRecoveryPlan | null> {
  const execution = await store.get(executionId);

  if (!execution) return null;

  return planExecutionRecovery(execution, expectedProjectRoot);
}

/**
 * Conservative replay policy.
 *
 * Applies only to operations classified by trusted host
 * code. Never accept safety classification from the model.
 */
export function evaluateOperationReplay(
  safety: OperationReplaySafety,
  previousAttemptStarted: boolean,
): OperationReplayDecision {
  if (!previousAttemptStarted) {
    return {
      retryAllowed: false,
      reconciliationRequired: false,
      reason: "New execution requires normal authorization",
    };
  }

  if (safety === "read_only") {
    return {
      retryAllowed: true,
      reconciliationRequired: false,
      reason: "Read-only operation may be retried after authorization",
    };
  }

  return {
    retryAllowed: false,
    reconciliationRequired: true,
    reason: "Side effects must be reconciled before any retry",
  };
}
