import type { CostEstimate, DurableApproval, DurableOperationStore, EngineeringBudget, EngineeringPolicy, HostIdentity, StructuredPatch, TokenUsage, WorkspaceReceipt, WorkspaceSnapshot } from "./index.js";

/** Private host data; never a model request or telemetry payload. */
export interface ProposalArtifact {
  /** Optional host resource fingerprint. Legacy artifacts remain inspectable, never silently rebound. */
  projectAuthorizationDigest?: string;
  schemaVersion: 1;
  executionId: string;
  requester: HostIdentity;
  operationId: string;
  workspaceId: string;
  receipt: WorkspaceReceipt;
  rootIdentity: { dev: string; ino: string };
  sourceRevision: string;
  baseSnapshot: WorkspaceSnapshot;
  patch: StructuredPatch;
  patchDigest: string;
  diffDigest: string;
  diff: string;
  allowedPaths: readonly string[];
  allowedOperations: EngineeringPolicy["allowedOperations"];
  policy: EngineeringPolicy;
  policyDigest: string;
  /** Preserves legacy engine digest encoding; semantic policy is compared canonically. */
  policyEncoding: string;
  budget: EngineeringBudget;
  accounting: { requests: number; tokens: number; estimatedCostUsd: number | null; usageComplete: boolean; reportedUsage: TokenUsage; cost: CostEstimate };
  createdAt: string;
  expiresAt: string;
  artifactDigest: string;
}
export interface ProposalReference {
  operationId: string;
  executionId: string;
  workspaceId: string;
  artifactDigest: string;
  challenge: string;
  expiresAt: string;
}
export interface ApprovalDecisionBinding { artifactDigest: string; challenge: string }
export interface ContinuationLease {
  leaseId: string;
  executionId: string;
  operationId: string;
  ownerSession: string;
  epoch: number;
  version: number;
  stateVersion: number;
  operator: HostIdentity;
  expiresAt: string;
}
/** Additive v2 journal capability; old store implementations retain their v1 API. */
export interface EngineeringResumeStore extends DurableOperationStore {
  bindProposal(reference: ProposalReference, review?: import("./approval-policy.js").ApprovalReviewInput): void;
  proposal(operationId: string): ProposalReference | null;
  decideScoped(id: string, actor: HostIdentity, approved: boolean, binding: ApprovalDecisionBinding): DurableApproval;
  acquireLease(operationId: string, expectedVersion: number, ttlMs: number, operator: HostIdentity): ContinuationLease;
  assertLease(lease: ContinuationLease): void;
  /** Additive v3 host ports. Older stores cannot grant Personal Mode approvals. */
  approvalReview?(operationId: string): import("./approval-policy.js").ApprovalReviewContext | null;
  bindValidationReview?(operationId: string, review: import("./approval-policy.js").ApprovalReviewInput): void;
  decideReviewed?(id: string, actor: HostIdentity, approved: boolean, intent?: import("./approval-policy.js").HumanIntentReceipt): DurableApproval;
}
export type ResumeAction = "status" | "diff" | "approve" | "reject" | "continue" | "revoke";
export interface ResumeIdentityChallenge {
  action: ResumeAction;
  executionId: string;
  workspaceId: string;
  artifactDigest: string;
  challenge: string;
}
export interface VerifiedResumeIdentity extends HostIdentity {
  roles: readonly string[];
  /** Exact challenge/action/resource binding verified independently by the host. */
  binding: ResumeIdentityChallenge;
  expiresAt: number;
}
/** Trusted host integration must verify signature/issuer/audience/expiry and replay.
 * No default implementation or production fixture is supplied. Credentials never enter argv/storage.
 */
export interface ResumeIdentityVerifier {
  verify(credential: string, challenge: Readonly<ResumeIdentityChallenge>): Promise<VerifiedResumeIdentity>;
}
export type EngineeringReconciliation = { status: "ready"; artifactDigest: string; snapshotDigest: string } |
  { status: "blocked"; code: ResumeErrorCode };
export type ResumeErrorCode = "authentication_required" | "authentication_unavailable" | "forbidden_scope" | "artifact_missing" | "artifact_invalid" |
  "approval_expired" | "approval_mismatch" | "policy_changed" | "snapshot_changed" | "lease_conflict" |
  "reconciliation_required" | "storage_uncertain" | "cancelled" | "timeout" | "human_confirmation_required" | "human_confirmation_cancelled";
export class EngineeringResumeError extends Error {
  constructor(readonly code: ResumeErrorCode) { super("Engineering continuation rejected: " + code); this.name = "EngineeringResumeError"; }
}
/** Deterministic bounded JSON; rejects non-JSON data rather than dropping fields. */
export function canonicalProposalJson(value: unknown): string {
  let nodes = 0, bytes = 0;
  const bound = (text: string): string => {
    bytes += new TextEncoder().encode(text).length;
    if (bytes > 65536) throw new EngineeringResumeError("artifact_invalid");
    return text;
  };
  const visit = (v: unknown, depth: number): string => {
    if (++nodes > 8192 || depth > 16) throw new EngineeringResumeError("artifact_invalid");
    if (v === null || typeof v === "boolean" || typeof v === "string" || typeof v === "number" && Number.isFinite(v)) {
      if (typeof v === "string" && v.length > 65536) throw new EngineeringResumeError("artifact_invalid");
      return bound(JSON.stringify(v));
    }
    if (Array.isArray(v)) {
      if (v.length > 4096) throw new EngineeringResumeError("artifact_invalid");
      bound("[" + ",".repeat(Math.max(0, v.length - 1)) + "]");
      return "[" + Array.from(v, x => visit(x, depth + 1)).join(",") + "]";
    }
    if (v && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      const keys = Object.keys(v).sort();
      bound("{" + ",".repeat(Math.max(0, keys.length - 1)) + "}");
      return "{" + keys.map(k => {
        if (["__proto__", "prototype", "constructor"].includes(k) || k.length > 128) throw new EngineeringResumeError("artifact_invalid");
        return bound(JSON.stringify(k) + ":") + visit((v as Record<string, unknown>)[k], depth + 1);
      }).join(",") + "}";
    }
    throw new EngineeringResumeError("artifact_invalid");
  };
  const text = visit(value, 0);
  if (new TextEncoder().encode(text).length > 65536) throw new EngineeringResumeError("artifact_invalid");
  return text;
}
