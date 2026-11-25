import { canonicalProposalJson, EngineeringResumeError, type EngineeringResumeStore, type ProposalReference, type ResumeAction, type ResumeIdentityChallenge, type ResumeIdentityVerifier, type VerifiedResumeIdentity } from "@ai-harness/contracts";
import { DurableApprovalService } from "./durable-approval.js";

/** Host-side adapter boundary. No authenticator configured means no access, including private diff. */
export class ApprovalBroker {
  constructor(private readonly store: EngineeringResumeStore, private readonly verifier?: ResumeIdentityVerifier,
    private readonly now: () => number = Date.now) {}
  reference(operationId: string): ProposalReference {
    try {
      const reference = this.store.proposal(operationId);
      if (!reference) throw new Error();
      return reference;
    } catch { throw new EngineeringResumeError("artifact_missing"); }
  }
  async authenticate(operationId: string, action: ResumeAction, credential: string): Promise<VerifiedResumeIdentity> {
    if (!this.verifier || typeof credential !== "string" || !credential.trim() || credential.length > 8192) throw new EngineeringResumeError("authentication_required");
    const ref = this.reference(operationId);
    const challenge: ResumeIdentityChallenge = { action, executionId: ref.executionId, workspaceId: ref.workspaceId, artifactDigest: ref.artifactDigest, challenge: ref.challenge };
    let actor: VerifiedResumeIdentity;
    try { actor = await this.verifier.verify(credential, Object.freeze({ ...challenge })); }
    catch { throw new EngineeringResumeError("authentication_required"); }
    if (!actor || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(actor.issuer) || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(actor.subject) ||
      !Number.isSafeInteger(actor.expiresAt) || actor.expiresAt <= this.now() || actor.expiresAt > this.now() + 300_000 ||
      canonicalProposalJson(actor.binding) !== canonicalProposalJson(challenge)) throw new EngineeringResumeError("authentication_required");
    const role = ["approve", "reject", "revoke"].includes(action) ? "harness:approver" : action === "continue" ? "harness:operator" : "harness:reader";
    if (!Array.isArray(actor.roles) || !actor.roles.includes(role)) throw new EngineeringResumeError("forbidden_scope");
    return structuredClone(actor);
  }
  async decide(operationId: string, credential: string, approved: boolean, review?: () => Promise<void>): Promise<void> {
    const action = approved ? "approve" : "reject";
    const actor = await this.authenticate(operationId, action, credential);
    const ref = this.reference(operationId), op = this.store.get(operationId);
    if (!op?.approvalId) throw new EngineeringResumeError("approval_mismatch");
    if (actor.issuer === op.requester.issuer && actor.subject === op.requester.subject) throw new EngineeringResumeError("forbidden_scope");
    await review?.();
    if (this.now() >= actor.expiresAt) throw new EngineeringResumeError("authentication_required");
    // Reuses the existing independently authenticated approval service, not a parallel grant store.
    const service = new DurableApprovalService(this.store, { verify: async () => {
      return { issuer: actor.issuer, subject: actor.subject, roles: actor.roles };
    } });
    try { await service.decide(op.approvalId, credential, approved, { artifactDigest: ref.artifactDigest, challenge: ref.challenge }); }
    catch { throw new EngineeringResumeError("approval_mismatch"); }
  }
  async revoke(operationId: string, credential: string): Promise<void> {
    const actor = await this.authenticate(operationId, "revoke", credential);
    const op = this.store.get(operationId);
    if (!op?.approvalId) throw new EngineeringResumeError("approval_mismatch");
    const service = new DurableApprovalService(this.store, { verify: async () => {
      return { ...actor, roles: actor.roles };
    } });
    await service.revoke(op.approvalId, credential);
  }
  async status(operationId: string, credential: string): Promise<{ state: string; approval: string; expired: boolean }> {
    await this.authenticate(operationId, "status", credential);
    const op = this.store.get(operationId), grant = op?.approvalId && this.store.approval(op.approvalId);
    if (!op || !grant) throw new EngineeringResumeError("approval_mismatch");
    const expired = Date.parse(grant.expiresAt) <= this.now() || Date.parse(this.reference(operationId).expiresAt) <= this.now();
    return { state: op.state, approval: expired && ["pending", "approved"].includes(grant.status) ? "expired" : grant.status, expired };
  }
}
