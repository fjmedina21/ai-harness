import type {
  Permission,
  PolicyDecision,
  PolicyEngine,
  RiskLevel,
} from "@ai-harness/contracts";

const APPROVAL_REQUIRED: ReadonlySet<Permission> = new Set([
  "files:write",
  "shell:execute",
  "git:write",
  "deployment:execute",
]);

export class DefaultPolicyEngine implements PolicyEngine {
  authorize(
    permission: Permission,
    risk: RiskLevel,
    granted: readonly Permission[],
  ): PolicyDecision {
    if (!granted.includes(permission)) {
      return {
        allowed: false,
        approvalRequired: false,
        reason: `Permission not granted: ${permission}`,
      };
    }

    if (
      APPROVAL_REQUIRED.has(permission) ||
      risk === "high" ||
      risk === "critical"
    ) {
      return {
        allowed: false,
        approvalRequired: true,
        reason:
          `Human approval required for ${permission} ` +
          `at risk level ${risk}`,
      };
    }

    return {
      allowed: true,
      approvalRequired: false,
      reason: "Allowed by policy",
    };
  }
}

export { DurableApprovalService, digestDurableValue } from "./durable-approval.js";

export { ApprovalBroker } from "./engineering-approval-broker.js";
export * from "./github-auth.js";
