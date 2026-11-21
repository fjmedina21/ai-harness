import type { Permission, RiskLevel } from "./index.js";

export type ToolApprovalStatus = "pending" | "approved" | "denied" | "consumed";

export interface ToolApprovalScope {
  executionId: string;
  projectRoot: string;
  toolId: string;
  arguments: unknown;
  permission: Permission;
  risk: RiskLevel;
}

export interface ToolApprovalRecord {
  id: string;
  executionId: string;
  projectRoot: string;
  toolId: string;
  argumentDigest: string;
  permission: Permission;
  risk: RiskLevel;
  status: ToolApprovalStatus;
  requestedAt: string;
  expiresAt: string;
  decidedBy?: string;
  decidedAt?: string;
  consumedAt?: string;
}
