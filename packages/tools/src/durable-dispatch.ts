import type {
  DurableDispatchBinding, DurableOperation, ToolDispatchContext, ToolDispatchResult,
  ToolHandler, ToolInvocation, ToolDefinition,
} from "@ai-harness/contracts";
import { DurableStoreError } from "@ai-harness/contracts";
import { digestDurableValue } from "@ai-harness/security";

/** Called only after registry, Default Deny, permission and handler checks. */
export async function dispatchDurably(
  binding: DurableDispatchBinding, invocation: ToolInvocation,
  definition: ToolDefinition, handler: ToolHandler, context: ToolDispatchContext,
  requiresApproval: boolean, approvalId?: string,
): Promise<ToolDispatchResult> {
  const toolId = invocation.toolId;
  let op: DurableOperation | undefined;
  const failed = (error: string, status: "failed" | "denied" = "failed"): ToolDispatchResult => ({
    toolId, status, error,
    ...(op ? { operationId: op.operationId, operationState: op.state } : {}),
  });
  try {
    const identity = context.operation;
    const safety = binding.safetyByTool[toolId];
    if (!identity || !Object.hasOwn(binding.safetyByTool, toolId) ||
        (safety !== "read_only" && safety !== "side_effecting"))
      return failed("Host operation identity and safety classification required", "denied");
    const args = structuredClone(invocation.arguments) as Record<string, unknown>;
    const registered = binding.store.register({
      executionId: context.executionId, taskId: identity.taskId,
      requestId: identity.requestId, ...(identity.toolCallId ? { toolCallId: identity.toolCallId } : {}),
      projectRoot: context.projectRoot, toolId, argumentDigest: digestDurableValue(args),
      permission: definition.permission, risk: definition.risk, safety,
      requester: binding.requester, requiresApproval,
    });
    op = registered.operation;
    if (op.state === "PendingApproval" || (op.state === "Approved" && approvalId === undefined))
      return { toolId, status: "approval_required", error: "Human approval required",
        approvalId: op.approvalId, operationId: op.operationId, operationState: op.state };
    if ((registered.duplicate && op.state !== "Approved") ||
        !["Created", "Approved"].includes(op.state))
      return failed("Existing operation " + op.state + "; replay blocked", "denied");
    const prepared = binding.store.prepare(op.operationId, op.version, op.scopeDigest, approvalId);
    if (!prepared) {
      op = binding.store.get(op.operationId) ?? op;
      return failed("Authorization expired; new reviewed request required", "denied");
    }
    op = prepared;
    if (context.signal?.aborted) {
      op = binding.store.finish(op.operationId, op.version, "Cancelled");
      return failed("Cancelled before invocation; approval remains consumed");
    }
    op = binding.store.start(op.operationId, op.version);
    if (op.state !== "Running") return failed("Authorization no longer executable", "denied");
    if (context.signal?.aborted) {
      op = binding.store.finish(op.operationId, op.version, "Uncertain");
      return failed("Cancelled after Running; reconciliation required");
    }
    const data = await handler(args, {
      executionId: context.executionId, projectRoot: context.projectRoot,
      signal: context.signal, requireAtomicFilesystem: context.requireAtomicFilesystem,
    });
    if (context.signal?.aborted) {
      op = binding.store.finish(op.operationId, op.version, "Uncertain");
      return failed("Cancelled operation; effects require reconciliation");
    }
    const resultDigest = digestDurableValue(data);
    op = binding.store.finish(op.operationId, op.version, "Completed", resultDigest);
    return { toolId, status: "executed", data, operationId: op.operationId, operationState: op.state };
  } catch (error) {
    if (op) { try { op = binding.store.get(op.operationId) ?? op; } catch { /* Unknown storage state. */ } }
    if (op?.state === "Running") {
      try { op = binding.store.finish(op.operationId, op.version, "Uncertain"); }
      catch { /* Preserve durable Running/unknown outcome; never replay or claim success. */ }
    }
    if (!(error instanceof DurableStoreError && error.code === "invalid")) {
      try { binding.store.retireSession(); } catch { /* Never fall back after a storage-port failure. */ }
    }
    return failed("Durable operation blocked or uncertain; inspect journal before further action",
      error instanceof DurableStoreError && error.code === "invalid" ? "denied" : "failed");
  }
}
