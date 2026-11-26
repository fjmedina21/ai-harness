/** TEST ONLY. Synthetic identity/presence/provider/runtime; no workload runs on host. */
import path from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import type { ProposalArtifact, RepairPolicy, ValidationActionProfile, EngineeringResumeStore } from "@ai-harness/contracts";
import { FileValidationEvidenceStore, ProposalArtifactStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { ValidationCoordinator, EngineeringWorkspace, SandboxValidationRegistry, engineeringHash, validationRequestId, normalizeRepairEvidence } from "@ai-harness/tools";
import { RepairCoordinator, type RepairValidationPort } from "../repair.js";
import { FixtureEngineeringAgent } from "../engineering-fixture.js";
import { ContinuationCoordinator } from "../engineering-resume.js";
import { confirmation, credential, verifier, policy } from "./resume-fixture.js";
export const repairPolicy: RepairPolicy = { version: 1, enabled: true, maxIterations: 3, maxProviderRequests: 3, maxInputTokens: 16, maxOutputTokens: 16, maxGlobalMs: 60000, maxProviderMs: 1000, maxValidationMs: 1000, maxValidations: 3, maxFiles: 4, maxPatchBytes: 8192, maxEstimatedCostUsd: 0, allowUnknownCost: false, requireHumanApprovalForEachPatch: true, requireSeparateSandboxApproval: true, stopOnUncertainState: true, stopOnNoProgress: true };
export const actor = { issuer: "github.com", subject: "101" };
export const action: ValidationActionProfile = { id: "test", runtimeProfile: "node-isolated-v1", image: "registry.test/synthetic@sha256:" + "1".repeat(64), executable: "node", args: ["--test", "value.ts"], workingDirectory: "", timeoutMs: 1000, maxOutputBytes: 1024, network: "none", resources: { cpu: 0.5, memoryBytes: 268435456, pids: 64 } };
export async function openRepairFixture(base: string, persistent = false, supplied?: EngineeringResumeStore, authorizationDigest?: string) {
  const store = supplied ?? await openSqliteOperationJournal(path.join(base, "state", "ops.sqlite")), artifacts = new ProposalArtifactStore(path.join(base, "state"));
  try { await mkdir(path.join(base, "evidence"), { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  const evidence = new FileValidationEvidenceStore(path.join(base, "evidence")), registry = new SandboxValidationRegistry(); registry.register(action);
  let runtimeCalls = 0;
  const behavior = { progressive: false, noisy: false };
  const c = new ValidationCoordinator({ store, evidence, registry, project: { id: "repair-fixture", authorizationDigest, sourceRoot: path.join(base, "source"), workspaceDirectory: path.join(base, "workspaces"), policy, actions: [action] },
    authorize: async () => actor, approvalVerifier: () => ({ verify: async () => ({ ...actor, roles: ["harness:approver"] }) }),
    runtime: { async execute(snapshot) { runtimeCalls++; const current = artifact(); const workspace = await EngineeringWorkspace.reopen(current.receipt, current.rootIdentity, store); const pass = !persistent && (await workspace.read("value.ts")).includes("= 3"); return { classification: pass ? "passed" : "failed", exitCode: pass ? 0 : 1, timedOut: false, cancelled: false, cleanup: "confirmed", output: pass ? "synthetic pass" : behavior.progressive ? "synthetic failure " + snapshot.manifest.snapshotDigest : behavior.noisy ? "synthetic failure time " + runtimeCalls : "synthetic failure", diagnostics: [pass ? "action.passed" : "action.failed"] }; } } });
  function artifact() {
    const all = store.list(executionId()), session = store.repair?.get(executionId()), op = session ? all.find(o => o.operationId === session.currentOperationId)! : all.find(o => store.proposal(o.operationId))!;
    return artifacts.get(store.proposal(op.operationId)!.artifactDigest);
  }
  const executionId = () => binding.id;
  // Bound by the caller to a single execution, never a model-selected journal lookup.
  const binding = { id: "" };
  const port: RepairValidationPort = { profileId: "synthetic-a", profileDigest: engineeringHash(JSON.stringify(action)), actionId: "test", timeoutMs: 1000,
    normalize: e => normalizeRepairEvidence(e, port, behavior.progressive ? [{ severity: "error", code: "SYNTHETIC_ERROR", message: "Synthetic failure snapshot " + e.snapshotDigest }] : undefined),
    async inspect(a, id) { return c.inspectEvidence(a, await EngineeringWorkspace.reopen(a.receipt, a.rootIdentity, store), "test", id); },
    async latest(a) {
      const op = store.list(a.executionId).find(o => o.toolId === "sandbox.validate" && o.requestId === validationRequestId(a, "test"));
      if (!op || op.state !== "Completed") return null;
      for (const name of await readdir(path.join(base, "evidence"))) if (/^[a-f0-9]{64}\.json$/.test(name)) { const e = await evidence.get(name.slice(0, -5)); if (e?.operationId === op.operationId) return c.inspectEvidence(a, await EngineeringWorkspace.reopen(a.receipt, a.rootIdentity, store), "test", e.validationId); }
      throw new Error("Missing durable fixture evidence");
    },
    prepare: (a, workspace, id, signal) => c.prepare(a, workspace, id, signal) };
  const coordinator = (overrides: Partial<ConstructorParameters<typeof RepairCoordinator>[0]> = {}) => new RepairCoordinator({ store, artifacts, policy, repairPolicy, projectId: "repair-fixture", ownerId: "101", projectAuthorizationDigest: authorizationDigest, authorize: async () => actor, agent: new FixtureEngineeringAgent("value.ts", "export const value = 3;\n"), validation: port, ...overrides });
  const continuation = new ContinuationCoordinator({ store, artifacts, policy, verifier });
  async function approvePatch(a: ProposalArtifact) { await continuation.decide(a.operationId, credential(store.proposal(a.operationId)!, "approve"), true, confirmation); }
  async function apply(a: ProposalArtifact) { return continuation.continue(a.operationId, credential(store.proposal(a.operationId)!, "continue"), 5000); }
  async function validate(a: ProposalArtifact) { const workspace = await EngineeringWorkspace.reopen(a.receipt, a.rootIdentity, store); const pending = await c.prepare(a, workspace, "test"); await c.approve(a, workspace, "test", "fixture", confirmation); return c.execute(a, workspace, "test", pending.approvalId!); }
  return { store, artifacts, evidence, c, port, coordinator, continuation, approvePatch, apply, validate, artifact, binding, behavior, calls: () => runtimeCalls };
}
