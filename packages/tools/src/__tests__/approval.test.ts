import assert from "node:assert/strict";
import test from "node:test";

import type {
  ToolDispatchContext,
  ToolInvocation,
} from "@ai-harness/contracts";

import {
  BUILTIN_TOOLS,
  ToolApprovalManager,
  ToolDispatcher,
  ToolRegistry,
} from "../index.js";

const invocation: ToolInvocation = {
  toolId: "shell.execute",
  arguments: { command: "node --version" },
};

function context(
  overrides: Partial<ToolDispatchContext> = {},
): ToolDispatchContext {
  return {
    executionId: "execution-001",
    projectRoot: "/tmp/demo",
    defaultDeny: true,
    grantedPermissions: ["shell:execute"],
    requireApprovalFor: ["shell:execute"],
    ...overrides,
  };
}

function setup(
  manager = new ToolApprovalManager(),
  handler: () => Promise<unknown> = async () => "executed",
) {
  const registry = new ToolRegistry();

  for (const definition of BUILTIN_TOOLS) {
    registry.register(definition);
  }

  const dispatcher = new ToolDispatcher(registry, manager);

  dispatcher.registerHandler("shell.execute", handler);

  return { dispatcher, manager };
}

async function requestApproval(
  dispatcher: ToolDispatcher,
  operation: ToolInvocation = invocation,
  ctx: ToolDispatchContext = context(),
): Promise<string> {
  const result = await dispatcher.dispatch(operation, ctx);

  assert.equal(result.status, "approval_required");
  assert.ok(result.approvalId);

  return result.approvalId;
}

test("creates a pending approval request", async () => {
  const { dispatcher, manager } = setup();

  const id = await requestApproval(dispatcher);
  const record = manager.get(id);

  assert.equal(record?.status, "pending");
  assert.equal(record?.toolId, "shell.execute");
  assert.equal(record?.executionId, "execution-001");
  assert.equal(record?.permission, "shell:execute");
});

test("approved operation executes exactly once", async () => {
  let calls = 0;

  const { dispatcher, manager } = setup(new ToolApprovalManager(), async () => {
    calls += 1;
    return "ok";
  });

  const id = await requestApproval(dispatcher);

  manager.decide(id, "trusted-operator", true);

  const result = await dispatcher.dispatch(invocation, context(), id);

  assert.equal(result.status, "executed");
  assert.equal(result.data, "ok");
  assert.equal(calls, 1);
  assert.equal(manager.get(id)?.status, "consumed");
});

test("consumed approvals cannot be replayed", async () => {
  let calls = 0;

  const { dispatcher, manager } = setup(new ToolApprovalManager(), async () => {
    calls += 1;
    return "ok";
  });

  const id = await requestApproval(dispatcher);
  manager.decide(id, "trusted-operator", true);

  await dispatcher.dispatch(invocation, context(), id);

  const replay = await dispatcher.dispatch(invocation, context(), id);

  assert.equal(replay.status, "denied");
  assert.equal(calls, 1);
});

test("approval cannot authorize modified arguments", async () => {
  const { dispatcher, manager } = setup();

  const id = await requestApproval(dispatcher);
  manager.decide(id, "trusted-operator", true);

  const modified = await dispatcher.dispatch(
    {
      toolId: "shell.execute",
      arguments: {
        command: "node --help",
      },
    },
    context(),
    id,
  );

  assert.equal(modified.status, "denied");
  assert.equal(manager.get(id)?.status, "approved");
});

test("approval cannot cross execution boundaries", async () => {
  const { dispatcher, manager } = setup();

  const id = await requestApproval(dispatcher);
  manager.decide(id, "trusted-operator", true);

  const result = await dispatcher.dispatch(
    invocation,
    context({ executionId: "execution-002" }),
    id,
  );

  assert.equal(result.status, "denied");
});

test("denied approvals never execute", async () => {
  let called = false;

  const { dispatcher, manager } = setup(new ToolApprovalManager(), async () => {
    called = true;
    return null;
  });

  const id = await requestApproval(dispatcher);
  manager.decide(id, "trusted-operator", false);

  const result = await dispatcher.dispatch(invocation, context(), id);

  assert.equal(result.status, "denied");
  assert.equal(called, false);
});

test("expired approvals cannot execute", async () => {
  let clock = Date.now();

  const manager = new ToolApprovalManager(() => clock, 1_000);

  const { dispatcher } = setup(manager);

  const id = await requestApproval(dispatcher);
  manager.decide(id, "trusted-operator", true);

  clock += 1_001;

  const result = await dispatcher.dispatch(invocation, context(), id);

  assert.equal(result.status, "denied");
});

test("approval cannot bypass missing permissions", async () => {
  const { dispatcher, manager } = setup();

  const id = await requestApproval(dispatcher);
  manager.decide(id, "trusted-operator", true);

  const result = await dispatcher.dispatch(
    invocation,
    context({ grantedPermissions: [] }),
    id,
  );

  assert.equal(result.status, "denied");
});

test("a failed handler still consumes its approval", async () => {
  const { dispatcher, manager } = setup(new ToolApprovalManager(), async () => {
    throw new Error("Simulated failure");
  });

  const id = await requestApproval(dispatcher);
  manager.decide(id, "trusted-operator", true);

  const first = await dispatcher.dispatch(invocation, context(), id);

  const second = await dispatcher.dispatch(invocation, context(), id);

  assert.equal(first.status, "failed");
  assert.equal(second.status, "denied");
  assert.equal(manager.get(id)?.status, "consumed");
});
