/** Harmless synthetic data + mocked container responses. No workload runs on the host. */
import type { TestContext } from "node:test";
import { chmod, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { EngineeringPolicy, ProcessResult, ProcessRunOptions, ValidationActionProfile } from "@ai-harness/contracts";
import { FileValidationEvidenceStore, openSqliteOperationJournal, sealProposalArtifact } from "@ai-harness/checkpointing";
import { EngineeringWorkspace, engineeringHash } from "../engineering-workspace.js";
import { EngineeringPatchEngine, createEngineeringTools, patchInvocation } from "../engineering-patches.js";
import { SandboxValidationRegistry } from "../snapshot-validation-runtime.js";
import { PodmanFixture, PODMAN_OPTIONS } from "./podman-fixture.js";

export const operator = { issuer: "github.com", subject: "1001" };
export const approver = { issuer: "github.com", subject: "2002" };
export const action: ValidationActionProfile = { id: "test", runtimeProfile: "node-isolated-v1", image: PODMAN_OPTIONS.image, executable: "node",
  args: ["--test", "value.js"], workingDirectory: "", timeoutMs: 1000, maxOutputBytes: 1024, network: "none", resources: { cpu: 0.5, memoryBytes: 268435456, pids: 64 } };
export async function validationFixture(t: TestContext, patchState: "completed" | "approved" | "running" | "uncertain" = "completed") {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-validation-"))); await chmod(base, 0o700);
  for (const d of ["source", "workspaces", "state", "evidence"]) await mkdir(path.join(base, d), { mode: 0o700 });
  const original = "export const value = 1;\n", changed = "export const value = 2;\n";
  await writeFile(path.join(base, "source", "value.js"), original, { mode: 0o600 });
  const store = await openSqliteOperationJournal(path.join(base, "state", "ops.sqlite"), { approvalTtlMs: 300000 });
  t.after(async () => { try { store.close(); } catch {} await rm(base, { recursive: true, force: true }); });
  const binding = { store, requester: operator, safetyByTool: {} };
  const workspace = await EngineeringWorkspace.create({ directory: path.join(base, "workspaces"), sourceRoot: path.join(base, "source"), executionId: "validation-fixture",
    files: ["value.js"], maxFiles: 16, maxBytes: 65536, ttlMs: 300000, binding, createAuthorized: true });
  const policy: EngineeringPolicy = { version: "test-v1", allowedPaths: ["value.js"], allowedOperations: ["replace"], maxFiles: 4, maxBytes: 8192 };
  const baseSnapshot = await workspace.inspect(), engine = new EngineeringPatchEngine(workspace, policy);
  const patch = await engine.propose({ baseRevision: baseSnapshot.digest, changes: [{ path: "value.js", operation: "replace", baseHash: baseSnapshot.files[0]!.hash, content: changed, resultHash: engineeringHash(changed) }] });
  const tools = createEngineeringTools(engine, binding), identity = { taskId: "apply", requestId: "approved" };
  const pending = await tools.dispatch(patchInvocation(patch), identity), op = store.get(pending.operationId!)!;
  const root = await lstat(workspace.receipt.root, { bigint: true });
  const diff = await engine.diff(patch.digest);
  const artifact = sealProposalArtifact({ schemaVersion: 1, executionId: workspace.receipt.executionId, requester: operator, operationId: op.operationId,
    workspaceId: workspace.receipt.workspaceId, receipt: { ...workspace.receipt }, rootIdentity: { dev: root.dev.toString(), ino: root.ino.toString() }, sourceRevision: baseSnapshot.digest,
    baseSnapshot, patch, patchDigest: patch.digest, diffDigest: engineeringHash(diff), diff, allowedPaths: policy.allowedPaths, allowedOperations: policy.allowedOperations,
    policy, policyDigest: engine.policyDigest, policyEncoding: JSON.stringify(policy), budget: { maxIterations: 1, maxRequests: 1, maxTokens: 1, maxEstimatedCostUsd: 0, timeoutMs: 10000, maxFiles: 4, maxBytes: 65536 },
    accounting: { requests: 0, tokens: 0, estimatedCostUsd: 0, usageComplete: false, reportedUsage: { availability: "unavailable" }, cost: { status: "unknown", reason: "missing_usage" } },
    createdAt: new Date().toISOString(), expiresAt: new Date(Math.min(workspace.receipt.expiresAt, Date.parse(store.approval(op.approvalId!)!.expiresAt))).toISOString() });
  store.bindProposal({ operationId: op.operationId, executionId: artifact.executionId, workspaceId: artifact.workspaceId, artifactDigest: artifact.artifactDigest, challenge: "1".repeat(64), expiresAt: artifact.expiresAt });
  store.decideScoped(op.approvalId!, approver, true, { artifactDigest: artifact.artifactDigest, challenge: "1".repeat(64) });
  store.acquireLease(op.operationId, store.get(op.operationId)!.version, 300000, operator);
  if (patchState === "completed") {
    const applied = await tools.dispatch(patchInvocation(patch), identity, pending.approvalId);
    if (applied.status !== "executed") throw new Error("Validation fixture setup failed");
  } else if (patchState !== "approved") {
    const current = store.get(op.operationId)!, prepared = store.prepare(current.operationId, current.version, current.scopeDigest, current.approvalId)!;
    const running = store.start(prepared.operationId, prepared.version);
    if (patchState === "uncertain") store.finish(running.operationId, running.version, "Uncertain");
  }
  const registry = new SandboxValidationRegistry(); registry.register(action);
  const evidence = new FileValidationEvidenceStore(path.join(base, "evidence"));
  return { base, store, workspace, artifact, registry, evidence, original, changed, binding, policy };
}
export class ValidationPodmanFixture extends PodmanFixture {
  responseKind: string | null = null;
  actionExitCode: number | null = 0;
  actionOutput = "ok\n";
  responseOverride?: string;
  transfer?: Record<string, any>;
  override async run(executable: string, raw: readonly string[], timeoutMs: number, options: ProcessRunOptions = {}): Promise<ProcessResult> {
    if (raw.includes("start") && options.stdinBytes) {
      this.calls.push({ executable, args: [...raw], timeoutMs, signal: options.signal });
      this.transfer = JSON.parse(Buffer.from(options.stdinBytes).toString("utf8"));
      const manifest = this.transfer!.snapshot.manifest;
      return { exitCode: 0, stdout: this.responseOverride ?? JSON.stringify({ version: 1, snapshotDigest: manifest.snapshotDigest,
        transferDigest: manifest.transferDigest, staging: "verified", exitCode: this.actionExitCode, kind: this.responseKind,
        output: Buffer.from(this.actionOutput).toString("base64") }), stderr: "" };
    }
    return super.run(executable, raw, timeoutMs, options);
  }
}
