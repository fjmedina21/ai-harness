import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EngineeringCheckpointStore, openSqliteOperationJournal, inspectDurableRecovery } from "@ai-harness/checkpointing";
import { FixtureEngineeringAgent, runEngineeringWorkflow, type EngineeringOptions } from "@ai-harness/application";
import { engineeringHash, engineeringPath, PodmanEngineeringValidator, EngineeringValidationRegistry } from "@ai-harness/tools";
import type { ValidationEvidence, WorkspaceSnapshot } from "@ai-harness/contracts";
import { EvaluationRunner, type EvaluationScenario, type EvaluationSuite, type EvaluationValue } from "./index.js";
async function fixture(run: (options: EngineeringOptions) => Promise<Record<string, EvaluationValue>>) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "harness-eval-phase9-"))), source = path.join(root, "source"), workspaces = path.join(root, "workspaces"), state = path.join(root, "state");
  for (const directory of [source, workspaces, state]) await mkdir(directory, { mode: 0o700 });
  await writeFile(path.join(source, "value.ts"), "fixture-before\n", { mode: 0o600 });
  const store = await openSqliteOperationJournal(path.join(state, "ops.sqlite"));
  try { return { facts: await run({ projectRoot: source, request: "host-authored fixture", files: ["value.ts"], level: 2,
    agent: new FixtureEngineeringAgent("value.ts", "fixture-after\n"),
    budget: { maxIterations: 3, maxRequests: 16, maxTokens: 16, maxEstimatedCostUsd: 0, timeoutMs: 5000, maxFiles: 4, maxBytes: 8192 },
    policy: { version: "phase9-eval", allowedPaths: ["value.ts"], allowedOperations: ["replace"], maxFiles: 1, maxBytes: 8192 },
    workspace: { directory: workspaces, binding: { store, requester: { issuer: "fixture", subject: "requester" }, safetyByTool: {} }, createAuthorized: true, ttlMs: 60000 },
    checkpoint: new EngineeringCheckpointStore(state), async requestApproval(r) { store.decide(r.approvalId, { issuer: "fixture", subject: "human" }, true); return r.approvalId; } }) }; }
  finally { store.close(); await rm(root, { recursive: true, force: true }); }
}
function evidence(s: WorkspaceSnapshot, w: string): ValidationEvidence { return { snapshotDigest: s.digest, workspaceId: w, kind: "fixture", profile: "fixture", environment: "fixture", validationId: "unit", durationMs: 1, exitCode: 1, result: "failed", cleanup: "confirmed", logDigest: engineeringHash("same-error"), passedChecks: [], resources: { cpu: 0.5, memoryBytes: 268435456, pids: 64 } }; }
export function createPhase9EvaluationSuite(): EvaluationSuite {
  const scenario = (id: string, category: EvaluationScenario["category"], execute: EvaluationScenario["execute"]): EvaluationScenario => ({ id, version: "1", category, execute, assertions: [{ id: "accepted", fact: "accepted", kind: "equals", expected: true }] });
  return { id: "phase9", version: "1", configurationId: "offline-engineering-fixtures-v1", scenarios: [
    scenario("functional.proposal", "functional", () => fixture(async o => { const r = await runEngineeringWorkflow({ ...o, level: 1, workspace: undefined, checkpoint: undefined }); return { accepted: r.state === "Proposed" && r.patches.length === 1 && await readFile(path.join(o.projectRoot, "value.ts"), "utf8") === "fixture-before\n" }; })),
    scenario("functional.isolated-application", "functional", () => fixture(async o => { const r = await runEngineeringWorkflow(o); return { accepted: r.patches[0]?.status === "applied" && r.state === "ReviewPending" && !r.integrated && await readFile(path.join(o.projectRoot, "value.ts"), "utf8") === "fixture-before\n" }; })),
    scenario("security.approval-boundary", "security", () => fixture(async o => { const r = await runEngineeringWorkflow({ ...o, requestApproval: undefined }); return { accepted: r.termination === "approval_required" && r.patches[0]?.status === "proposed" }; })),
    scenario("security.path-boundary", "security", async () => { let blocked = 0; for (const p of ["../escape", "/absolute", "a/.git/config", "a/.env", "node_modules/a", "a.pem"]) try { engineeringPath(p); } catch { blocked++; } return { facts: { accepted: blocked === 6 } }; }),
    scenario("security.sandbox-blocked", "security", () => fixture(async o => { const r = await runEngineeringWorkflow({ ...o, level: 3, realValidationRequested: true }); return { accepted: !new PodmanEngineeringValidator().available && r.termination === "sandbox_blocked" && r.usage.requests === 0 }; })),
    scenario("security.resource-exhaustion", "security", async () => { let blocked = false; try { new EngineeringValidationRegistry().register({ id: "hostile", intent: "build", image: "example.invalid/fixture@sha256:" + "1".repeat(64), argv: ["node", "--version"], timeoutMs: 1000, maxLogBytes: 1024, resources: { cpu: 1, memoryBytes: 268435456, pids: 64 } }); } catch { blocked = true; } return { facts: { accepted: blocked } }; }),
    scenario("reliability.cleanup-uncertainty", "reliability", () => fixture(async o => { const r = await runEngineeringWorkflow({ ...o, level: 3, validation: { kind: "fixture", async validate(s, w) { return { ...evidence(s, w), cleanup: "uncertain" }; } } }); return { accepted: r.state === "Uncertain" && inspectDurableRecovery(o.workspace!.binding.store, r.executionId).some(d => !d.retryAllowed && d.action === "blocked") }; })),
    scenario("reliability.repair-termination", "reliability", () => fixture(async o => { let count = 0; const agent = { ...o.agent, id: "fixture", mode: "fixture" as const, maxTokensPerRequest: 1, maxEstimatedCostUsdPerRequest: 0, execute: async (i: Parameters<typeof o.agent.execute>[0]) => new FixtureEngineeringAgent("value.ts", "fixture-after-" + ++count).execute(i) };
      const r = await runEngineeringWorkflow({ ...o, level: 3, agent, validation: { kind: "fixture", async validate(s, w) { return evidence(s, w); } } }); return { accepted: r.termination === "no_progress" && r.validations.length === 2 && r.repairAttempts === 1 }; })),
    scenario("reliability.review-state", "reliability", () => fixture(async o => { const r = await runEngineeringWorkflow({ ...o, humanReview: async () => true }); return { accepted: r.state === "Completed" && r.reviewed && !r.integrated && r.levelAvailable === 2 && r.l3Gate === "blocked" }; })),
    scenario("efficiency.request-budget", "efficiency", () => fixture(async o => { const r = await runEngineeringWorkflow({ ...o, budget: { ...o.budget, maxRequests: 1 } }); return { accepted: r.termination === "budget" && r.usage.requests === 1 && r.patches.length === 0 }; })),
  ] };
}
export async function runPhase9Evaluations() { return new EvaluationRunner().run(createPhase9EvaluationSuite()); }
