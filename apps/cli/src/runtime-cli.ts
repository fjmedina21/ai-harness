import type { Permission } from "@ai-harness/contracts";
import { loadProjectConfig } from "@ai-harness/core";
import { FixtureProvider } from "@ai-harness/providers";
import { DefaultPolicyEngine } from "@ai-harness/security";
import { FileRuntimeCheckpointStore } from "@ai-harness/checkpointing";
import { runSddWorkflow } from "@ai-harness/sdd";

export interface RunOptions {
  projectRoot: string;
  request: string;
  provider: "fixture";
}

export interface RunSummary {
  executionId: string;
  status: "completed" | "failed";
  stages: string[];
}

export async function executeRun(options: RunOptions): Promise<RunSummary> {
  if (!options.request.trim()) {
    throw new Error("Request cannot be empty");
  }

  if (options.provider !== "fixture") {
    throw new Error("Phase 1 CLI supports only the fixture provider");
  }

  const config = await loadProjectConfig(options.projectRoot);

  if (config.workflows.default !== "sdd-iterative") {
    throw new Error("Unsupported default workflow");
  }

  const requiredRoles = [
    "requirements-analyst",
    "software-architect",
    "planner",
    "backend-developer",
    "validator",
  ] as const;

  for (const role of requiredRoles) {
    if (!config.agents.enabled.includes(role)) {
      throw new Error(`Required agent is disabled: ${role}`);
    }
  }

  if (!config.security.defaultDeny) {
    throw new Error("Default Deny must be enabled");
  }

  const policy = new DefaultPolicyEngine();

  const permission: Permission = "files:read";

  const decision = policy.authorize(
    permission,
    "low",
    config.security.grantedPermissions,
  );

  if (
    !decision.allowed ||
    config.security.requireApprovalFor.includes(permission)
  ) {
    throw new Error(`Execution denied by security policy: ${decision.reason}`);
  }

  const store = new FileRuntimeCheckpointStore(options.projectRoot);

  const output = await runSddWorkflow({
    projectRoot: options.projectRoot,
    request: options.request,
    model: new FixtureProvider(),
    checkpointStore: store,
  });

  return {
    executionId: output.executionId,
    status: output.status,
    stages: output.documents.map((document) => document.stage),
  };
}

export interface StatusSummary {
  executionId: string;
  state: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  tasks: Array<{
    id: string;
    state: string;
  }>;
}

export async function getRunStatus(
  projectRoot: string,
  executionId: string,
): Promise<StatusSummary> {
  // Validate that this is an initialized Harness project.
  await loadProjectConfig(projectRoot);

  const store = new FileRuntimeCheckpointStore(projectRoot);
  const execution = await store.get(executionId);

  if (!execution) {
    throw new Error(`Execution not found: ${executionId}`);
  }

  return {
    executionId: execution.id,
    state: execution.state,
    totalTasks: execution.tasks.length,
    completedTasks: execution.tasks.filter((task) => task.state === "completed")
      .length,
    failedTasks: execution.tasks.filter((task) => task.state === "failed")
      .length,
    tasks: execution.tasks.map((task) => ({
      id: task.definition.id,
      state: task.state,
    })),
  };
}
