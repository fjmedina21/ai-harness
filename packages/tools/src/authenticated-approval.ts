import type {
  ApproverIdentityVerifier,
  ToolApprovalRecord,
  ToolApprovalScope,
} from "@ai-harness/contracts";

import { ToolApprovalManager } from "./approval.js";
import { FileApprovalAuditLog } from "./approval-audit.js";

const REQUIRED_ROLE = "harness:approver";

/**
 * Trusted-host integration layer.
 *
 * The manager and verifier must never be supplied
 * by model-generated code or workspace content.
 */
export class AuthenticatedApprovalService {
  constructor(
    private readonly manager: ToolApprovalManager,
    private readonly verifier: ApproverIdentityVerifier,
    private readonly audit: FileApprovalAuditLog,
  ) {}

  async request(scope: ToolApprovalScope): Promise<ToolApprovalRecord> {
    const record = this.manager.request(scope);

    // Fail closed at the service boundary if audit
    // persistence is unavailable.
    await this.audit.append({
      type: "approval.requested",
      approvalId: record.id,
      executionId: record.executionId,
      toolId: record.toolId,
      argumentDigest: record.argumentDigest,
    });

    return record;
  }

  async decide(
    approvalId: string,
    credential: string,
    approved: boolean,
  ): Promise<ToolApprovalRecord> {
    if (!credential.trim()) {
      throw new Error("Authentication required");
    }

    // The verifier must validate the credential
    // cryptographically against a trusted issuer.
    const identity = await this.verifier.verify(credential);

    if (
      !identity.subject.trim() ||
      !identity.issuer.trim() ||
      !identity.roles.includes(REQUIRED_ROLE)
    ) {
      throw new Error("Approver is not authorized");
    }

    const record = this.manager.get(approvalId);

    if (!record || record.status !== "pending") {
      throw new Error("Approval is not pending");
    }

    if (Date.now() >= Date.parse(record.expiresAt)) {
      throw new Error("Approval request expired");
    }

    // Persist the authorization intent BEFORE changing
    // in-memory approval state.
    await this.audit.append({
      type: "approval.decision_authorized",
      approvalId: record.id,
      executionId: record.executionId,
      toolId: record.toolId,
      argumentDigest: record.argumentDigest,
      actor: `${identity.issuer}:${identity.subject}`,
      decision: approved ? "approved" : "denied",
    });

    // Synchronous state change after durable intent.
    // No other asynchronous operation intervenes.
    return this.manager.decide(
      approvalId,
      `${identity.issuer}:${identity.subject}`,
      approved,
    );
  }
}
