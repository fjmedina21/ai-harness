export interface VerifiedApprover {
  /**
   * Stable identity returned by a trusted identity provider.
   */
  subject: string;
  issuer: string;

  /**
   * Authorization roles verified by the host.
   */
  roles: readonly string[];
}

export interface ApproverIdentityVerifier {
  /**
   * Must cryptographically validate the credential,
   * including issuer, audience, signature and expiry
   * where applicable.
   *
   * The model must never implement or invoke this
   * verification interface.
   */
  verify(credential: string): Promise<VerifiedApprover>;
}

export type ApprovalAuditEventType =
  | "approval.requested"
  | "approval.decision_authorized";

export interface ApprovalAuditEvent {
  eventId: string;
  type: ApprovalAuditEventType;
  timestamp: string;
  approvalId: string;
  executionId: string;
  toolId: string;
  argumentDigest: string;
  actor?: string;
  decision?: "approved" | "denied";
}
