import type {
  AgentExecutionContext, AgentExecutionResult, AgentRole, TaskDefinition,
} from "@ai-harness/contracts";
import { beginTelemetry, endTelemetry } from "@ai-harness/contracts";

/** Built-ins create a standalone invocation span; an orchestrator-owned span is reused. */
export async function observeAgent(
  role: AgentRole,
  task: Readonly<TaskDefinition>,
  context: Readonly<AgentExecutionContext>,
  run: (context: Readonly<AgentExecutionContext>) => Promise<AgentExecutionResult>,
): Promise<AgentExecutionResult> {
  const span = context.telemetry && context.telemetry.context.agentRole === undefined
    ? beginTelemetry(context.telemetry, "agent", { taskId: task.id, agentRole: role })
    : undefined;
  const observed = span ? { ...context, telemetry: span.binding } : context;
  try {
    const result = await run(observed);
    endTelemetry(span, {
      status: context.signal?.aborted ? "cancelled" : result.success ? "ok" : "error",
      ...(!result.success ? { errorClass: context.signal?.aborted ? "cancelled" as const : "runtime" as const } : {}),
    });
    return result;
  } catch (error) {
    endTelemetry(span, { status: context.signal?.aborted ? "cancelled" : "error",
      errorClass: context.signal?.aborted ? "cancelled" : "runtime" });
    throw error;
  }
}
