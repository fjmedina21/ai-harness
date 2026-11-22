import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_TOOLS, ToolRegistry, ToolDispatcher } from "../index.js";
const setup = () => {
  const registry = new ToolRegistry(); registry.register(BUILTIN_TOOLS[0]!);
  const dispatcher = new ToolDispatcher(registry);
  const controller = new AbortController();
  const context = { executionId: "test", projectRoot: "/tmp", defaultDeny: true as const,
    grantedPermissions: ["files:read" as const], requireApprovalFor: [], signal: controller.signal };
  return { dispatcher, controller, context };
};
test("dispatcher never starts a pre-cancelled handler", async () => {
  const { dispatcher, controller, context } = setup(); let calls = 0;
  dispatcher.registerHandler("file.read", async () => { calls++; return {}; });
  controller.abort();
  const result = await dispatcher.dispatch({ toolId: "file.read", arguments: { path: "README.md" } }, context);
  assert.equal(result.status, "failed"); assert.equal(calls, 0);
});
test("dispatcher passes host signal and does not fabricate success after abort", async () => {
  const { dispatcher, controller, context } = setup(); let calls = 0;
  dispatcher.registerHandler("file.read", async (_args, ctx) => {
    calls++; assert.equal(ctx.signal, controller.signal); controller.abort(); return { completedEffect: true };
  });
  const result = await dispatcher.dispatch({ toolId: "file.read", arguments: { path: "README.md" } }, context);
  assert.equal(result.status, "failed"); assert.equal(calls, 1); assert.equal(result.data, undefined);
});
