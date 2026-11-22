import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentExecutionContext,
  ModelToolRequest,
  ModelToolTurn,
  TaskDefinition,
  ToolCallingProviderAdapter,
} from "@ai-harness/contracts";

import { FixtureProvider } from "@ai-harness/providers";

import { BUILTIN_TOOLS, ToolDispatcher, ToolRegistry } from "@ai-harness/tools";

import { ToolCallingAgent } from "../index.js";

const task: TaskDefinition = {
  id: "task-001",
  title: "Review the project",
  description: "Read README.md and summarize it.",
  assignedRole: "software-architect",
  dependsOn: [],
  risk: "low",
  acceptanceCriteria: ["Provide a short summary"],
};

class ScriptedProvider implements ToolCallingProviderAdapter {
  readonly id = "scripted";
  readonly requests: ModelToolRequest[] = [];

  constructor(
    private readonly next: (
      request: ModelToolRequest,
      index: number,
    ) => ModelToolTurn | Promise<ModelToolTurn>,
  ) {}

  async completeWithTools(request: ModelToolRequest): Promise<ModelToolTurn> {
    this.requests.push(structuredClone(request));

    return this.next(request, this.requests.length - 1);
  }
}

function toolCall(
  id = "call_001",
  toolId = "file.read",
  args: Record<string, unknown> = { path: "README.md" },
): ModelToolTurn {
  return {
    kind: "tool_calls",
    calls: [
      {
        id,
        toolId,
        arguments: args,
      },
    ],
  };
}

function setup(
  provider: ToolCallingProviderAdapter,
  options: {
    permissions?: AgentExecutionContext["grantedPermissions"];
    approvalFor?: readonly ("files:read" | "shell:execute")[];
    handler?: () => Promise<unknown>;
  } = {},
) {
  const registry = new ToolRegistry();

  for (const definition of BUILTIN_TOOLS) {
    registry.register(definition);
  }

  const dispatcher = new ToolDispatcher(registry);

  let calls = 0;

  dispatcher.registerHandler("file.read", async () => {
    calls += 1;

    return options.handler
      ? options.handler()
      : { content: "Project documentation" };
  });

  const agent = new ToolCallingAgent({
    role: "software-architect",
    systemPrompt: "Review software architecture.",
    provider,
    registry,
    dispatcher,
    allowedToolIds: ["file.read"],
    requireApprovalFor: options.approvalFor ?? [],
  });

  const context: AgentExecutionContext = {
    executionId: "execution-001",
    projectRoot: "/tmp/demo",
    model: new FixtureProvider(),
    grantedPermissions: options.permissions ?? ["files:read"],
  };

  return {
    agent,
    context,
    getCalls: () => calls,
  };
}

test("executes a tool and returns its result to the model", async () => {
  const provider = new ScriptedProvider((_request, index) => {
    if (index === 0) {
      return toolCall();
    }

    return {
      kind: "message",
      text: "The project has documentation.",
    };
  });

  const { agent, context, getCalls } = setup(provider);

  const result = await agent.execute(task, context);

  assert.equal(result.success, true);
  assert.equal(getCalls(), 1);
  assert.equal(provider.requests.length, 2);
  assert.equal(provider.requests[1]?.toolResults?.[0]?.callId, "call_001");

  assert.deepEqual(provider.requests[1]?.toolResults?.[0]?.data, {
    content: "Project documentation",
  });
});

test("rejects tools outside the host allowlist", async () => {
  const provider = new ScriptedProvider(() =>
    toolCall("call_shell", "shell.execute", { command: "node --version" }),
  );

  const { agent, context, getCalls } = setup(provider);

  const result = await agent.execute(task, context);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Unauthorized/);
  assert.equal(getCalls(), 0);
});

test("rejects invalid arguments before execution", async () => {
  const provider = new ScriptedProvider(() =>
    toolCall("call_bad", "file.read", { path: 123 }),
  );

  const { agent, context, getCalls } = setup(provider);

  const result = await agent.execute(task, context);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Invalid tool arguments/);
  assert.equal(getCalls(), 0);
});

test("cannot bypass missing permissions", async () => {
  const provider = new ScriptedProvider(() => toolCall());

  const { agent, context, getCalls } = setup(provider, {
    permissions: [],
  });

  const result = await agent.execute(task, context);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /denied/);
  assert.equal(getCalls(), 0);
});

test("stops when human approval is required", async () => {
  const provider = new ScriptedProvider(() => toolCall());

  const { agent, context, getCalls } = setup(provider, {
    approvalFor: ["files:read"],
  });

  const result = await agent.execute(task, context);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Approval required/);
  assert.equal(getCalls(), 0);
});

test("rejects repeated call IDs across model turns", async () => {
  const provider = new ScriptedProvider(() => toolCall());

  const { agent, context, getCalls } = setup(provider);

  const result = await agent.execute(task, context);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /duplicate tool call/i);
  assert.equal(getCalls(), 1);
});

test("stops at the model turn limit", async () => {
  const provider = new ScriptedProvider((_request, index) =>
    toolCall(`call_${index}`),
  );

  const { agent, context, getCalls } = setup(provider);

  const result = await agent.execute(task, context);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /turn limit/);
  assert.equal(getCalls(), 4);
  assert.equal(provider.requests.length, 5);
});

test("rejects oversized tool results", async () => {
  const provider = new ScriptedProvider(() => toolCall());

  const { agent, context } = setup(provider, {
    handler: async () => ({
      content: "x".repeat(20_000),
    }),
  });

  const result = await agent.execute(task, context);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /oversized tool result/);
  assert.equal(provider.requests.length, 1);
});

test("rejects tasks assigned to another agent role", async () => {
  const provider = new ScriptedProvider(() => ({
    kind: "message",
    text: "Completed",
  }));

  const { agent, context } = setup(provider);

  const result = await agent.execute(
    {
      ...task,
      assignedRole: "backend-developer",
    },
    context,
  );

  assert.equal(result.success, false);
  assert.equal(provider.requests.length, 0);
});
