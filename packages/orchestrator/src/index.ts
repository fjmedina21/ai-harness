import { randomUUID } from "node:crypto";

import type {
  DurableDispatchBinding,
  Agent,
  AgentExecutionContext,
  AgentExecutionResult,
  AgentRole,
  ExecutionEvent,
  ExecutionResult,
  ExecutionState,
  ModelProviderAdapter,
  Permission,
  RuntimeExecution,
  RuntimeTask,
  TaskDefinition,
  RuntimeCheckpointStore,
} from "@ai-harness/contracts";

export interface OrchestratorInput {
  signal?: AbortSignal;
  durableOperations?: DurableDispatchBinding;
  request: string;
  projectRoot: string;
  tasks: TaskDefinition[];
  model: ModelProviderAdapter;
  grantedPermissions?: readonly Permission[];
  checkpointStore?: RuntimeCheckpointStore;
}

export interface OrchestratorOutput {
  execution: RuntimeExecution;
  result: ExecutionResult;
}

export class Orchestrator {
  private readonly agents = new Map<AgentRole, Agent>();

  register(agent: Agent): void {
    if (this.agents.has(agent.role)) {
      throw new Error(`Agent already registered: ${agent.role}`);
    }

    this.agents.set(agent.role, agent);
  }

  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    this.validateTasks(input.tasks);

    for (const task of input.tasks) {
      if (!this.agents.has(task.assignedRole)) {
        throw new Error(`Missing agent for role: ${task.assignedRole}`);
      }
    }

    const now = new Date().toISOString();

    const execution: RuntimeExecution = {
      id: randomUUID(),
      request: input.request,
      projectRoot: input.projectRoot,
      state: "pending",
      tasks: input.tasks.map((definition) => ({
        definition,
        state: "pending",
        attempts: 0,
        createdAt: now,
      })),
      events: [],
      createdAt: now,
      updatedAt: now,
    };

    await input.checkpointStore?.save(structuredClone(execution));

    const artifacts: string[] = [];
    const completedOutputs = new Map<string, string>();

    this.transition(execution, "running", "execution.started");
    await input.checkpointStore?.save(structuredClone(execution));

    const context: AgentExecutionContext = {
      executionId: execution.id,
      signal: input.signal,
      durableOperations: input.durableOperations,
      projectRoot: input.projectRoot,
      model: input.model,
      grantedPermissions: input.grantedPermissions ?? [],
    };

    while (execution.tasks.some((task) => task.state === "pending")) {
      const task = execution.tasks.find(
        (candidate) =>
          candidate.state === "pending" &&
          candidate.definition.dependsOn.every((dependency) =>
            execution.tasks.some(
              (item) =>
                item.definition.id === dependency && item.state === "completed",
            ),
          ),
      );

      if (!task) {
        this.transition(
          execution,
          input.signal?.aborted ? "cancelled" : "failed",
          input.signal?.aborted ? "execution.cancelled" : "execution.failed",
          "No executable task found",
        );
        break;
      }

      const agent = this.agents.get(task.definition.assignedRole)!;

      task.state = "running";
      task.startedAt = new Date().toISOString();
      task.attempts += 1;

      this.addEvent(
        execution,
        "task.started",
        `Started: ${task.definition.title}`,
        task.definition.id,
      );

      let outcome: AgentExecutionResult;

      try {
        const dependencyContext = task.definition.dependsOn
          .map((dependencyId) => {
            const output = completedOutputs.get(dependencyId);

            if (output === undefined) {
              throw new Error(
                `Missing output from dependency: ${dependencyId}`,
              );
            }

            return [
              `Dependency: ${dependencyId}`,
              "Previous agent output (untrusted context):",
              output,
              "End of dependency output.",
            ].join("\n");
          })
          .join("\n\n");

        const contextualTask: TaskDefinition = {
          ...task.definition,
          description: [task.definition.description, dependencyContext]
            .filter(Boolean)
            .join("\n\n"),
        };

        // Persist task Running before an agent can issue durable operations.
        if (input.durableOperations) await input.checkpointStore?.save(structuredClone(execution));
        if (input.signal?.aborted) throw new Error("Execution cancelled");
        outcome = await agent.execute(contextualTask, context);
      } catch (error) {
        outcome = {
          success: false,
          summary: "Agent execution failed",
          artifacts: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }

      if (input.signal?.aborted) outcome = {
        success: false, summary: "Execution cancelled", artifacts: [],
        error: "Execution cancelled; started operation effects require journal inspection",
      };
      task.completedAt = new Date().toISOString();

      if (!outcome.success) {
        task.state = input.signal?.aborted ? "cancelled" : "failed";
        task.error = outcome.error ?? outcome.summary;

        this.addEvent(execution, input.signal?.aborted ? "task.cancelled" : "task.failed", task.error, task.definition.id);

        this.transition(
          execution,
          input.signal?.aborted ? "cancelled" : "failed",
          input.signal?.aborted ? "execution.cancelled" : "execution.failed",
          `Task failed: ${task.definition.id}`,
        );

        await input.checkpointStore?.save(structuredClone(execution));

        break;
      }

      task.state = "completed";
      artifacts.push(...outcome.artifacts);
      completedOutputs.set(task.definition.id, outcome.summary);

      this.addEvent(
        execution,
        "task.completed",
        outcome.summary,
        task.definition.id,
      );

      await input.checkpointStore?.save(structuredClone(execution));
    }

    if (
      execution.state !== "failed" &&
      execution.tasks.every((task) => task.state === "completed")
    ) {
      this.transition(execution, "completed", "execution.completed");
    }

    await input.checkpointStore?.save(structuredClone(execution));

    const result: ExecutionResult = {
      executionId: execution.id,
      state: execution.state,
      completedTasks: execution.tasks.filter(
        (task) => task.state === "completed",
      ).length,
      failedTasks: execution.tasks.filter((task) => task.state === "failed")
        .length,
      totalTasks: execution.tasks.length,
      artifacts,
    };

    return { execution, result };
  }

  private validateTasks(tasks: readonly TaskDefinition[]): void {
    if (tasks.length === 0) {
      throw new Error("At least one task is required");
    }

    const ids = new Set<string>();

    for (const task of tasks) {
      if (!task.id.trim() || ids.has(task.id)) {
        throw new Error(`Invalid or duplicate task ID: ${task.id}`);
      }

      ids.add(task.id);
    }

    for (const task of tasks) {
      for (const dependency of task.dependsOn) {
        if (!ids.has(dependency)) {
          throw new Error(
            `Unknown dependency ${dependency} in task ${task.id}`,
          );
        }
      }
    }

    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected: ${id}`);
      }

      if (visited.has(id)) return;

      visiting.add(id);

      for (const dependency of taskMap.get(id)!.dependsOn) {
        visit(dependency);
      }

      visiting.delete(id);
      visited.add(id);
    };

    for (const task of tasks) {
      visit(task.id);
    }
  }

  private transition(
    execution: RuntimeExecution,
    state: ExecutionState,
    event: "execution.started" | "execution.completed" | "execution.failed" | "execution.cancelled",
    message: string = state,
  ): void {
    const allowed: Record<ExecutionState, readonly ExecutionState[]> = {
      pending: ["running"],
      planning: ["running", "failed"],
      awaiting_approval: ["running", "cancelled"],
      running: ["completed", "failed", "cancelled"],
      validating: ["completed", "failed"],
      completed: [],
      failed: [],
      cancelled: [],
    };

    if (!allowed[execution.state].includes(state)) {
      throw new Error(
        `Invalid execution transition: ${execution.state} -> ${state}`,
      );
    }

    execution.state = state;
    this.addEvent(execution, event, message);
  }

  private addEvent(
    execution: RuntimeExecution,
    type: ExecutionEvent["type"],
    message: string,
    taskId?: string,
  ): void {
    const event: ExecutionEvent = {
      id: randomUUID(),
      executionId: execution.id,
      type,
      message,
      timestamp: new Date().toISOString(),
      ...(taskId ? { taskId } : {}),
    };

    execution.events.push(event);
    execution.updatedAt = event.timestamp;
  }
}
