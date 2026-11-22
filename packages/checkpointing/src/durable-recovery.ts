import type { DurableOperation, DurableOperationStore, OperationRecoveryDecision } from "@ai-harness/contracts";

/** Inspection cannot establish quiescence or grant execution. */
export function planDurableOperationRecovery(op: DurableOperation): OperationRecoveryDecision {
  let action: OperationRecoveryDecision["action"] = "blocked";
  let reason = "Uncertain effects require trusted host evidence";
  if (op.state === "Completed") { action = "skip"; reason = "Durable completion; never replay"; }
  else if (op.state === "Failed" || op.state === "Cancelled") {
    action = "review_new_request"; reason = "Terminal operation; any new request needs independent authorization";
  } else if (op.state === "Prepared" || op.state === "Running") {
    action = "reconcile"; reason = "Execution may have begun; host must fence workers and reconcile";
  } else if (op.state !== "Uncertain") {
    action = "review_new_request"; reason = "No running evidence; old authorization cannot resume after reopening";
  }
  return { operationId: op.operationId, state: op.state, action, retryAllowed: false, reason };
}
export function inspectDurableRecovery(store: DurableOperationStore, executionId: string, after?: string, limit?: number): OperationRecoveryDecision[] {
  return store.list(executionId, after, limit).map(planDurableOperationRecovery);
}

export function inspectPendingDurableRecovery(store: DurableOperationStore, after?: string, limit?: number): OperationRecoveryDecision[] {
  return store.pending(after, limit).map(planDurableOperationRecovery);
}
