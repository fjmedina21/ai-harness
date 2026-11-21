import type { Permission, ToolInvocation } from "./index.js";

export interface ToolDispatchContext {
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
  toolId: ToolInvocation["toolId"];
  status: ToolDispatchStatus;
  data?: unknown;
  error?: string;
  approvalId?: string;
}
