import { randomUUID } from "node:crypto";

import type {
  DurableDispatchBinding,
  Agent,
  AgentExecutionContext,
  AgentExecutionResult,
  AgentRole,
  ExecutionEvent,
  ExecutionProgressEvent,
  ExecutionResult,
  ExecutionState,
  ModelProviderAdapter,
  Permission,
  RuntimeExecution,
  RuntimeTask,
  TaskDefinition,
  RuntimeCheckpointStore,
  TelemetryObserver,
  TelemetryStatus,
} from "@ai-harness/contracts";

import { beginTelemetry, endTelemetry, emitTelemetry, traceTelemetry } from "@ai-harness/contracts";

export interface OrchestratorInput {
  executionId?: string;
  onProgress?: (event: Readonly<ExecutionProgressEvent>) => void;
  telemetry?: TelemetryObserver;
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
    if (input.executionId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(input.executionId)) {
      throw new Error("Invalid execution ID");
    }

    for (const task of input.tasks) {
      if (!this.agents.has(task.assignedRole)) {
        throw new Error(`Missing agent for role: ${task.assignedRole}`);
      }
    }

    const now = new Date().toISOString();

    const execution: RuntimeExecution = {
      id: input.executionId ?? randomUUID(),
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

    const executionSpan = beginTelemetry(traceTelemetry(input.telemetry, execution.id), "execution");
    let executionStatus: TelemetryStatus = "error";
    try {
      await input.checkpointStore?.save(structuredClone(execution));

      const artifacts: string[] = [];
      const completedOutputs = new Map<string, string>();

      this.transition(execution, "running", "execution.started");
      this.progress(input.onProgress, execution, "execution.started");
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
          for (const pending of execution.tasks.filter((candidate) => candidate.state === "pending")) {
            emitTelemetry(executionSpan?.binding, "task.blocked", {
              taskId: pending.definition.id, agentRole: pending.definition.assignedRole,
              dependencyCount: pending.definition.dependsOn.length, errorClass: "dependency",
            });
          }
          this.transition(
            execution,
            input.signal?.aborted ? "cancelled" : "failed",
            input.signal?.aborted ? "execution.cancelled" : "execution.failed",
            "No executable task found",
          );
          break;
        }

        const agent = this.agents.get(task.definition.assignedRole)!;
        const taskSpan = beginTelemetry(executionSpan?.binding, "task", {
          taskId: task.definition.id, agentRole: task.definition.assignedRole,
          dependencyCount: task.definition.dependsOn.length,
        });

        task.state = "running";
        task.startedAt = new Date().toISOString();
        task.attempts += 1;

        this.addEvent(
          execution,
          "task.started",
          `Started: ${task.definition.title}`,
          task.definition.id,
        );
        this.progress(input.onProgress, execution, "task.started", task);

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
          const agentSpan = beginTelemetry(taskSpan?.binding, "agent");
          try {
            outcome = await agent.execute(contextualTask,
              agentSpan ? { ...context, telemetry: agentSpan.binding } : context);
            endTelemetry(agentSpan, { status: input.signal?.aborted ? "cancelled" : outcome.success ? "ok" : "error",
              ...(!outcome.success ? { errorClass: input.signal?.aborted ? "cancelled" as const : "runtime" as const } : {}) });
          } catch (error) {
            endTelemetry(agentSpan, { status: input.signal?.aborted ? "cancelled" : "error",
              errorClass: input.signal?.aborted ? "cancelled" : "runtime" });
            throw error;
          }
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
          endTelemetry(taskSpan, { status: input.signal?.aborted ? "cancelled" : "error",
            errorClass: input.signal?.aborted ? "cancelled" : "runtime" });
          for (const pending of execution.tasks.filter((candidate) => candidate.state === "pending")) {
            emitTelemetry(executionSpan?.binding, "task.blocked", {
              taskId: pending.definition.id, agentRole: pending.definition.assignedRole,
              dependencyCount: pending.definition.dependsOn.length, errorClass: "dependency",
            });
          }

          this.addEvent(execution, input.signal?.aborted ? "task.cancelled" : "task.failed", task.error, task.definition.id);
          this.progress(input.onProgress, execution, input.signal?.aborted ? "task.cancelled" : "task.failed", task);

          this.transition(
            execution,
            input.signal?.aborted ? "cancelled" : "failed",
            input.signal?.aborted ? "execution.cancelled" : "execution.failed",
            `Task failed: ${task.definition.id}`,
          );
          this.progress(input.onProgress, execution, input.signal?.aborted ? "execution.cancelled" : "execution.failed");

          await input.checkpointStore?.save(structuredClone(execution));

          break;
        }

        task.state = "completed";
        endTelemetry(taskSpan, { status: "ok" });
        artifacts.push(...outcome.artifacts);
        completedOutputs.set(task.definition.id, outcome.summary);

        this.addEvent(
          execution,
          "task.completed",
          outcome.summary,
          task.definition.id,
        );
        this.progress(input.onProgress, execution, "task.completed", task);

        await input.checkpointStore?.save(structuredClone(execution));
      }

      if (
        execution.state !== "failed" &&
        execution.tasks.every((task) => task.state === "completed")
      ) {
        this.transition(execution, "completed", "execution.completed");
        this.progress(input.onProgress, execution, "execution.completed");
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

      executionStatus = execution.state === "completed" ? "ok" : execution.state === "cancelled" ? "cancelled" : "error";
      return { execution, result };
    } finally {
      endTelemetry(executionSpan, {
        status: executionStatus,
        ...(executionStatus === "ok" ? {} : { errorClass: executionStatus === "cancelled" ? "cancelled" as const : "runtime" as const }),
      });
    }
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

  private progress(
    callback: OrchestratorInput["onProgress"],
    execution: RuntimeExecution,
    type: ExecutionProgressEvent["type"],
    task?: RuntimeTask,
  ): void {
    if (!callback) return;
    try {
      callback(Object.freeze({
        executionId: execution.id,
        type,
        timestamp: new Date().toISOString(),
        executionState: execution.state,
        ...(task ? {
          taskId: task.definition.id,
          agentRole: task.definition.assignedRole,
          taskState: task.state,
        } : {}),
      }));
    } catch {
      // Progress observers are diagnostic only and cannot alter execution.
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

export { createEngineeringTaskPlan } from "./engineering-plan.js";
