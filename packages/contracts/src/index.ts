/** Stable public contracts for Phase 0; runtime implementations follow in later phases. */
export const HARNESS_SCHEMA_VERSION = 1 as const;

export const AGENT_ROLES = [
  "orchestrator",
  "requirements-analyst",
  "software-architect",
  "planner",
  "backend-developer",
  "frontend-developer",
  "mobile-developer",
  "database-specialist",
  "qa-engineer",
  "security-specialist",
  "devops-engineer",
  "code-reviewer",
  "technical-writer",
  "validator",
  "ui-ux-designer",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export type ExecutionStatus =
  | "pending"
  | "planning"
  | "awaiting_approval"
  | "running"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Permission =
  | "files:read"
  | "files:write"
  | "shell:execute"
  | "git:write"
  | "deployment:execute";

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  assignedRole: AgentRole;
  dependsOn: string[];
  risk: RiskLevel;
  acceptanceCriteria: string[];
}
export interface ExecutionRecord {
  id: string;
  taskId: string;
  status: ExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  checkpointId?: string;
}
export interface ApprovalRequest {
  id: string;
  executionId: string;
  requestedPermission: Permission;
  reason: string;
  status: "pending" | "approved" | "denied";
}
export interface AgentDescriptor {
  role: AgentRole;
  description: string;
  capabilities: string[];
}
export interface ToolContext {
  projectRoot: string;
  executionId: string;
  grantedPermissions: readonly Permission[];
}
export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
export interface ToolAdapter {
  readonly id: string;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
export interface ModelRequest {
  signal?: AbortSignal;
  system: string;
  prompt: string;
  correlationId: string;
}
export interface ModelResponse {
  text: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
  };
}
export interface ModelProviderAdapter {
  readonly id: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}
export interface CheckpointStore {
  save(execution: ExecutionRecord): Promise<void>;
  get(executionId: string): Promise<ExecutionRecord | null>;
}
export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  approvalRequired: boolean;
}
export interface PolicyEngine {
  authorize(
    permission: Permission,
    risk: RiskLevel,
    granted: readonly Permission[],
  ): PolicyDecision;
}
export * from "./runtime.js";
export type * from "./tools.js";
export type * from "./tool-dispatch.js";
export type * from "./tool-approval.js";
export type * from "./tool-calling.js";
export {
  parseModelToolTurn,
  TOOL_CALL_LIMITS,
} from "./tool-calling-validation.js";
export type * from "./approval-identity.js";
export type * from "./recovery.js";
export {
  ToolCallingSession,
  parseToolCallingContinuation,
  TOOL_SESSION_LIMITS,
} from "./tool-calling-session.js";
