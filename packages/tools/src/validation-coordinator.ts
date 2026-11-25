import type { EngineeringResumeStore, HostIdentity, ProposalArtifact, ValidationActionProfile, ValidationEvidenceStore, ValidationRunEvidence, WorkspaceSnapshot } from "@ai-harness/contracts";
import { canonicalProposalJson } from "@ai-harness/contracts";
import { digestDurableValue } from "@ai-harness/security";
import { ToolRegistry } from "./index.js";
import { ToolDispatcher } from "./dispatcher.js";
import { EngineeringWorkspace, engineeringHash, engineeringPath } from "./engineering-workspace.js";
import { captureValidationSnapshot } from "./validation-snapshot.js";
import { SandboxValidationRegistry, type SnapshotValidationRuntime } from "./snapshot-validation-runtime.js";

/** Derives the exact approved resulting inventory; no re-generation or provider port. */
export function expectedApprovedSnapshot(artifact: ProposalArtifact): WorkspaceSnapshot {
  const files = new Map(artifact.baseSnapshot.files.map(f => [f.path, { ...f }]));
  for (const change of artifact.patch.changes) {
    engineeringPath(change.path);
    const base = files.get(change.path);
    if ((base?.hash ?? null) !== change.baseHash) throw new Error("Approved validation base mismatch");
    if (change.operation === "delete") files.delete(change.path);
    else {
      if (typeof change.content !== "string" || engineeringHash(change.content) !== change.resultHash) throw new Error("Approved validation patch mismatch");
      files.set(change.path, { path: change.path, hash: change.resultHash!, bytes: Buffer.byteLength(change.content) });
    }
  }
  const inventory = [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { digest: engineeringHash(JSON.stringify(inventory)), files: inventory };
}
export interface ValidationCoordinatorOptions {
  store: EngineeringResumeStore;
  evidence: ValidationEvidenceStore;
  registry: SandboxValidationRegistry;
  runtime: SnapshotValidationRuntime;
  /** Host verifies GitHub session, operator role, current policy and exact execution/workspace scope.
   * Never take identity or permissions from model/project content. */
  authorize(artifact: Readonly<ProposalArtifact>, action: Readonly<ValidationActionProfile>): Promise<HostIdentity>;
}
/** Experimental host-only composition. All effects pass through ToolDispatcher and durable shell approval. */
export class ValidationCoordinator {
  constructor(private readonly options: ValidationCoordinatorOptions) {}
  private async dispatch(artifact: ProposalArtifact, workspace: EngineeringWorkspace, actionId: string, approvalId?: string, signal?: AbortSignal) {
    const o = this.options, a = structuredClone(artifact), action = o.registry.get(actionId);
    const { artifactDigest, ...unsigned } = a;
    if (engineeringHash(canonicalProposalJson(unsigned)) !== artifactDigest || a.patchDigest !== a.patch.digest ||
      a.policyDigest !== engineeringHash(a.policyEncoding) || canonicalProposalJson(JSON.parse(a.policyEncoding)) !== canonicalProposalJson(a.policy) ||
      engineeringHash(JSON.stringify(a.baseSnapshot.files)) !== a.baseSnapshot.digest) throw new Error("Validation artifact integrity mismatch");
    const actor = await o.authorize(Object.freeze(structuredClone(a)), Object.freeze(structuredClone(action)));
    if (!actor || actor.issuer !== "github.com" || !/^[1-9][0-9]{0,19}$/.test(actor.subject)) throw new Error("Authenticated GitHub operator required");
    signal?.throwIfAborted();
    const op = o.store.get(a.operationId), reference = o.store.proposal(a.operationId), grant = op?.approvalId && o.store.approval(op.approvalId);
    if (!op || op.state !== "Completed" || !grant || grant.status !== "consumed" || !grant.approver ||
      grant.approver.issuer === grant.requester.issuer && grant.approver.subject === grant.requester.subject ||
      reference?.artifactDigest !== a.artifactDigest || reference.workspaceId !== a.workspaceId || reference.executionId !== a.executionId ||
      canonicalProposalJson(op.requester) !== canonicalProposalJson(a.requester) || a.executionId !== workspace.receipt.executionId || a.workspaceId !== workspace.receipt.workspaceId || a.receipt.root !== workspace.receipt.root ||
      op.argumentDigest !== digestDurableValue({ digest: a.patch.digest, workspace_id: a.patch.workspaceId, base_revision: a.patch.baseRevision, policy_digest: a.patch.policyDigest })) throw new Error("Approved L2 workspace required");
    const expected = expectedApprovedSnapshot(a);
    if (op.resultDigest !== digestDurableValue({ snapshotDigest: expected.digest, patchDigest: a.patch.digest })) throw new Error("Approved validation result mismatch");
    const snapshot = await captureValidationSnapshot(workspace, expected, { sourceRevision: a.sourceRevision,
      policyVersion: a.policy.version, policyDigest: a.policyDigest, allowedPaths: [...new Set([...a.baseSnapshot.files.map(f => f.path), ...a.allowedPaths])] }, signal);
    const arguments_ = { artifact_digest: a.artifactDigest, transfer_digest: snapshot.manifest.transferDigest, action_digest: engineeringHash(JSON.stringify(action)), workspace_id: a.workspaceId };
    const invocation = { toolId: "sandbox.validate", arguments: arguments_ };
    const validationId = engineeringHash(JSON.stringify([a.executionId, a.workspaceId, arguments_]));
    const registry = new ToolRegistry();
    registry.register({ id: "sandbox.validate", description: "Run one host-approved validation action in the approved Podman sandbox", permission: "shell:execute", risk: "high",
      inputSchema: { type: "object", properties: { artifact_digest: { type: "string", minLength: 64, maxLength: 64 }, transfer_digest: { type: "string", minLength: 64, maxLength: 64 }, action_digest: { type: "string", minLength: 64, maxLength: 64 }, workspace_id: { type: "string", minLength: 1, maxLength: 80 } }, required: Object.keys(arguments_), additionalProperties: false } });
    const dispatcher = new ToolDispatcher(registry, undefined, { store: o.store, requester: actor, safetyByTool: { "sandbox.validate": "side_effecting" } });
    let claim = false;
    dispatcher.registerHandler("sandbox.validate", async () => {
      if (approvalId === undefined) throw new Error("Validation approval required");
      const approval = o.store.approval(approvalId);
      if (!approval?.approver || approval.status !== "consumed" || approval.approver.issuer === approval.requester.issuer && approval.approver.subject === approval.requester.subject) throw new Error("Independent validation approval required");
      const revalidated = await o.authorize(Object.freeze(structuredClone(a)), Object.freeze(structuredClone(action)));
      if (canonicalProposalJson(revalidated) !== canonicalProposalJson(actor)) throw new Error("Validation operator identity changed");
      if ((await workspace.inspect(signal)).digest !== snapshot.manifest.snapshotDigest) throw new Error("Validation snapshot changed");
      await o.evidence.claim(a.workspaceId, validationId); claim = true;
      const startedAt = new Date().toISOString(), monotonic = performance.now();
      const result = await o.runtime.execute(snapshot, action, signal);
      const validationOp = o.store.list(a.executionId, undefined, 1000).find(x => x.taskId === "sandbox-validation" && x.requestId === actionId);
      if (!validationOp) throw new Error("Validation operation unavailable");
      const evidence: ValidationRunEvidence = { schemaVersion: 1, validationId, operationId: validationOp.operationId, executionId: a.executionId, workspaceId: a.workspaceId,
        snapshotId: snapshot.manifest.snapshotId, snapshotDigest: snapshot.manifest.snapshotDigest, transferDigest: snapshot.manifest.transferDigest,
        actionId, runtimeProfile: action.runtimeProfile, imageDigest: action.image.split("@sha256:")[1]!, startedAt, completedAt: new Date().toISOString(),
        durationMs: Math.ceil(performance.now() - monotonic), exitCode: result.exitCode,
        classification: result.cleanup === "uncertain" ? "uncertain" : result.classification, timedOut: result.timedOut, cancelled: result.cancelled,
        cleanup: result.cleanup, outputDigest: engineeringHash(result.output), diagnostics: result.diagnostics };
      if (evidence.classification === "passed" && evidence.cleanup !== "confirmed") throw new Error("Validation cleanup uncertain");
      await o.evidence.save(evidence, result.output);
      if (evidence.classification === "uncertain") throw new Error("Validation uncertain; do not replay");
      return evidence;
    });
    const result = await dispatcher.dispatch(invocation, { executionId: a.executionId, projectRoot: workspace.receipt.root,
      defaultDeny: true, grantedPermissions: ["shell:execute"], requireApprovalFor: ["shell:execute"], operation: { taskId: "sandbox-validation", requestId: actionId }, signal }, approvalId);
    if (claim && result.status === "executed" && result.operationState === "Completed") {
      const evidence = result.data as ValidationRunEvidence;
      if (evidence.cleanup === "confirmed" || evidence.cleanup === "not_needed") await o.evidence.release(a.workspaceId, validationId);
    }
    return result;
  }
  prepare(artifact: ProposalArtifact, workspace: EngineeringWorkspace, actionId: string, signal?: AbortSignal) {
    return this.dispatch(artifact, workspace, actionId, undefined, signal);
  }
  execute(artifact: ProposalArtifact, workspace: EngineeringWorkspace, actionId: string, approvalId: string, signal?: AbortSignal) {
    return this.dispatch(artifact, workspace, actionId, approvalId, signal);
  }
}
