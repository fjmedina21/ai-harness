import type {
  ToolApprovalScope,
  ToolDispatchContext,
  ToolDispatchResult,
  ToolHandler,
  ToolInvocation,
} from "@ai-harness/contracts";

import { DefaultPolicyEngine } from "@ai-harness/security";
import { ToolApprovalManager } from "./approval.js";
import type { ToolRegistry } from "./index.js";

export class ToolDispatcher {
  private readonly handlers = new Map<string, ToolHandler>();
  private readonly policy = new DefaultPolicyEngine();

  constructor(
    private readonly registry: ToolRegistry,
    private readonly approvals?: ToolApprovalManager,
  ) {}

  registerHandler(toolId: string, handler: ToolHandler): void {
    if (!this.registry.get(toolId)) {
      throw new Error(`Cannot bind unknown tool: ${toolId}`);
    }

    if (this.handlers.has(toolId)) {
      throw new Error(`Handler already registered: ${toolId}`);
    }

    this.handlers.set(toolId, handler);
  }

  async dispatch(
    invocation: ToolInvocation,
    context: ToolDispatchContext,
    approvalId?: string,
  ): Promise<ToolDispatchResult> {
    const toolId = invocation.toolId;
    const definition = this.registry.get(toolId);

    if (!definition) {
      return {
        toolId,
        status: "invalid",
        error: "Unknown tool",
      };
    }

    const validation = this.registry.validate(invocation);

    if (!validation.valid) {
      return {
        toolId,
        status: "invalid",
        error: validation.errors.join("; "),
      };
    }

    if (context.defaultDeny !== true) {
      return {
        toolId,
        status: "denied",
        error: "Default Deny is required",
      };
    }

    if (!context.grantedPermissions.includes(definition.permission)) {
      return {
        toolId,
        status: "denied",
        error: "Required permission is not granted",
      };
    }

    const decision = this.policy.authorize(
      definition.permission,
      definition.risk,
      context.grantedPermissions,
    );

    if (!decision.allowed && !decision.approvalRequired) {
      return {
        toolId,
        status: "denied",
        error: decision.reason,
      };
    }

    const requiresApproval =
      decision.approvalRequired ||
      context.requireApprovalFor.includes(definition.permission);

    // A supplied approval ID must not affect operations
    // that are already authorized without approval.
    if (!requiresApproval && approvalId !== undefined) {
      return {
        toolId,
        status: "invalid",
        error: "Approval not required",
      };
    }

    // An operation that requires approval must never
    // be executed without an approval mechanism.
    //
    // Without an approval manager, preserve the
    // approval_required result even if no handler exists.
    if (requiresApproval && !this.approvals) {
      return {
        toolId,
        status: "approval_required",
        error: "Human approval required",
      };
    }

    // A real approval must only be issued when
    // the corresponding handler exists.
    const handler = this.handlers.get(toolId);

    if (!handler) {
      return {
        toolId,
        status: "failed",
        error: "No handler registered for this tool",
      };
    }

    if (requiresApproval) {
      const scope: ToolApprovalScope = {
        executionId: context.executionId,
        projectRoot: context.projectRoot,
        toolId,
        arguments: invocation.arguments,
        permission: definition.permission,
        risk: definition.risk,
      };

      // The previous guard ensures an approval manager
      // exists when execution reaches this point.
      const approvals = this.approvals!;

      if (approvalId === undefined) {
        const approval = approvals.request(scope);

        return {
          toolId,
          status: "approval_required",
          approvalId: approval.id,
          error: "Human approval required",
        };
      }

      if (!approvals.consume(approvalId, scope)) {
        return {
          toolId,
          status: "denied",
          error: "Invalid, expired or consumed approval",
        };
      }
    }

    try {
      const args = structuredClone(invocation.arguments) as Record<
        string,
        unknown
      >;

      const result = await handler(args, {
        executionId: context.executionId,
        projectRoot: context.projectRoot,
      });

      return {
        toolId,
        status: "executed",
        data: result,
      };
    } catch {
      return {
        toolId,
        status: "failed",
        error: "Tool execution failed",
      };
    }
  }
}
