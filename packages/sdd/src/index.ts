import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  AgentRole,
  ExecutionEvent,
  ModelProviderAdapter,
  RiskLevel,
  TaskDefinition,
  RuntimeCheckpointStore,
  TelemetryObserver,
} from "@ai-harness/contracts";

import { PromptAgent } from "@ai-harness/agents";
import { Orchestrator } from "@ai-harness/orchestrator";

export const SDD_STAGES = [
  "requirements",
  "specification",
  "planning",
  "implementation",
  "validation",
] as const;

export type SddStage = (typeof SDD_STAGES)[number];

interface StageDefinition {
  role: AgentRole;
  systemPrompt: string;
  description: string;
  risk: RiskLevel;
}

const STAGES: Record<SddStage, StageDefinition> = {
  requirements: {
    role: "requirements-analyst",
    risk: "low",
    systemPrompt:
      "You are a requirements analyst. Produce clear, " +
      "testable requirements and acceptance criteria. " +
      "Do not invent facts or claim work was performed.",
    description:
      "Analyze the request and produce functional requirements, " +
      "non-functional requirements, assumptions and acceptance criteria.",
  },
  specification: {
    role: "software-architect",
    risk: "low",
    systemPrompt:
      "You are a software architect. Produce a technical " +
      "specification based on the supplied requirements. " +
      "Identify architecture decisions, constraints and risks.",
    description:
      "Create the technical specification, interfaces, data models, " +
      "dependencies and architecture decisions.",
  },
  planning: {
    role: "planner",
    risk: "low",
    systemPrompt:
      "You are a software delivery planner. Break specifications " +
      "into small, verifiable tasks with dependencies.",
    description:
      "Create the implementation plan, ordered tasks, " +
      "dependencies and acceptance checkpoints.",
  },
  implementation: {
    role: "backend-developer",
    risk: "medium",
    systemPrompt:
      "You are a software developer. Produce an implementation " +
      "proposal based on the specification and plan. " +
      "Do not claim files have been written or commands executed.",
    description:
      "Produce a proposed implementation with code, file paths, " +
      "technical explanations and test recommendations.",
  },
  validation: {
    role: "validator",
    risk: "low",
    systemPrompt:
      "You are an independent reviewer. Review the proposed " +
      "implementation against its acceptance criteria. " +
      "Clearly distinguish static review from executed tests. " +
      "Never claim tests passed unless evidence is provided.",
    description:
      "Review completeness, consistency, risks and missing tests. " +
      "Report whether the proposal satisfies the requirements.",
  },
};

export interface SddDocument {
  stage: SddStage;
  role: AgentRole;
  content: string;
}

export interface SddInput {
  telemetry?: TelemetryObserver;
  projectRoot: string;
  request: string;
  model: ModelProviderAdapter;
  checkpointStore?: RuntimeCheckpointStore;
}

export interface SddOutput {
  executionId: string;
  status: "completed" | "failed";
  documents: SddDocument[];
  events: ExecutionEvent[];
}

function isSddStage(value: unknown): value is SddStage {
  return (
    typeof value === "string" &&
    (SDD_STAGES as readonly string[]).includes(value)
  );
}

export async function loadWorkflow(projectRoot: string): Promise<SddStage[]> {
  const file = path.join(
    path.resolve(projectRoot),
    ".ai",
    "workflows",
    "sdd-iterative.json",
  );

  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;

  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid SDD workflow");
  }

  const workflow = raw as Record<string, unknown>;

  if (
    workflow.id !== "sdd-iterative" ||
    workflow.version !== 1 ||
    !Array.isArray(workflow.steps)
  ) {
    throw new Error("Unsupported SDD workflow");
  }

  const steps = workflow.steps;

  if (
    steps.length !== SDD_STAGES.length ||
    !steps.every(isSddStage) ||
    new Set(steps).size !== SDD_STAGES.length ||
    !SDD_STAGES.every((stage) => steps.includes(stage))
  ) {
    throw new Error("Invalid SDD workflow stages");
  }

  return steps as SddStage[];
}

export function createSddTasks(
  request: string,
  stages: readonly SddStage[] = SDD_STAGES,
): TaskDefinition[] {
  if (!request.trim()) {
    throw new Error("SDD request cannot be empty");
  }

  return stages.map((stage, index) => {
    const definition = STAGES[stage];

    return {
      id: stage,
      title: `SDD: ${stage}`,
      description: [
        `Original user request:\n${request}`,
        definition.description,
      ].join("\n\n"),
      assignedRole: definition.role,
      dependsOn: index === 0 ? [] : [stages[index - 1]!],
      risk: definition.risk,
      acceptanceCriteria: [
        `Produce a clear ${stage} deliverable`,
        "Identify assumptions and unresolved questions",
        "Do not claim unverified actions were performed",
      ],
    };
  });
}

export async function runSddWorkflow(input: SddInput): Promise<SddOutput> {
  const stages = await loadWorkflow(input.projectRoot);
  const tasks = createSddTasks(input.request, stages);

  const orchestrator = new Orchestrator();

  for (const stage of stages) {
    const definition = STAGES[stage];

    orchestrator.register(
      new PromptAgent({
        role: definition.role,
        systemPrompt: definition.systemPrompt,
      }),
    );
  }

  const { execution } = await orchestrator.run({
    request: input.request,
    projectRoot: input.projectRoot,
    tasks,
    model: input.model,
    grantedPermissions: ["files:read"],
    checkpointStore: input.checkpointStore,
    telemetry: input.telemetry,
  });

  const documents: SddDocument[] = execution.events
    .filter((event) => event.type === "task.completed")
    .flatMap((event) => {
      const stage = event.taskId;

      if (!isSddStage(stage)) return [];

      return [
        {
          stage,
          role: STAGES[stage].role,
          content: event.message,
        },
      ];
    });

  return {
    executionId: execution.id,
    status: execution.state === "completed" ? "completed" : "failed",
    documents,
    events: execution.events,
  };
}
