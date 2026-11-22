import type { Permission, ToolInvocation } from "./index.js";

export interface ToolDispatchContext {
  telemetry?: import("./telemetry.js").TelemetryBinding;
  /** Host-only durable opt-in; never derived from model arguments. */
  durableOperations?: import("./durable.js").DurableDispatchBinding;
  operation?: { taskId: string; requestId: string; toolCallId?: string };
  signal?: AbortSignal;
  requireAtomicFilesystem?: boolean;
  /**
   * Trusted host configuration.
   * Never construct this object directly from model output.
   */
  executionId: string;
  projectRoot: string;
  defaultDeny: true;
  grantedPermissions: readonly Permission[];
  requireApprovalFor: readonly Permission[];
}

export interface ToolHandlerContext {
  signal?: AbortSignal;
  /** Reject local filesystem access when atomic rooted confinement is required. */
  requireAtomicFilesystem?: boolean;
  executionId: string;
  projectRoot: string;
}

export type ToolHandler = (
  args: Readonly<Record<string, unknown>>,
  context: Readonly<ToolHandlerContext>,
) => Promise<unknown>;

export type ToolDispatchStatus =
  | "executed"
  | "invalid"
  | "denied"
  | "approval_required"
  | "failed";

export interface ToolDispatchResult {
  operationId?: string;
  operationState?: import("./durable.js").OperationState;
  toolId: ToolInvocation["toolId"];
  status: ToolDispatchStatus;
  data?: unknown;
  error?: string;
  approvalId?: string;
}
