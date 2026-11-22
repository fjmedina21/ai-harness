import { beginTelemetry, endTelemetry, emitTelemetry } from "@ai-harness/contracts";
import type {
  DurableDispatchBinding,
  ToolApprovalScope,
  ToolDispatchContext,
  ToolDispatchResult,
  ToolHandler,
  ToolInvocation,
} from "@ai-harness/contracts";

import { dispatchDurably } from "./durable-dispatch.js";
import { DefaultPolicyEngine } from "@ai-harness/security";
import { ToolApprovalManager } from "./approval.js";
import type { ToolRegistry } from "./index.js";

export class ToolDispatcher {
  private readonly handlers = new Map<string, ToolHandler>();
  private readonly policy = new DefaultPolicyEngine();

  constructor(
    private readonly registry: ToolRegistry,
    private readonly approvals?: ToolApprovalManager,
    private readonly durable?: DurableDispatchBinding,
  ) {
    if (durable) this.durable = { ...durable, requester: { ...durable.requester }, safetyByTool: { ...durable.safetyByTool } };
  }

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
    // Unknown model-supplied tool labels are deliberately redacted.
    const known = this.registry.get(invocation.toolId);
    const span = beginTelemetry(context.telemetry, "tool.dispatch", {
      ...(known ? { toolId: known.id } : {}),
    });
    const observed = span ? { ...context, telemetry: span.binding } : context;
    try {
      const result = await this.dispatchImpl(invocation, observed, approvalId);
      emitTelemetry(observed.telemetry, "tool.authorization", {
        ...(known ? { toolId: known.id } : {}),
        accepted: result.status === "executed",
        approvalRequired: result.status === "approval_required",
        operationId: result.operationId, operationState: result.operationState,
      });
      endTelemetry(span, {
        status: result.operationState === "Uncertain" ? "uncertain" :
          context.signal?.aborted ? "cancelled" :
          result.status === "executed" ? "ok" :
          result.status === "denied" ? "denied" :
          result.status === "approval_required" ? "blocked" : "error",
        ...(result.status !== "executed" ? { errorClass: result.status === "invalid" ? "invalid_input" as const :
          result.status === "approval_required" ? "approval" as const : result.status === "denied" ? "policy" as const :
          context.signal?.aborted ? "cancelled" as const : "tool" as const } : {}),
        operationId: result.operationId, operationState: result.operationState,
      });
      return result;
    } catch (error) {
      endTelemetry(span, { status: context.signal?.aborted ? "cancelled" : "error", errorClass: "runtime" });
      throw error;
    }
  }

  private async dispatchImpl(
    invocation: ToolInvocation, context: ToolDispatchContext, approvalId?: string,
  ): Promise<ToolDispatchResult> {
    const toolId = invocation.toolId;
    const cancelled = () => ({ toolId, status: "failed" as const, error: "Tool execution cancelled; prior effects are not rolled back" });
    if (context.signal?.aborted) return cancelled();
    const definition = this.registry.get(toolId);

    if (!definition) {
      emitTelemetry(context.telemetry, "tool.validation", { accepted: false, errorClass: "invalid_input" });
      return {
        toolId,
        status: "invalid",
        error: "Unknown tool",
      };
    }

    const validation = this.registry.validate(invocation);

    emitTelemetry(context.telemetry, "tool.validation", { toolId: definition.id, accepted: validation.valid });
    if (!validation.valid) {
      return {
        toolId,
        status: "invalid",
        error: validation.errors.join("; "),
      };
    }

    if (context.defaultDeny !== true) {
      emitTelemetry(context.telemetry, "tool.policy", { toolId, accepted: false, errorClass: "policy" });
      return {
        toolId,
        status: "denied",
        error: "Default Deny is required",
      };
    }

    if (!context.grantedPermissions.includes(definition.permission)) {
      emitTelemetry(context.telemetry, "tool.policy", { toolId, accepted: false, errorClass: "policy" });
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

    emitTelemetry(context.telemetry, "tool.policy", {
      toolId, accepted: decision.allowed,
      approvalRequired: decision.approvalRequired || context.requireApprovalFor.includes(definition.permission),
    });
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
    if (requiresApproval && !this.approvals && !this.durable && !context.durableOperations) {
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

    if (context.signal?.aborted) return cancelled();
    const durable = this.durable ?? context.durableOperations;
    if (durable) {
      if (this.durable && context.durableOperations &&
          (this.durable.store !== context.durableOperations.store ||
           JSON.stringify(this.durable.requester) !== JSON.stringify(context.durableOperations.requester) ||
           JSON.stringify(this.durable.safetyByTool) !== JSON.stringify(context.durableOperations.safetyByTool)))
        return { toolId, status: "denied", error: "Conflicting host durable bindings" };
      return dispatchDurably(durable, invocation, definition, handler, context, requiresApproval, approvalId);
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

    let handlerSpan: ReturnType<typeof beginTelemetry>;
    try {
      const args = structuredClone(invocation.arguments) as Record<
        string,
        unknown
      >;

      if (context.signal?.aborted) return cancelled();
      handlerSpan = beginTelemetry(context.telemetry, "tool.handler", { toolId });
      const result = await handler(args, {
        executionId: context.executionId,
        projectRoot: context.projectRoot,
        signal: context.signal,
        requireAtomicFilesystem: context.requireAtomicFilesystem,
      });
      if (context.signal?.aborted) {
        endTelemetry(handlerSpan, { status: "cancelled", errorClass: "cancelled" });
        return cancelled();
      }
      endTelemetry(handlerSpan, { status: "ok" });

      return {
        toolId,
        status: "executed",
        data: result,
      };
    } catch {
      endTelemetry(handlerSpan, { status: context.signal?.aborted ? "cancelled" : "error", errorClass: "tool" });
      return {
        toolId,
        status: "failed",
        error: "Tool execution failed",
      };
    }
  }
}
