import type { Permission, RiskLevel } from "./index.js";

export const OPERATION_STATES = ["Created", "PendingApproval", "Approved", "Prepared", "Running", "Completed", "Failed", "Cancelled", "Uncertain"] as const;
export type OperationState = typeof OPERATION_STATES[number];
export type OperationSafety = "read_only" | "side_effecting";
export type DurableApprovalStatus = "pending" | "approved" | "denied" | "revoked" | "expired" | "consumed";
export interface HostIdentity { issuer: string; subject: string }
export interface OperationRequest {
  executionId: string;
  taskId: string;
  requestId: string;
  toolCallId?: string;
  projectRoot: string;
  toolId: string;
  argumentDigest: string;
  permission: Permission;
  risk: RiskLevel;
  safety: OperationSafety;
  requester: HostIdentity;
  requiresApproval: boolean;
}
export interface DurableOperation extends OperationRequest {
  operationId: string;
  ownerSession: string;
  scopeDigest: string;
  state: OperationState;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvalId?: string;
  resultDigest?: string;
  evidenceRef?: string;
}
export interface DurableApproval {
  approvalId: string;
  operationId: string;
  requester: HostIdentity;
  approver?: HostIdentity;
  scopeDigest: string;
  status: DurableApprovalStatus;
  expiresAt: string;
  updatedAt: string;
}
export interface OperationEvent {
  sequence: number;
  operationId: string;
  type: string;
  state: OperationState;
  version: number;
  timestamp: string;
  actor?: HostIdentity;
  evidenceRef?: string;
}
export interface RegisterOperationResult { operation: DurableOperation; duplicate: boolean }
export type ReconciliationEvidence =
  | { kind: "host_quiesced"; reference: string }
  | { kind: "confirmed_completed"; reference: string }
  | { kind: "confirmed_no_effect"; reference: string };
export interface OperationRecoveryDecision {
  operationId: string;
  state: OperationState;
  action: "skip" | "review_new_request" | "blocked" | "reconcile";
  retryAllowed: false;
  reason: string;
}
/** Trusted-host port. Implementations must transact state, approval and events.
 * No handler/model/identity verification may execute inside a storage transaction.
 */
export interface DurableOperationStore {
  register(request: OperationRequest): RegisterOperationResult;
  get(operationId: string): DurableOperation | null;
  list(executionId: string, after?: string, limit?: number): DurableOperation[];
  pending(after?: string, limit?: number): DurableOperation[];
  approval(approvalId: string): DurableApproval | null;
  decide(approvalId: string, actor: HostIdentity, approved: boolean): DurableApproval;
  revoke(approvalId: string, actor: HostIdentity): DurableApproval;
  prepare(operationId: string, version: number, scopeDigest: string, approvalId?: string): DurableOperation | null;
  start(operationId: string, version: number): DurableOperation;
  finish(operationId: string, version: number, state: "Completed" | "Uncertain" | "Cancelled", resultDigest?: string): DurableOperation;
  reconcile(operationId: string, version: number, actor: HostIdentity, evidence: ReconciliationEvidence): DurableOperation;
  events(operationId: string): OperationEvent[];
  /** Permanently disables this instance for execution after a storage fault. */
  retireSession(): void;
  close(): void;
}
const TRANSITIONS: Readonly<Record<OperationState, readonly OperationState[]>> = {
  Created: ["PendingApproval", "Prepared", "Cancelled", "Failed"],
  PendingApproval: ["Approved", "Cancelled"],
  Approved: ["Prepared", "Cancelled"],
  Prepared: ["Running", "Cancelled", "Uncertain"],
  Running: ["Completed", "Uncertain"],
  Uncertain: ["Completed", "Cancelled"],
  Completed: [], Failed: [], Cancelled: [],
};
export function assertOperationTransition(from: OperationState, to: OperationState): void {
  if (!Object.hasOwn(TRANSITIONS, from) || !TRANSITIONS[from].includes(to))
    throw new Error("Invalid durable operation transition");
}
export function isTerminalOperationState(state: OperationState): boolean {
  return state === "Completed" || state === "Failed" || state === "Cancelled";
}
export interface DurableDispatchBinding {
  store: DurableOperationStore;
  requester: HostIdentity;
  /** Host-owned classifications; missing entries fail closed. */
  safetyByTool: Readonly<Record<string, OperationSafety>>;
}

/** Sanitized storage failure categories; no SQL, paths, secrets or raw errors. */
export class DurableStoreError extends Error {
  constructor(readonly code: "invalid" | "unavailable") {
    super(code === "invalid" ? "Durable journal transaction rejected" : "Durable journal unavailable");
    this.name = "DurableStoreError";
  }
}
