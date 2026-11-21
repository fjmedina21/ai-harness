import type {
  AgentRole,
  ExecutionStatus,
  ModelProviderAdapter,
  Permission,
  RiskLevel,
  TaskDefinition,
} from "./index.js";

export type ExecutionState = ExecutionStatus;

export type TaskState =
  | "pending"
  | "ready"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface RuntimeTask {
  definition: TaskDefinition;
  state: TaskState;
  attempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface AgentExecutionContext {
  executionId: string;
  projectRoot: string;
  model: ModelProviderAdapter;
  grantedPermissions: readonly Permission[];
  signal?: AbortSignal;
}

export interface AgentExecutionResult {
  success: boolean;
  summary: string;
  artifacts: readonly string[];
  error?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
  };
}

export interface Agent {
  readonly role: AgentRole;

  execute(
    task: Readonly<TaskDefinition>,
    context: Readonly<AgentExecutionContext>,
  ): Promise<AgentExecutionResult>;
}

export type ExecutionEventType =
  | "execution.created"
  | "execution.started"
  | "execution.completed"
  | "execution.failed"
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "approval.required"
  | "checkpoint.saved";

export interface ExecutionEvent {
  id: string;
  executionId: string;
  taskId?: string;
  type: ExecutionEventType;
  timestamp: string;
  message: string;
}

export interface RuntimeExecution {
  id: string;
  request: string;
  projectRoot: string;
  state: ExecutionState;
  tasks: RuntimeTask[];
  events: ExecutionEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionResult {
  executionId: string;
  state: ExecutionState;
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
  artifacts: readonly string[];
}

export interface ExecutionPolicy {
  maxRetries: number;
  maxConcurrentTasks: number;
  requireApprovalFor: readonly Permission[];
  maximumRiskWithoutApproval: RiskLevel;
}

export const TERMINAL_EXECUTION_STATES = [
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly ExecutionState[];

export function isTerminalExecutionState(state: ExecutionState): boolean {
  return TERMINAL_EXECUTION_STATES.some((terminal) => terminal === state);
}

export interface RuntimeCheckpointStore {
  save(execution: RuntimeExecution): Promise<void>;
  get(executionId: string): Promise<RuntimeExecution | null>;
}
