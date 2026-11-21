import assert from "node:assert/strict";
import test from "node:test";

import type { ToolDispatchContext } from "@ai-harness/contracts";

import { BUILTIN_TOOLS, ToolDispatcher, ToolRegistry } from "./index.js";

function setup() {
  const registry = new ToolRegistry();

  for (const tool of BUILTIN_TOOLS) {
    registry.register(tool);
  }

  const dispatcher = new ToolDispatcher(registry);

  return { registry, dispatcher };
}

function context(
  overrides: Partial<ToolDispatchContext> = {},
): ToolDispatchContext {
  return {
    executionId: "execution-test",
    projectRoot: "/tmp/demo",
    defaultDeny: true,
    grantedPermissions: ["files:read"],
    requireApprovalFor: [
      "files:write",
      "shell:execute",
      "git:write",
      "deployment:execute",
    ],
    ...overrides,
  };
}

test("executes an authorized tool", async () => {
  const { dispatcher } = setup();

  dispatcher.registerHandler("file.read", async () => {
    return "Fixture file contents";
  });

  const result = await dispatcher.dispatch(
    {
      toolId: "file.read",
      arguments: { path: "README.md" },
    },
    context(),
  );

  assert.equal(result.status, "executed");
  assert.equal(result.data, "Fixture file contents");
});

test("rejects missing permissions before execution", async () => {
  const { dispatcher } = setup();
  let called = false;

  dispatcher.registerHandler("file.read", async () => {
    called = true;
    return "secret";
  });

  const result = await dispatcher.dispatch(
    {
      toolId: "file.read",
      arguments: { path: "README.md" },
    },
    context({
      grantedPermissions: [],
    }),
  );

  assert.equal(result.status, "denied");
  assert.equal(called, false);
});

test("requires approval for privileged tools", async () => {
  const { dispatcher } = setup();
  let called = false;

  dispatcher.registerHandler("file.write", async () => {
    called = true;
    return "written";
  });

  const result = await dispatcher.dispatch(
    {
      toolId: "file.write",
      arguments: {
        path: "output.txt",
        content: "test",
      },
    },
    context({
      grantedPermissions: ["files:read", "files:write"],
    }),
  );

  assert.equal(result.status, "approval_required");
  assert.equal(called, false);
});

test("project policy can require approval for reads", async () => {
  const { dispatcher } = setup();

  const result = await dispatcher.dispatch(
    {
      toolId: "file.read",
      arguments: { path: "README.md" },
    },
    context({
      requireApprovalFor: ["files:read"],
    }),
  );

  assert.equal(result.status, "approval_required");
});

test("rejects invalid arguments before calling handler", async () => {
  const { dispatcher } = setup();
  let called = false;

  dispatcher.registerHandler("file.read", async () => {
    called = true;
    return null;
  });

  const result = await dispatcher.dispatch(
    {
      toolId: "file.read",
      arguments: {
        path: 123,
        unexpected: true,
      },
    },
    context(),
  );

  assert.equal(result.status, "invalid");
  assert.equal(called, false);
});

test("rejects unknown tools and duplicate handlers", async () => {
  const { dispatcher } = setup();

  assert.throws(
    () => dispatcher.registerHandler("unknown.tool", async () => null),
    /Cannot bind unknown tool/,
  );

  dispatcher.registerHandler("file.read", async () => null);

  assert.throws(
    () => dispatcher.registerHandler("file.read", async () => null),
    /Handler already registered/,
  );

  const result = await dispatcher.dispatch(
    {
      toolId: "unknown.tool",
      arguments: {},
    },
    context(),
  );

  assert.equal(result.status, "invalid");
});

test("sanitizes handler failures", async () => {
  const { dispatcher } = setup();

  dispatcher.registerHandler("file.read", async () => {
    throw new Error("SECRET_TOKEN=private");
  });

  const result = await dispatcher.dispatch(
    {
      toolId: "file.read",
      arguments: { path: "README.md" },
    },
    context(),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.error, "Tool execution failed");
  assert.doesNotMatch(JSON.stringify(result), /SECRET_TOKEN/);
});

test("rejects a disabled Default Deny policy", async () => {
  const { dispatcher } = setup();

  const result = await dispatcher.dispatch(
    {
      toolId: "file.read",
      arguments: { path: "README.md" },
    },
    {
      ...context(),
      defaultDeny: false as true,
    },
  );

  assert.equal(result.status, "denied");
});
