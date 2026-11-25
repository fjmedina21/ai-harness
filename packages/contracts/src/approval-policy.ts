import type { HostIdentity } from "./durable.js";

export interface ApprovalPolicy {
  version: 1;
  mode: "team" | "personal";
  requireHumanConfirmation: true;
  allowRequesterApproval: boolean;
  requireExactPatchReview: true;
  requireSeparateSandboxApproval: true;
}
export function normalizeApprovalPolicy(raw?: unknown): ApprovalPolicy {
  if (raw === undefined) return { version: 1, mode: "team", requireHumanConfirmation: true, allowRequesterApproval: false, requireExactPatchReview: true, requireSeparateSandboxApproval: true };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid host approval policy");
  const p = raw as ApprovalPolicy;
  if (Object.keys(p).sort().join() !== ["version", "mode", "requireHumanConfirmation", "allowRequesterApproval", "requireExactPatchReview", "requireSeparateSandboxApproval"].sort().join() ||
    p.version !== 1 || !["team", "personal"].includes(p.mode) || p.requireHumanConfirmation !== true || p.allowRequesterApproval !== (p.mode === "personal") || p.requireExactPatchReview !== true || p.requireSeparateSandboxApproval !== true) throw new Error("Invalid host approval policy");
  return { version: 1, mode: p.mode, requireHumanConfirmation: true, allowRequesterApproval: p.allowRequesterApproval, requireExactPatchReview: true, requireSeparateSandboxApproval: true };
}
export const approvalPolicyJson = (raw?: unknown): string => JSON.stringify(normalizeApprovalPolicy(raw));
export interface ApprovalReviewInput {
  policy: ApprovalPolicy;
  workspaceId: string;
  artifactDigest: string;
  patchDigest: string;
  snapshotDigest: string;
  contentDigest: string;
  /** Required for sandbox validation; a patch approval cannot authorize a command. */
  actionDigest?: string;
}
export interface ApprovalReviewContext extends ApprovalReviewInput {
  schemaVersion: 1;
  operationId: string;
  executionId: string;
  scopeDigest: string;
  purpose: "patch.apply" | "sandbox.validate";
  policyDigest: string;
  challenge: string;
  expiresAt: string;
}
/** Non-secret verified-intent metadata. Not a login token or an approval credential. */
export interface HumanIntentReceipt {
  id: string;
  bindingDigest: string;
  issuedAt: number;
  expiresAt: number;
  method: "macos-local-auth-and-tty-v1" | "reviewed-external-v1";
}
export interface ApprovalDecisionRecord {
  mode: ApprovalPolicy["mode"];
  policyVersion: 1;
  policyDigest: string;
  challengeDigest: string;
  patchDigest: string;
  snapshotDigest: string;
  workspaceId: string;
  authorizationScope: string;
  approvedAt: string;
  requester: HostIdentity;
  approver: HostIdentity;
  intent?: HumanIntentReceipt;
}
export interface HumanApprovalReview {
  context: ApprovalReviewContext;
  actor: HostIdentity;
  /** Private display only; never persist diff/source in telemetry. */
  diff: string;
  files: readonly { path: string; operation: string }[];
  workspace: string;
  risk: string;
}
/** Trusted host UI capability, never registered as a model tool. External implementations
 * require independently reviewed identity/presence/intent verification; no default exists. */
export interface HumanApprovalPort {
  confirm(review: Readonly<HumanApprovalReview>, signal?: AbortSignal): Promise<HumanIntentReceipt | null>;
}
