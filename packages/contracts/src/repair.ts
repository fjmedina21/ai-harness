import type { RepairValidationEvidence } from "./validation-profile.js";
import type { NormalizedValidationResult } from "./validation-profile.js";

export const REPAIR_STATES = ["ValidationFailed", "RepairRequested", "AnalyzingDiagnostics", "RepairProposed", "AwaitingPatchApproval", "RepairApproved", "ApplyingRepair", "RepairApplied", "AwaitingSandboxApproval", "Revalidating", "NextIteration", "Completed", "Cancelled", "BudgetExhausted", "NoProgress", "Blocked", "Failed", "ReconciliationRequired"] as const;
export type RepairState = typeof REPAIR_STATES[number];
export interface RepairPolicy {
  version: 1;
  enabled: true;
  maxIterations: number;
  maxProviderRequests: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxGlobalMs: number;
  maxProviderMs: number;
  maxValidationMs: number;
  maxValidations: number;
  maxFiles: number;
  maxPatchBytes: number;
  maxEstimatedCostUsd: number;
  allowUnknownCost: boolean;
  requireHumanApprovalForEachPatch: true;
  requireSeparateSandboxApproval: true;
  stopOnUncertainState: true;
  stopOnNoProgress: true;
}
/** Reservations count against all ceilings before dispatch and never disappear after an unknown effect. */
export interface RepairAccounting {
  iterations: number;
  providerRequests: number;
  inputTokens: number;
  outputTokens: number;
  validations: number;
  patchBytes: number;
  files: number;
  estimatedCostUsd: number | null;
}
export interface RepairIteration {
  id: string;
  index: number;
  baseSnapshotDigest: string;
  resultingSnapshotDigest?: string;
  patchDigest?: string;
  changeDigest?: string;
  operationId?: string;
  artifactDigest?: string;
  approvalId?: string;
  validationId?: string;
  diagnosticDigest: string;
  normalizedResult?: unknown;
  providerUsage?: { providerId: string; model: string | null; inputTokens: number; outputTokens: number; estimatedCostUsd: number | null };
}
/** Host-private bounded state; model output is never an authorization source. */
export interface RepairSession {
  schemaVersion: 1;
  sessionId: string;
  executionId: string;
  projectId: string;
  ownerId: string;
  policyDigest: string;
  profileDigest: string;
  profileId: string;
  actionId: string;
  originalObjective: string;
  sourceRevision: string;
  initialOperationId: string;
  currentOperationId: string;
  workspaceId: string;
  baseSnapshotDigest: string;
  state: RepairState;
  iteration: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string;
  policy: RepairPolicy;
  consumed: RepairAccounting;
  reserved: RepairAccounting;
  iterations: readonly RepairIteration[];
  lastValidation: RepairValidationEvidence;
  lastNormalized?: NormalizedValidationResult;
  diagnosticDigest: string;
  terminalReason?: string;
}
export interface RepairJournal {
  create(session: RepairSession): RepairSession;
  get(sessionId: string): RepairSession | null;
  history(sessionId: string): RepairSession[];
  /** CAS owns the next step. Persist an in-flight state before an effect; never replay that state. */
  compareAndSwap(sessionId: string, expectedVersion: number, next: RepairSession): RepairSession;
}
export const REPAIR_TERMINAL_STATES: readonly RepairState[] = ["Completed", "Cancelled", "BudgetExhausted", "NoProgress", "Blocked", "Failed", "ReconciliationRequired"];
const transitions: Readonly<Record<RepairState, readonly RepairState[]>> = {
  ValidationFailed: ["RepairRequested"], RepairRequested: ["AnalyzingDiagnostics"],
  AnalyzingDiagnostics: ["RepairProposed"], RepairProposed: ["AwaitingPatchApproval"],
  AwaitingPatchApproval: ["RepairApproved"], RepairApproved: ["ApplyingRepair"],
  ApplyingRepair: ["RepairApplied"], RepairApplied: ["AwaitingSandboxApproval"],
  AwaitingSandboxApproval: ["Revalidating"], Revalidating: ["Completed", "NextIteration"],
  NextIteration: ["RepairRequested"], Completed: [], Cancelled: [], BudgetExhausted: [],
  NoProgress: [], Blocked: [], Failed: [], ReconciliationRequired: [],
};
export function assertRepairTransition(from: RepairState, to: RepairState): void {
  if (!Object.hasOwn(transitions, from) || !Object.hasOwn(transitions, to) || REPAIR_TERMINAL_STATES.includes(from) ||
    (!transitions[from].includes(to) && (to === "Completed" || !REPAIR_TERMINAL_STATES.includes(to)))) throw new Error("Invalid repair transition");
}
