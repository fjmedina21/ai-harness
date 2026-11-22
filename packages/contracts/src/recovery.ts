export type RecoveryAction = "skip" | "review" | "reconcile" | "blocked";

export interface TaskRecoveryDecision {
  taskId: string;
  action: RecoveryAction;
  reason: string;
}

export interface ExecutionRecoveryPlan {
  executionId: string;
  executionState: string;
  resumableAutomatically: false;
  decisions: TaskRecoveryDecision[];
}

export type OperationReplaySafety =
  | "read_only"
  | "create_only"
  | "external_side_effect";

export interface OperationReplayDecision {
  retryAllowed: boolean;
  reconciliationRequired: boolean;
  reason: string;
}
