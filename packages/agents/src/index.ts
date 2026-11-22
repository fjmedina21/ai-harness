import { randomUUID } from "node:crypto";

import type {
  Agent,
  AgentRole,
  AgentExecutionContext,
  AgentExecutionResult,
  TaskDefinition,
} from "@ai-harness/contracts";

export interface PromptAgentOptions {
  role: AgentRole;
  systemPrompt: string;
}

export class PromptAgent implements Agent {
  readonly role: AgentRole;
  private readonly systemPrompt: string;

  constructor(options: PromptAgentOptions) {
    this.role = options.role;
    this.systemPrompt = options.systemPrompt;
  }

  async execute(
    task: Readonly<TaskDefinition>,
    context: Readonly<AgentExecutionContext>,
  ): Promise<AgentExecutionResult> {
    if (task.assignedRole !== this.role) {
      return {
        success: false,
        summary: "Agent role mismatch",
        artifacts: [],
        error: `Task requires ${task.assignedRole}`,
      };
    }

    const cancelled = (): AgentExecutionResult => ({ success: false, summary: "Execution cancelled", artifacts: [], error: "Execution cancelled" });
    if (context.signal?.aborted) return cancelled();
    let response;
    try {
      response = await context.model.complete({
      signal: context.signal,
      system: this.systemPrompt,
      prompt: [
        `Task: ${task.title}`,
        `Description: ${task.description}`,
        `Acceptance criteria:`,
        ...task.acceptanceCriteria.map((item) => `- ${item}`),
      ].join("\n"),
      correlationId: `${context.executionId}:${task.id}:${randomUUID()}`,
      });
    } catch (error) {
      if (context.signal?.aborted) return cancelled();
      throw error;
    }
    if (context.signal?.aborted) return cancelled();

    return {
      success: true,
      summary: response.text,
      artifacts: [],
      usage: response.usage,
    };
  }
}
export { ToolAugmentedAgent } from "./tool-augmented-agent.js";

export type { ToolAugmentedAgentOptions } from "./tool-augmented-agent.js";

export { ToolCallingAgent } from "./tool-calling-agent.js";

export type { ToolCallingAgentOptions } from "./tool-calling-agent.js";

export { createReadOnlyToolCallingAgent } from "./read-only-tool-calling.js";
export type { ReadOnlyToolCallingOptions } from "./read-only-tool-calling.js";
