/** Host-only authority is deliberately absent from model patch input. */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;
export const ENGINEERING_STATES = ["Proposed", "Authorized", "Applying", "Applied", "Validating", "ValidationFailed", "Repairing", "ReviewPending", "Completed", "Failed", "Cancelled", "Uncertain"] as const;
export type EngineeringState = typeof ENGINEERING_STATES[number];
export type PatchOperation = "create" | "replace" | "delete";
export interface FileChange {
  path: string;
  operation: PatchOperation;
  baseHash: string | null;
  content: string | null;
  resultHash: string | null;
}
export interface EngineeringPolicy {
  version: string;
  allowedPaths: readonly string[];
  allowedOperations: readonly PatchOperation[];
  maxFiles: number;
  maxBytes: number;
}
export interface WorkspaceReceipt {
  executionId: string;
  workspaceId: string;
  sourceRoot: string;
  baseRevision: string;
  root: string;
  expiresAt: number;
  ownerUid: number;
}
export interface WorkspaceSnapshot {
  digest: string;
  files: readonly { path: string; hash: string; bytes: number }[];
}
export interface StructuredPatch {
  executionId: string;
  workspaceId: string;
  baseRevision: string;
  policyDigest: string;
  digest: string;
  changes: readonly FileChange[];
  status: "Proposed";
}
export interface ValidationEvidence {
  snapshotDigest: string;
  workspaceId: string;
  kind: "fixture" | "real_podman";
  profile: string;
  environment: string;
  validationId: string;
  durationMs: number;
  exitCode: number;
  result: "passed" | "failed";
  cleanup: "confirmed" | "uncertain";
  logDigest: string;
  /** Fixed host assertion IDs, never raw output or model judgments. */
  passedChecks: readonly string[];
  resources: { cpu: number; memoryBytes: number; pids: number };
}
export interface EngineeringBudget {
  maxIterations: number;
  maxRequests: number;
  maxTokens: number;
  maxEstimatedCostUsd: number;
  timeoutMs: number;
  maxFiles: number;
  maxBytes: number;
}
/** L4 describes supervision; it grants no integration or publication authority. */
export interface SupervisedEngineeringTask {
  level: 4;
  executionId: string;
  steps: readonly { id: string; role: import("./index.js").AgentRole; requiresApproval: boolean }[];
  integration: "disabled";
  deployment: "disabled";
}

export interface EngineeringCheckpoint {
  executionId: string;
  workspaceId: string;
  state: EngineeringState;
  snapshotDigest: string;
  iteration: number;
  requests: number;
  tokens: number;
  estimatedCostUsd: number;
}

/** Engineering state never authorizes effects; the durable journal remains authoritative. */
export function assertEngineeringStateTransition(from: EngineeringState, to: EngineeringState): void {
  const transitions: Readonly<Record<EngineeringState, readonly EngineeringState[]>> = {
    Proposed: ["Authorized", "ReviewPending", "Failed", "Cancelled", "Uncertain"],
    Authorized: ["Applying", "Failed", "Cancelled", "Uncertain"],
    Applying: ["Applied", "Failed", "Cancelled", "Uncertain"],
    Applied: ["Validating", "ReviewPending", "Failed", "Cancelled", "Uncertain"],
    Validating: ["ValidationFailed", "ReviewPending", "Failed", "Cancelled", "Uncertain"],
    ValidationFailed: ["Repairing", "Failed", "Cancelled", "Uncertain"],
    Repairing: ["Proposed", "Failed", "Cancelled", "Uncertain"],
    ReviewPending: ["Completed", "Failed", "Cancelled", "Uncertain"],
    Completed: [], Failed: [], Cancelled: [], Uncertain: [],
  };
  if (!Object.hasOwn(transitions, from) || !Object.hasOwn(transitions, to) || (from !== to && !transitions[from].includes(to))) throw new Error("Invalid engineering state transition");
}

export interface EngineeringProviderFailure {
  category: "http" | "timeout" | "cancelled" | "invalid_response" | "invalid_output" | "usage_unknown" | "limit" | "authorization" | "closed";
  httpStatus?: number;
  httpErrorCategory?: import("./telemetry.js").ProviderHttpErrorCategory;
}
/** Fixed diagnostics only. Never accepts raw upstream text. */
export class EngineeringProviderError extends Error {
  constructor(readonly failure: EngineeringProviderFailure, readonly usage?: import("./telemetry.js").TokenUsage,
    readonly cost?: import("./telemetry.js").CostEstimate) {
    super("Engineering provider request rejected"); this.name = "EngineeringProviderError";
  }
}

/** Host-selected finite deadlines; never model inputs or authorization credentials. */
export const ENGINEERING_TIME_LIMITS = Object.freeze({ workflowMaxMs: 900_000, roleDefaultMs: 120_000, roleMaxMs: 300_000,
  requestDefaultMs: 30_000, requestMaxMs: 300_000, finalizationDefaultMs: 1000, finalizationMaxMs: 5000 });
export interface EngineeringTimingPolicy {
  roleTimeoutMs?: number;
  roleTimeouts?: Partial<Record<import("./index.js").AgentRole, number>>;
  /** Host epoch milliseconds. Can shorten, never extend, the global budget. */
  deadlineAt?: number;
  finalizationTimeoutMs?: number;
}
export type EngineeringTimeoutScope = "workflow" | "absolute" | "role" | "request" | "persistence";
export type EngineeringPhase = "role" | "context.read" | "context.serialize" | "request.serialize" | "transport.parse" | "response.parse" | "patch.validate" | "checkpoint.persist" | "report.prepare";
export interface EngineeringTimingReport {
  startedAt: string;
  deadlineAt: string;
  elapsedMs: number;
  remainingMs: number;
  finalizationAllowanceMs: number;
  timeoutScope?: EngineeringTimeoutScope;
}
