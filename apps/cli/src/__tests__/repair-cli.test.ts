import assert from "node:assert/strict";
import test from "node:test";
import { main } from "../index.js";
import { repairCommand } from "../repair-cli.js";
import { GitHubAuthError } from "@ai-harness/security";
import type { GitHubHost } from "../github-host.js";

for (const command of ["repair", "repair-status", "repair-history"]) test("repair CLI requires current owner authentication: " + command, async () => {
  const output: string[] = []; let loads = 0;
  const code = await main(["engineering", command, "--id", "synthetic-execution", "--json"], process.cwd(), text => output.push(text), undefined, async () => { loads++; throw new GitHubAuthError("authentication_required"); });
  assert.equal(code, 1); assert.equal(loads, 1); assert.equal(JSON.parse(output.join("")).error.code, "authentication_required");
});
for (const command of ["repair", "repair-status", "repair-history"]) for (const extra of [
  ["--auto-approve"], ["--yes"], ["--skip-review"], ["--credential", "PRIVATE_SYNTHETIC_CREDENTIAL"], ["--username", "owner"], ["--id", "another-id"], ["--journal", "/private/forbidden.sqlite"], ["--profile-file", "project-profile.json"],
]) test("repair CLI rejects implicit authority before authentication: " + command + " " + extra[0], async () => {
  const output: string[] = []; let loads = 0;
  const code = await repairCommand([command, "--id", "synthetic-execution", ...extra], text => output.push(text), undefined, async () => { loads++; throw new Error("Unexpected host access"); });
  assert.equal(code, 1); assert.equal(loads, 0); assert.equal(JSON.parse(output.join("")).error.code, "invalid_arguments"); assert.doesNotMatch(output.join(""), /PRIVATE_SYNTHETIC_CREDENTIAL|private\/forbidden/);
});
for (const argv of [[], ["--id"], ["--id", "../escape"], ["--id", "x", "--id", "y"], ["--id", "x", "--max-iterations"], ["--id", "x", "--unknown", "v"]]) test("repair CLI rejects malformed identity/options " + JSON.stringify(argv), async () => {
  let calls = 0; const output: string[] = [];
  assert.equal(await repairCommand(["repair", ...argv], text => output.push(text), undefined, async () => { calls++; throw new Error(); }), 1);
  assert.equal(calls, 0); assert.equal(JSON.parse(output.join("")).error.code, "invalid_arguments");
});
for (const command of ["repair-status", "repair-history"]) for (const extra of [["--provider", "openai"], ["--confirm-provider-call"], ["--max-iterations", "3"]]) test("repair inspection rejects execution options " + command + " " + extra[0], async () => {
  const output: string[] = []; let loads = 0;
  assert.equal(await repairCommand([command, "--id", "synthetic-execution", ...extra], text => output.push(text), undefined, async () => { loads++; throw new Error(); }), 1);
  assert.equal(loads, 0); assert.equal(JSON.parse(output.join("")).error.code, "invalid_arguments");
});
test("repair CLI rejects wrong owner before opening any project journal", async () => {
  const output: string[] = [];
  const host = { configuration: { auth: { ownerAccountId: "101" }, workspaces: [] }, authentication: { identity: async () => ({ issuer: "github.com", subject: "102" }) } } as unknown as GitHubHost;
  assert.equal(await repairCommand(["repair-status", "--id", "synthetic"], text => output.push(text), undefined, async () => host), 1);
  assert.equal(JSON.parse(output.join("")).error.code, "forbidden_scope");
});
test("repair CLI denies projects without independently authorized capabilities", async () => {
  const output: string[] = []; let authorizations = 0;
  const host = { configuration: { auth: { ownerAccountId: "101" }, workspaces: [{ sourceRoot: "/nonexistent/synthetic", workspaceDirectory: "/nonexistent/workspaces", journalFile: "/nonexistent/private.sqlite" }] }, authentication: { identity: async () => ({ issuer: "github.com", subject: "101" }), roles: () => [], authorize: async () => { authorizations++; throw new Error(); } } } as unknown as GitHubHost;
  assert.equal(await repairCommand(["repair", "--id", "synthetic"], text => output.push(text), undefined, async () => host), 1);
  assert.equal(authorizations, 0); assert.equal(JSON.parse(output.join("")).error.code, "forbidden_scope");
});
test("repair CLI sanitizes internal verifier failures", async () => {
  const output: string[] = [];
  assert.equal(await repairCommand(["repair-history", "--id", "synthetic"], text => output.push(text), undefined, async () => { throw new Error("PRIVATE_SESSION_SECRET"); }), 1);
  assert.doesNotMatch(output.join(""), /PRIVATE_SESSION_SECRET/); assert.equal(JSON.parse(output.join("")).error.code, "reconciliation_required");
});


test("repair CLI reopens durable owner-scoped status/history with remaining budget and zero effects", async t => {
  const { mkdtemp, mkdir, writeFile, realpath, rm, readFile } = await import("node:fs/promises");
  const path = await import("node:path"), { tmpdir } = await import("node:os"), { createHash } = await import("node:crypto");
  const { openSqliteOperationJournal, ProposalArtifactStore, EngineeringCheckpointStore } = await import("@ai-harness/checkpointing");
  const { runEngineeringWorkflow, FixtureEngineeringAgent, ENGINEERING_TOOL_IDS } = await import("@ai-harness/application");
  const { canonicalProposalJson } = await import("@ai-harness/contracts");
  const { projectAuthorizationDigest } = await import("../github-host.js");
  const hash = (value: unknown) => createHash("sha256").update(canonicalProposalJson(value)).digest("hex");
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-repair-cli-"))); t.after(() => rm(base, { recursive: true, force: true }));
  for (const directory of ["source", "workspaces", "state", "checkpoints"]) await mkdir(path.join(base, directory), { mode: 0o700 });
  const sourceRoot = path.join(base, "source"), workspaceDirectory = path.join(base, "workspaces"), original = "export const value = 1;\n";
  await writeFile(path.join(sourceRoot, "value.ts"), original);
  const policy = { version: "synthetic-cli-repair", allowedPaths: ["value.ts"], allowedOperations: ["create", "replace"] as const, maxFiles: 16, maxBytes: 8192 };
  const budget = { maxIterations: 3, maxRequests: 8, maxTokens: 100, maxEstimatedCostUsd: 0, timeoutMs: 60000, maxFiles: 16, maxBytes: 8192 };
  const workspace = { id: "synthetic", capabilities: ["harness:requester", "harness:reader", "harness:approver", "harness:operator"] as const, allowedToolIds: [...ENGINEERING_TOOL_IDS, "sandbox.validate"], limits: budget, validationActions: [], sourceRoot, workspaceDirectory, journalFile: path.join(base, "state", "ops.sqlite"), checkpointDirectory: path.join(base, "checkpoints"), policy };
  const authorizationDigest = projectAuthorizationDigest(workspace), actor = { issuer: "github.com", subject: "101" };
  const store = await openSqliteOperationJournal(workspace.journalFile), artifacts = new ProposalArtifactStore(path.dirname(workspace.journalFile));
  let sessionId: string;
  try {
    const generated = await runEngineeringWorkflow({ projectRoot: sourceRoot, projectAuthorizationDigest: authorizationDigest, request: "Update the constant", files: ["value.ts"], level: 2, policy, budget, agent: new FixtureEngineeringAgent("value.ts", "export const value = 2;\n"), checkpoint: new EngineeringCheckpointStore(workspace.checkpointDirectory), workspace: { directory: workspaceDirectory, binding: { store, requester: actor, safetyByTool: {} }, createAuthorized: true, ttlMs: 60000 }, proposalArtifacts: artifacts });
    const operation = store.list(generated.executionId, undefined, 1000).find(op => store.proposal(op.operationId)); assert.ok(operation);
    const artifact = artifacts.get(store.proposal(operation.operationId)!.artifactDigest), now = new Date().toISOString();
    const repairPolicy = { version: 1 as const, enabled: true as const, maxIterations: 3, maxProviderRequests: 8, maxInputTokens: 50, maxOutputTokens: 50, maxGlobalMs: 60000, maxProviderMs: 10000, maxValidationMs: 10000, maxValidations: 3, maxFiles: 16, maxPatchBytes: 8192, maxEstimatedCostUsd: 0, allowUnknownCost: false, requireHumanApprovalForEachPatch: true as const, requireSeparateSandboxApproval: true as const, stopOnUncertainState: true as const, stopOnNoProgress: true as const };
    const accounting = { iterations: 0, providerRequests: 0, inputTokens: 0, outputTokens: 0, validations: 0, patchBytes: 0, files: 0, estimatedCostUsd: 0 };
    sessionId = generated.executionId;
    // Synthetic inspection state only: no completed validation or authorization is asserted by this fixture.
    store.repair!.create({ schemaVersion: 1, sessionId, executionId: sessionId, projectId: workspace.id, ownerId: "101", policyDigest: hash({ repair: repairPolicy, project: policy, authorization: authorizationDigest }), profileDigest: "b".repeat(64), profileId: "synthetic-profile", actionId: "test", originalObjective: "Update the constant", sourceRevision: artifact.sourceRevision, initialOperationId: operation.operationId, currentOperationId: operation.operationId, workspaceId: artifact.workspaceId, baseSnapshotDigest: artifact.baseSnapshot.digest, state: "RepairRequested", iteration: 0, version: 0, createdAt: now, updatedAt: now, deadlineAt: new Date(Date.parse(now) + 60000).toISOString(), policy: repairPolicy, consumed: accounting, reserved: { ...accounting }, iterations: [], diagnosticDigest: "c".repeat(64), lastValidation: { schemaVersion: 1, validationId: "synthetic-inspection", operationId: "d".repeat(64), executionId: sessionId, workspaceId: artifact.workspaceId, snapshotId: "snapshot", snapshotDigest: artifact.baseSnapshot.digest, transferDigest: "e".repeat(64), actionId: "test", runtimeProfile: "node-isolated-v1", imageDigest: "f".repeat(64), startedAt: now, completedAt: now, durationMs: 1, exitCode: 1, classification: "failed", timedOut: false, cancelled: false, cleanup: "confirmed", outputDigest: "a".repeat(64), diagnostics: ["action.failed"] } });
  } finally { store.close(); }
  const host = { configuration: { version: 1, auth: { ownerAccountId: "101" }, workspaces: [workspace] }, authentication: { identity: async () => actor, roles: () => workspace.capabilities, authorize: async () => actor } } as unknown as GitHubHost;
  for (const command of ["repair-status", "repair-history"]) {
    const output: string[] = []; assert.equal(await repairCommand([command, "--id", sessionId!], text => output.push(text), undefined, async () => host), 0);
    const result = JSON.parse(output.join("")); assert.equal(result.executionId, sessionId); assert.equal(result.integrated, false);
    if (command === "repair-status") { assert.equal(result.session.ownerId, "101"); assert.equal(result.budgetRemaining.providerRequests, 8); assert.equal(result.budgetRemaining.inputTokens, 50); assert.equal(result.terminalClassification, null); }
    else { assert.equal(result.history.length, 1); assert.equal(result.history[0].version, 0); }
  }
  assert.equal(await readFile(path.join(sourceRoot, "value.ts"), "utf8"), original);
});


test("repair CLI starts, proposes, waits for independent existing approval/application and completes from real fixture evidence", async t => {
  const { mkdtemp, writeFile, readFile, realpath, rm } = await import("node:fs/promises"), path = await import("node:path"), { tmpdir } = await import("node:os");
  // Existing cross-package TEST-ONLY fixtures: real SQLite/artifacts/coordinator, simulated identity/presence/Podman.
  const { generate, directories, policy, confirmation } = await import("../../../../packages/application/dist/__tests__/resume-fixture.js");
  const { openRepairFixture, action } = await import("../../../../packages/application/dist/__tests__/repair-fixture.js");
  const { ENGINEERING_TOOL_IDS } = await import("@ai-harness/application"), { projectAuthorizationDigest } = await import("../github-host.js"), { engineeringLifecycleCommand } = await import("../engineering-cli.js");
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-repair-command-"))); t.after(() => rm(base, { recursive: true, force: true })); await directories(base);
  const sourceRoot = path.join(base, "source"), workspaceDirectory = path.join(base, "workspaces");
  await writeFile(path.join(sourceRoot, "value.ts"), "export const value = 1;\n", { mode: 0o600 });
  const workspace = { id: "repair-fixture", capabilities: ["harness:requester", "harness:reader", "harness:approver", "harness:operator"] as const, allowedToolIds: [...ENGINEERING_TOOL_IDS, "sandbox.validate"], limits: { maxIterations: 3, maxRequests: 8, maxTokens: 80000, maxEstimatedCostUsd: 0, timeoutMs: 60000, maxFiles: 4, maxBytes: 8192 }, validationActions: [action], sourceRoot, workspaceDirectory, journalFile: path.join(base, "state", "ops.sqlite"), checkpointDirectory: path.join(base, "state"), policy };
  const authorizationDigest = projectAuthorizationDigest(workspace), generated = await generate(base, undefined, false, { projectAuthorizationDigest: authorizationDigest }), id = generated.result.executionId;
  const initial = await openRepairFixture(base, false, undefined, authorizationDigest); initial.binding.id = id;
  const initialArtifact = initial.artifact(); await initial.approvePatch(initialArtifact); await initial.apply(initialArtifact); await initial.validate(initialArtifact);
  const failed = await initial.port.latest(initialArtifact); assert.ok(failed); assert.equal(failed.classification, "failed"); initial.store.close();
  const actor = { issuer: "github.com", subject: "101" };
  const host = { configuration: { version: 1, auth: { ownerAccountId: "101" }, workspaces: [workspace] }, authentication: { identity: async () => actor, roles: () => workspace.capabilities, authorize: async () => actor, resumeVerifier: () => ({ credential: "synthetic-test-handle", verifier: { verify: async (_credential: string, binding: unknown) => ({ ...actor, roles: workspace.capabilities, binding, expiresAt: Date.now() + 60000 }) } }) } } as unknown as GitHubHost;
  const loadHost = async () => host;
  const factory: NonNullable<Parameters<typeof repairCommand>[4]> = async options => {
    const f = await openRepairFixture(base, false, options.store, authorizationDigest); f.binding.id = id;
    const { normalizeRepairEvidence } = await import("../../../../packages/tools/dist/index.js");
    const bound = { ...f.port, profileId: "local-podman" };
    return { ...bound, normalize: (e: import("@ai-harness/contracts").ValidationRunEvidence) => normalizeRepairEvidence(e, bound) };
  };
  async function repair(options: string[]) { const output: string[] = []; const code = await repairCommand(["repair", "--id", id, ...options], text => output.push(text), undefined, loadHost, factory); return { code, result: JSON.parse(output.join("")) }; }
  const started = await repair(["--request", "Make the selected synthetic value pass", "--validation-id", failed.validationId, "--profile", "local-podman", "--action", "test", "--max-iterations", "3"]);
  assert.equal(started.code, 2, JSON.stringify(started)); assert.equal(started.result.session.state, "RepairRequested");
  const proposed = await repair(["--provider", "fixture", "--fixture-file", "value.ts", "--fixture-content", "export const value = 3;\n"]);
  assert.equal(proposed.code, 2, JSON.stringify(proposed)); assert.equal(proposed.result.session.state, "AwaitingPatchApproval"); assert.equal(proposed.result.budgetRemaining.providerRequests, 7);
  const pending = await repair([]); assert.equal(pending.code, 2); assert.equal(pending.result.session.state, "AwaitingPatchApproval");
  const premature: string[] = [];
  assert.equal(await engineeringLifecycleCommand(["validate", "--id", id, "--profile", "local-podman", "--action", "test"], text => premature.push(text), undefined, loadHost, () => confirmation), 1);
  assert.equal(JSON.parse(premature.join("")).error.code, "reconciliation_required");
  // Existing CLI gates perform separately requested review/application. The repair command never calls confirmation.
  for (const command of ["approve", "continue"]) {
    const output: string[] = []; const code = await engineeringLifecycleCommand([command, "--id", id], text => output.push(text), undefined, loadHost, () => confirmation);
    assert.equal(code, 0, output.join(""));
  }
  const sandbox = await repair([]); assert.equal(sandbox.code, 2, JSON.stringify(sandbox)); assert.equal(sandbox.result.session.state, "AwaitingSandboxApproval");
  const realNow = Date.now;
  try {
    Date.now = () => Date.parse(sandbox.result.session.deadlineAt) - action.timeoutMs + 1;
    const late: string[] = []; let nativeCalls = 0;
    assert.equal(await engineeringLifecycleCommand(["validate", "--id", id, "--profile", "local-podman", "--action", "test"], text => late.push(text), undefined, loadHost, () => { nativeCalls++; return confirmation; }), 1);
    assert.equal(JSON.parse(late.join("")).error.code, "reconciliation_required"); assert.equal(nativeCalls, 0);
  } finally { Date.now = realNow; }

  const validate = await openRepairFixture(base, false, undefined, authorizationDigest); validate.binding.id = id;
  try { const repairedArtifact = validate.artifact(); const approved = await validate.validate(repairedArtifact); assert.equal(approved.status, "executed"); } finally { validate.store.close(); }
  const done = await repair([]); assert.equal(done.code, 0, JSON.stringify(done)); assert.equal(done.result.session.state, "Completed"); assert.equal(done.result.lastResult.classification, "passed"); assert.equal(done.result.session.consumed.providerRequests, 1);
  for (const command of ["approve", "continue", "validate"]) {
    const blocked: string[] = []; assert.equal(await engineeringLifecycleCommand([command, "--id", id, ...(command === "validate" ? ["--profile", "local-podman", "--action", "test"] : [])], text => blocked.push(text), undefined, loadHost, () => confirmation), 1);
    assert.equal(JSON.parse(blocked.join("")).error.code, "reconciliation_required");
  }
  assert.equal(await readFile(path.join(sourceRoot, "value.ts"), "utf8"), "export const value = 1;\n");
});
