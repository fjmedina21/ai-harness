import { chmod, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Agent, AgentExecutionContext, DurableOperationStore, ModelToolTurn, OperationRequest, TaskDefinition, ToolCallingProviderAdapter, ToolDispatchContext } from "@ai-harness/contracts";
import { ToolCallingSession } from "@ai-harness/contracts";
import { ToolCallingAgent } from "@ai-harness/agents";
import { inspectPendingDurableRecovery, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { Orchestrator } from "@ai-harness/orchestrator";
import { FixtureProvider, OpenAIProvider } from "@ai-harness/providers";
import { BUILTIN_TOOLS, ToolApprovalManager, ToolDispatcher, ToolRegistry } from "@ai-harness/tools";
import { EvaluationRunner, type EvaluationAssertion, type EvaluationObservation, type EvaluationScenario, type EvaluationSuite } from "./index.js";

const role = "software-architect" as const;
const task: TaskDefinition = { id: "task", title: "Fixture review", description: "Use host fixture data", assignedRole: role, dependsOn: [], risk: "low", acceptanceCriteria: ["Return fixture result"] };
const actor = { issuer: "fixture", subject: "trusted-host" };
const call = (id = "call", toolId = "file.read", args: Record<string, unknown> = { path: "fixture.txt" }): ModelToolTurn =>
  ({ kind: "tool_calls", calls: [{ id, toolId, arguments: args }] });
const equal = (fact: string, expected: string | number | boolean): EvaluationAssertion => ({ id: fact, fact, kind: "equals", expected });
const scenario = (id: string, category: EvaluationScenario["category"], assertions: readonly EvaluationAssertion[],
  execute: EvaluationScenario["execute"]): EvaluationScenario => ({ id, version: "1", category, assertions, execute });
function setup() {
  const registry = new ToolRegistry();
  for (const definition of BUILTIN_TOOLS) registry.register(definition);
  return { registry, dispatcher: new ToolDispatcher(registry) };
}
function dispatchContext(overrides: Partial<ToolDispatchContext> = {}): ToolDispatchContext {
  return { executionId: "fixture-execution", projectRoot: "/fixture", defaultDeny: true,
    grantedPermissions: ["files:read"], requireApprovalFor: [], ...overrides };
}
async function invokeAgent(next: (turn: number) => ModelToolTurn, options: { signal?: AbortSignal; throws?: boolean; approval?: boolean } = {}) {
  const { registry, dispatcher } = setup();
  let modelCalls = 0, toolCalls = 0;
  dispatcher.registerHandler("file.read", async () => { toolCalls++; if (options.throws) throw new Error("fixture-private-content"); return { value: "fixture" }; });
  const provider: ToolCallingProviderAdapter = { id: "fixture", async completeWithTools() { return next(modelCalls++); } };
  const agent = new ToolCallingAgent({ role, systemPrompt: "Use controlled fixture data", provider, registry, dispatcher,
    allowedToolIds: ["file.read"], requireApprovalFor: options.approval ? ["files:read"] : [] });
  const context: AgentExecutionContext = { executionId: "fixture-execution", projectRoot: "/fixture", model: new FixtureProvider(),
    grantedPermissions: ["files:read"], signal: options.signal };
  const result = await agent.execute(task, context);
  return { result, modelCalls, toolCalls };
}
async function journalFixture<T>(run: (store: DurableOperationStore, filename: string) => Promise<T>): Promise<T> {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "harness-evaluation-")));
  await chmod(directory, 0o700);
  let store: DurableOperationStore | undefined;
  try { store = await openSqliteOperationJournal(path.join(directory, "operations.db")); return await run(store, path.join(directory, "operations.db")); }
  finally { try { store?.close(); } catch { /* fixture may close before reopening */ } await rm(directory, { recursive: true, force: true }); }
}
function operationRequest(overrides: Partial<OperationRequest> = {}): OperationRequest {
  return { executionId: "fixture-execution", taskId: "task", requestId: "request", toolCallId: "call", projectRoot: "/fixture",
    toolId: "file.read", argumentDigest: "a".repeat(64), permission: "files:read", risk: "low", safety: "read_only",
    requester: actor, requiresApproval: true, ...overrides };
}
function facts(values: EvaluationObservation["facts"], metrics?: EvaluationObservation["metrics"]): EvaluationObservation { return { facts: values, ...(metrics ? { metrics } : {}) }; }

/** Offline host fixtures only. Passing these finite scenarios does not establish general agent quality. */
export function createDeterministicEvaluationSuite(): EvaluationSuite {
  const scenarios: EvaluationScenario[] = [
    scenario("functional.tool-roundtrip", "functional", [equal("completed", true), equal("modelCalls", 2), equal("toolCalls", 1)], async () => {
      const run = await invokeAgent(turn => turn === 0 ? call() : { kind: "message", text: "Fixture accepted" });
      return facts({ completed: run.result.success, modelCalls: run.modelCalls, toolCalls: run.toolCalls }, { modelCalls: run.modelCalls, toolCalls: run.toolCalls });
    }),
    scenario("functional.dependencies", "functional", [equal("completed", true), equal("dependencyOrder", true)], async () => {
      const orchestrator = new Orchestrator(); const observed: string[] = [];
      const agent: Agent = { role, async execute(input) { observed.push(input.id); return { success: true, summary: "fixture", artifacts: [] }; } };
      orchestrator.register(agent);
      const result = await orchestrator.run({ request: "fixture", projectRoot: "/fixture", model: new FixtureProvider(),
        tasks: [{ ...task, id: "second", dependsOn: ["first"] }, { ...task, id: "first" }] });
      return facts({ completed: result.result.state === "completed", dependencyOrder: observed.join(",") === "first,second" });
    }),
    scenario("security.default-deny", "security", [equal("denied", true), equal("handlerCalls", 0)], async () => {
      const { dispatcher } = setup(); let calls = 0; dispatcher.registerHandler("file.read", async () => { calls++; return null; });
      const result = await dispatcher.dispatch({ toolId: "file.read", arguments: { path: "fixture.txt" } }, dispatchContext({ grantedPermissions: [] }));
      return facts({ denied: result.status === "denied", handlerCalls: calls });
    }),
    scenario("security.default-deny-required", "security", [equal("denied", true)], async () => {
      const { dispatcher } = setup(); dispatcher.registerHandler("file.read", async () => null);
      const result = await dispatcher.dispatch({ toolId: "file.read", arguments: { path: "fixture.txt" } }, dispatchContext({ defaultDeny: false as true }));
      return facts({ denied: result.status === "denied" });
    }),
    scenario("security.tool-allowlist", "security", [equal("blocked", true), equal("toolCalls", 0)], async () => {
      const run = await invokeAgent(() => call("call", "shell.execute", { command: "node --version" }));
      return facts({ blocked: !run.result.success, toolCalls: run.toolCalls });
    }),
    scenario("security.self-approval-rejected", "security", [equal("denied", true), equal("handlerCalls", 0)], async () => {
      const { registry } = setup(); const dispatcher = new ToolDispatcher(registry, new ToolApprovalManager()); let calls = 0;
      dispatcher.registerHandler("file.read", async () => { calls++; return null; });
      const result = await dispatcher.dispatch({ toolId: "file.read", arguments: { path: "fixture.txt" } },
        dispatchContext({ requireApprovalFor: ["files:read"] }), "model-claims-approved");
      return facts({ denied: result.status === "denied", handlerCalls: calls });
    }),
    scenario("security.malformed-arguments", "security", [equal("blocked", true), equal("toolCalls", 0)], async () => {
      const run = await invokeAgent(() => call("call", "file.read", { path: 42 }));
      return facts({ blocked: !run.result.success, toolCalls: run.toolCalls });
    }),
    scenario("security.approval-stops-loop", "security", [equal("blocked", true), equal("modelCalls", 1), equal("toolCalls", 0)], async () => {
      const run = await invokeAgent(() => call(), { approval: true });
      return facts({ blocked: !run.result.success, modelCalls: run.modelCalls, toolCalls: run.toolCalls });
    }),
    scenario("security.durable-one-use", "security", [equal("firstExecuted", true), equal("replayBlocked", true), equal("consumed", true), equal("handlerCalls", 1)], async () =>
      journalFixture(async store => {
        const { registry } = setup();
        const dispatcher = new ToolDispatcher(registry, undefined, { store, requester: actor, safetyByTool: { "file.read": "read_only" } });
        let calls = 0; dispatcher.registerHandler("file.read", async () => { calls++; return { fixture: true }; });
        const invocation = { toolId: "file.read", arguments: { path: "fixture.txt" } };
        const context = dispatchContext({ requireApprovalFor: ["files:read"], operation: { taskId: "task", requestId: "request", toolCallId: "call" } });
        const pending = await dispatcher.dispatch(invocation, context);
        store.decide(pending.approvalId!, actor, true);
        const first = await dispatcher.dispatch(invocation, context, pending.approvalId);
        const replay = await dispatcher.dispatch(invocation, context, pending.approvalId);
        return facts({ firstExecuted: first.status === "executed", replayBlocked: replay.status === "denied",
          consumed: store.approval(pending.approvalId!)?.status === "consumed", handlerCalls: calls });
      })),
    scenario("security.approval-after-reopen", "security", [equal("reopenBlocked", true), equal("persisted", true)], async () =>
      journalFixture(async (store, filename) => {
        let operation = store.register(operationRequest()).operation; store.decide(operation.approvalId!, actor, true);
        operation = store.get(operation.operationId)!; store.close();
        const reopened = await openSqliteOperationJournal(filename);
        try {
          let blocked = false; try { reopened.prepare(operation.operationId, operation.version, operation.scopeDigest, operation.approvalId); } catch { blocked = true; }
          return facts({ reopenBlocked: blocked, persisted: reopened.approval(operation.approvalId!)?.status === "approved" });
        } finally { reopened.close(); }
      })),
    scenario("reliability.cancellation", "reliability", [equal("cancelled", true), equal("modelCalls", 0), equal("toolCalls", 0)], async () => {
      const controller = new AbortController(); controller.abort();
      const run = await invokeAgent(() => ({ kind: "message", text: "unused" }), { signal: controller.signal });
      return facts({ cancelled: !run.result.success, modelCalls: run.modelCalls, toolCalls: run.toolCalls });
    }),
    scenario("reliability.provider-timeout", "reliability", [equal("timedOut", true)], async ({ signal }) => {
      const provider = new OpenAIProvider({ model: "fixture-model", apiKey: "fixture-not-a-credential", timeoutMs: 5,
        fetcher: async () => new Promise<Response>(() => {}) });
      let timedOut = false;
      try { await provider.complete({ system: "fixture", prompt: "fixture", correlationId: "fixture", signal }); }
      catch (error) { timedOut = error instanceof Error && /timed out/.test(error.message); }
      return facts({ timedOut });
    }),
    scenario("reliability.incomplete-response", "reliability", [equal("blocked", true)], async () => {
      const provider = new OpenAIProvider({ model: "fixture-model", apiKey: "fixture-not-a-credential",
        fetcher: async () => Response.json({ status: "incomplete", output_text: "untrusted partial" }) });
      let blocked = false;
      try { await provider.complete({ system: "fixture", prompt: "fixture", correlationId: "fixture" }); } catch { blocked = true; }
      return facts({ blocked });
    }),
    scenario("reliability.invalid-response", "reliability", [equal("blocked", true), equal("toolCalls", 0)], async () => {
      const run = await invokeAgent(() => ({ kind: "unexpected", content: "untrusted" } as unknown as ModelToolTurn));
      return facts({ blocked: !run.result.success, toolCalls: run.toolCalls });
    }),
    scenario("reliability.invalid-history", "reliability", [equal("blocked", true)], async () => {
      const session = new ToolCallingSession({ executionId: "fixture", taskId: "task" });
      try {
        session.recordTurn(session.identity, call());
        let blocked = false; try { session.continuation(); } catch { blocked = true; }
        return facts({ blocked });
      } finally { session.close(); }
    }),
    scenario("reliability.tool-failure", "reliability", [equal("blocked", true), equal("sanitized", true)], async () => {
      const run = await invokeAgent(() => call(), { throws: true });
      return facts({ blocked: !run.result.success, sanitized: !JSON.stringify(run.result).includes("fixture-private-content") });
    }),
    scenario("reliability.conservative-recovery", "reliability", [equal("reconcile", true), equal("retryForbidden", true), equal("uncertain", true)], async () =>
      journalFixture(async (store, filename) => {
        let operation = store.register(operationRequest({ requiresApproval: false })).operation;
        operation = store.prepare(operation.operationId, operation.version, operation.scopeDigest)!;
        operation = store.start(operation.operationId, operation.version); store.close();
        const reopened = await openSqliteOperationJournal(filename);
        try {
          const decision = inspectPendingDurableRecovery(reopened)[0]!;
          operation = reopened.reconcile(operation.operationId, operation.version, actor, { kind: "host_quiesced", reference: "fixture-workers-stopped" });
          return facts({ reconcile: decision.action === "reconcile", retryForbidden: decision.retryAllowed === false, uncertain: operation.state === "Uncertain" });
        } finally { reopened.close(); }
      })),
    scenario("reliability.stable-duplicates", "reliability", [equal("sameOperation", true), equal("duplicate", true), equal("count", 1)], async () =>
      journalFixture(async store => {
        const first = store.register(operationRequest({ requiresApproval: false }));
        const next = store.register(operationRequest({ requiresApproval: false }));
        return facts({ sameOperation: first.operation.operationId === next.operation.operationId, duplicate: next.duplicate, count: store.list("fixture-execution").length });
      })),
    scenario("efficiency.bounded-turns", "efficiency", [equal("blocked", true), equal("modelCalls", 5), equal("toolCalls", 4)], async () => {
      const run = await invokeAgent(turn => call("call-" + turn));
      return facts({ blocked: !run.result.success, modelCalls: run.modelCalls, toolCalls: run.toolCalls }, { modelCalls: run.modelCalls, toolCalls: run.toolCalls });
    }),
  ];
  return { id: "deterministic", version: "1", configurationId: "offline-fixtures-v1", scenarios };
}
export async function runDeterministicEvaluations() { return new EvaluationRunner().run(createDeterministicEvaluationSuite()); }
