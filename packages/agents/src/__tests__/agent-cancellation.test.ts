import assert from "node:assert/strict";
import test from "node:test";
import { PromptAgent, ToolAugmentedAgent } from "../index.js";
import type { AgentExecutionContext, TaskDefinition } from "@ai-harness/contracts";
const task: TaskDefinition = { id: "test", title: "Test", description: "Fixture", assignedRole: "software-architect", dependsOn: [], risk: "low", acceptanceCriteria: [] };
test("prompt agent propagates host cancellation and cannot report a late model success", async () => {
  const controller = new AbortController(); let calls = 0;
  const context: AgentExecutionContext = { executionId: "test", projectRoot: "/tmp", grantedPermissions: ["files:read"], signal: controller.signal,
    model: { id: "fixture", async complete(request) { calls++; assert.equal(request.signal, controller.signal); controller.abort(); return { model: "fixture", text: "late success" }; } } };
  const agent = new PromptAgent({ role: task.assignedRole, systemPrompt: "Fixture" });
  assert.equal((await agent.execute(task, context)).success, false);
  assert.equal((await agent.execute(task, context)).success, false);
  assert.equal(calls, 1);
});
test("augmented agent fails closed on host atomic-confinement requirement", async () => {
  let calls = 0;
  const agent = new ToolAugmentedAgent({ role: task.assignedRole, systemPrompt: "Fixture", readFiles: ["README.md"], requireApprovalFor: [], requireAtomicFilesystem: true });
  const result = await agent.execute(task, { executionId: "test", projectRoot: "/tmp", grantedPermissions: ["files:read"],
    model: { id: "fixture", async complete() { calls++; return { model: "fixture", text: "unexpected" }; } } });
  assert.equal(result.success, false); assert.equal(calls, 0);
});
