/** TEST ONLY: synthetic storage receipt, never native presence evidence or product authentication. */
import { randomBytes, createHash } from "node:crypto";
import { normalizeApprovalPolicy, type EngineeringResumeStore, type StructuredPatch } from "@ai-harness/contracts";
import { humanIntentDigest } from "@ai-harness/security";
export function approveStorageFixture(store: EngineeringResumeStore, approvalId: string, patch?: StructuredPatch, diff = "fixture") {
  const grant = store.approval(approvalId)!, op = store.get(grant.operationId)!;
  const hash = (v: string) => createHash("sha256").update(v).digest("hex");
  if (!store.approvalReview!(op.operationId)) {
    if (!patch) throw new Error("Fixture patch required");
    store.bindProposal({ operationId: op.operationId, executionId: op.executionId, workspaceId: patch.workspaceId, artifactDigest: hash(JSON.stringify(patch)), challenge: randomBytes(32).toString("hex"), expiresAt: grant.expiresAt },
      { policy: normalizeApprovalPolicy(), workspaceId: patch.workspaceId, artifactDigest: hash(JSON.stringify(patch)), patchDigest: patch.digest, snapshotDigest: patch.baseRevision, contentDigest: hash(diff) });
  }
  const context = store.approvalReview!(op.operationId)!, now = Math.min(Date.now(), Date.parse(grant.updatedAt));
  const decided = store.decideReviewed!(approvalId, grant.requester, true, { id: randomBytes(32).toString("hex"), bindingDigest: humanIntentDigest(context, grant.requester), issuedAt: now,
    expiresAt: Math.min(now + 60000, Date.parse(context.expiresAt)), method: "reviewed-external-v1" });
  if (op.toolId === "patch.apply") store.acquireLease(op.operationId, store.get(op.operationId)!.version, 300000, grant.requester);
  return decided;
}
