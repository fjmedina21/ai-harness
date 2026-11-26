import type { EngineeringResumeStore, HostIdentity, ProposalArtifact, ValidationActionProfile, ValidationEvidenceStore, ValidationRunEvidence, WorkspaceSnapshot, EngineeringPolicy } from "@ai-harness/contracts";
import { canonicalProposalJson, normalizeApprovalPolicy, type ApprovalPolicy, type HumanApprovalPort, type ApproverIdentityVerifier } from "@ai-harness/contracts";
import { digestDurableValue, assertApprovalDecision, DurableApprovalService, assertHumanIntent } from "@ai-harness/security";
import { ToolRegistry } from "./index.js";
import { ToolDispatcher } from "./dispatcher.js";
import { EngineeringWorkspace, engineeringHash, engineeringPath } from "./engineering-workspace.js";
import path from "node:path";
import { homedir } from "node:os";
import { realpath } from "node:fs/promises";
import { validateEngineeringPolicy } from "./engineering-patches.js";
import { captureValidationSnapshot } from "./validation-snapshot.js";
import { SandboxValidationRegistry, type SnapshotValidationRuntime } from "./snapshot-validation-runtime.js";

/** Stable per-proposal request identity; legacy validation IDs remain unchanged. */
export function validationRequestId(artifact: ProposalArtifact, actionId: string): string {
  return artifact.repairContext ? engineeringHash(JSON.stringify([artifact.artifactDigest, actionId])) : actionId;
}
/** Derives the exact approved resulting inventory; no re-generation or provider port. */
export function expectedApprovedSnapshot(artifact: ProposalArtifact): WorkspaceSnapshot {
  const files = new Map(artifact.baseSnapshot.files.map(f => [f.path, { path: f.path, hash: f.hash, bytes: f.bytes }]));
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
export interface AuthorizedValidationProject {
  authorizationDigest?: string;
  id: string;
  sourceRoot: string;
  workspaceDirectory: string;
  policy: EngineeringPolicy;
  actions: readonly ValidationActionProfile[];
}
export interface ValidationCoordinatorOptions {
  /** Independent trusted host authorization; absent/unregistered project is default deny. */
  project: AuthorizedValidationProject;
  approvalPolicy?: ApprovalPolicy;
  /** Must authenticate approver role and this exact resource. No default verifier exists. */
  approvalVerifier?(artifact: Readonly<ProposalArtifact>, action: Readonly<ValidationActionProfile>): ApproverIdentityVerifier;
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
  constructor(private readonly options: ValidationCoordinatorOptions) {
    this.options = { ...options, project: structuredClone(options.project), approvalPolicy: normalizeApprovalPolicy(options.approvalPolicy) };
  }
  private async authorize(artifact: ProposalArtifact, action: ValidationActionProfile): Promise<HostIdentity> {
    const p = this.options.project;
    if (!p || !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(p.id)) throw new Error("Registered validation project required");
    validateEngineeringPolicy(p.policy);
    if ([p.sourceRoot, p.workspaceDirectory].some(root => root === homedir() || root === path.parse(root).root) || p.sourceRoot === p.workspaceDirectory ||
      p.sourceRoot.startsWith(p.workspaceDirectory + path.sep) || p.workspaceDirectory.startsWith(p.sourceRoot + path.sep)) throw new Error("Broad or overlapping project roots forbidden");
    if (await realpath(p.sourceRoot) !== p.sourceRoot || await realpath(p.workspaceDirectory) !== p.workspaceDirectory ||
      artifact.receipt.sourceRoot !== p.sourceRoot || artifact.projectAuthorizationDigest !== p.authorizationDigest ||
      artifact.baseSnapshot.files.some(f => !p.policy.allowedPaths.includes(f.path)) || artifact.patch.changes.some(c => !p.policy.allowedPaths.includes(c.path) || !p.policy.allowedOperations.includes(c.operation)) || path.dirname(path.dirname(artifact.receipt.root)) !== p.workspaceDirectory ||
      canonicalProposalJson(artifact.policy) !== canonicalProposalJson(p.policy) ||
      !p.actions.some(a => canonicalProposalJson(a) === canonicalProposalJson(action))) throw new Error("Validation project policy changed or action unauthorized");
    const actor = await this.options.authorize(Object.freeze(structuredClone(artifact)), Object.freeze(structuredClone(action)));
    if (!actor || actor.issuer !== "github.com" || actor.issuer !== artifact.requester.issuer || actor.subject !== artifact.requester.subject) throw new Error("Owner-only validation required");
    return actor;
  }
  private async dispatch(artifact: ProposalArtifact, workspace: EngineeringWorkspace, actionId: string, approvalId?: string, signal?: AbortSignal) {
    const o = this.options, a = structuredClone(artifact), action = o.registry.get(actionId);
    const requestId = validationRequestId(a, actionId);
    const { artifactDigest, ...unsigned } = a;
    if (engineeringHash(canonicalProposalJson(unsigned)) !== artifactDigest || a.patchDigest !== a.patch.digest ||
      a.policyDigest !== engineeringHash(a.policyEncoding) || canonicalProposalJson(JSON.parse(a.policyEncoding)) !== canonicalProposalJson(a.policy) ||
      engineeringHash(JSON.stringify(a.baseSnapshot.files.map(f => ({ path: f.path, hash: f.hash, bytes: f.bytes })))) !== a.baseSnapshot.digest) throw new Error("Validation artifact integrity mismatch");
    const actor = await this.authorize(a, action);
    if (!actor || actor.issuer !== a.requester.issuer || actor.subject !== a.requester.subject || actor.issuer !== "github.com" || !/^[1-9][0-9]{0,19}$/.test(actor.subject)) throw new Error("Authenticated GitHub operator required");
    signal?.throwIfAborted();
    const op = o.store.get(a.operationId), reference = o.store.proposal(a.operationId), grant = op?.approvalId && o.store.approval(op.approvalId);
    if (!op || op.state !== "Completed" || !grant || grant.status !== "consumed" || !grant.approver ||
      reference?.artifactDigest !== a.artifactDigest || reference.workspaceId !== a.workspaceId || reference.executionId !== a.executionId ||
      canonicalProposalJson(op.requester) !== canonicalProposalJson(a.requester) || a.executionId !== workspace.receipt.executionId || a.workspaceId !== workspace.receipt.workspaceId || a.receipt.root !== workspace.receipt.root ||
      op.argumentDigest !== digestDurableValue({ digest: a.patch.digest, workspace_id: a.patch.workspaceId, base_revision: a.patch.baseRevision, policy_digest: a.patch.policyDigest })) throw new Error("Approved L2 workspace required");
    assertApprovalDecision(grant, o.store.approvalReview?.(op.operationId), o.approvalPolicy);
    const expected = expectedApprovedSnapshot(a);
    if (op.resultDigest !== digestDurableValue({ snapshotDigest: expected.digest, patchDigest: a.patch.digest })) throw new Error("Approved validation result mismatch");
    const snapshot = await captureValidationSnapshot(workspace, expected, { sourceRevision: a.sourceRevision,
      policyVersion: a.policy.version, policyDigest: a.policyDigest, allowedPaths: [...new Set([...a.baseSnapshot.files.map(f => f.path), ...a.allowedPaths])] }, signal);
    const arguments_ = { artifact_digest: a.artifactDigest, transfer_digest: snapshot.manifest.transferDigest, action_digest: engineeringHash(JSON.stringify(action)), workspace_id: a.workspaceId };
    const invocation = { toolId: "sandbox.validate", arguments: arguments_ };
    const validationId = engineeringHash(JSON.stringify([a.executionId, a.workspaceId, arguments_]));
    let lease: import("@ai-harness/contracts").ContinuationLease | undefined;
    if (approvalId) {
      const selectedGrant = o.store.approval(approvalId), selected = selectedGrant && o.store.get(selectedGrant.operationId);
      if (selectedGrant?.status === "approved" && selected?.state === "Approved") {
        if (selected.executionId !== a.executionId || selected.taskId !== "sandbox-validation" || selected.requestId !== requestId || selected.toolId !== "sandbox.validate" ||
          selected.projectRoot !== workspace.receipt.root || selected.argumentDigest !== digestDurableValue(arguments_) || selected.requester.subject !== actor.subject || selected.requester.issuer !== actor.issuer) throw new Error("Sandbox approval scope mismatch");
        lease = o.store.acquireLease(selected.operationId, selected.version, 300000, actor);
      }
    }
    const registry = new ToolRegistry();
    registry.register({ id: "sandbox.validate", description: "Run one host-approved validation action in the approved Podman sandbox", permission: "shell:execute", risk: "high",
      inputSchema: { type: "object", properties: { artifact_digest: { type: "string", minLength: 64, maxLength: 64 }, transfer_digest: { type: "string", minLength: 64, maxLength: 64 }, action_digest: { type: "string", minLength: 64, maxLength: 64 }, workspace_id: { type: "string", minLength: 1, maxLength: 80 } }, required: Object.keys(arguments_), additionalProperties: false } });
    const dispatcher = new ToolDispatcher(registry, undefined, { store: o.store, requester: actor, safetyByTool: { "sandbox.validate": "side_effecting" } });
    let claim = false;
    dispatcher.registerHandler("sandbox.validate", async () => {
      if (approvalId === undefined) throw new Error("Validation approval required");
      const approval = o.store.approval(approvalId);
      if (!approval?.approver || approval.status !== "consumed") throw new Error("Validation approval required");
      assertApprovalDecision(approval, o.store.approvalReview?.(approval.operationId), o.approvalPolicy);
      const revalidated = await this.authorize(a, action);
      if (canonicalProposalJson(revalidated) !== canonicalProposalJson(actor)) throw new Error("Validation operator identity changed");
      if ((await workspace.inspect(signal)).digest !== snapshot.manifest.snapshotDigest) throw new Error("Validation snapshot changed");
      if (!lease) throw new Error("Fenced validation lease required");
      o.store.assertLease(lease);
      await o.evidence.claim(a.workspaceId, validationId); claim = true;
      o.store.assertLease(lease);
      const startedAt = new Date().toISOString(), monotonic = performance.now();
      const result = await o.runtime.execute(snapshot, action, signal);
      o.store.assertLease(lease);
      const validationOp = o.store.list(a.executionId, undefined, 1000).find(x => x.taskId === "sandbox-validation" && x.requestId === requestId);
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
      defaultDeny: true, grantedPermissions: ["shell:execute"], requireApprovalFor: ["shell:execute"], operation: { taskId: "sandbox-validation", requestId }, signal }, approvalId);
    if (result.status === "approval_required" && result.operationId && !o.store.approvalReview?.(result.operationId)) {
      if (!o.store.bindValidationReview) throw new Error("Reviewed validation approval unavailable");
      o.store.bindValidationReview(result.operationId, { policy: normalizeApprovalPolicy(o.approvalPolicy), workspaceId: a.workspaceId, artifactDigest: a.artifactDigest,
        patchDigest: a.patchDigest, snapshotDigest: snapshot.manifest.snapshotDigest, contentDigest: engineeringHash(JSON.stringify(action)), actionDigest: engineeringHash(JSON.stringify(action)) });
    }
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
  /** Read-only recovery: completed/uncertain evidence may be inspected in a new process, never replayed. */
  async inspectEvidence(artifact: ProposalArtifact, workspace: EngineeringWorkspace, actionId: string, validationId: string): Promise<ValidationRunEvidence> {
    const o = this.options, action = o.registry.get(actionId);
    await this.authorize(artifact, action);
    const { artifactDigest, ...unsigned } = artifact;
    if (engineeringHash(canonicalProposalJson(unsigned)) !== artifactDigest || o.store.proposal(artifact.operationId)?.artifactDigest !== artifactDigest || workspace.receipt.workspaceId !== artifact.workspaceId) throw new Error("Validation artifact mismatch");
    const evidence = await o.evidence.get(validationId), snapshot = expectedApprovedSnapshot(artifact);
    const operation = evidence && o.store.get(evidence.operationId);
    if (!evidence || !operation || !["Completed", "Uncertain"].includes(operation.state) || operation.toolId !== "sandbox.validate" ||
      operation.executionId !== artifact.executionId || operation.projectRoot !== workspace.receipt.root || evidence.executionId !== artifact.executionId || evidence.workspaceId !== artifact.workspaceId ||
      evidence.snapshotDigest !== snapshot.digest || (await workspace.inspect()).digest !== snapshot.digest || evidence.actionId !== actionId || evidence.runtimeProfile !== action.runtimeProfile ||
      evidence.imageDigest !== action.image.split("@sha256:")[1] || operation.state === "Completed" && operation.resultDigest !== digestDurableValue(evidence) || operation.state === "Uncertain" && evidence.classification === "passed") throw new Error("Durable validation evidence mismatch; reconciliation required");
    const grant = operation.approvalId && o.store.approval(operation.approvalId);
    if (!grant || grant.status !== "consumed") throw new Error("Consumed sandbox grant required");
    const review = o.store.approvalReview?.(operation.operationId);
    if (!review || review.artifactDigest !== artifactDigest || review.actionDigest !== engineeringHash(JSON.stringify(action)) || review.snapshotDigest !== evidence.snapshotDigest || review.workspaceId !== evidence.workspaceId) throw new Error("Validation evidence scope mismatch");
    assertApprovalDecision(grant, review, o.approvalPolicy);
    return evidence;
  }
  /** Host approval composition only. Does not execute or implicitly authorize validation. */
  async approve(artifact: ProposalArtifact, workspace: EngineeringWorkspace, actionId: string, credential: string, confirmation?: HumanApprovalPort, signal?: AbortSignal): Promise<void> {
    const o = this.options, action = o.registry.get(actionId), verifier = o.approvalVerifier?.(artifact, action);
    if (!verifier) throw new Error("Scoped authenticated validation approver required");
    await this.authorize(artifact, action);
    const actor = await verifier.verify(credential);
    if (actor.issuer !== artifact.requester.issuer || actor.subject !== artifact.requester.subject || actor.issuer !== "github.com" || !actor.roles.includes("harness:approver")) throw new Error("GitHub validation approver required");
    const pending = await this.prepare(artifact, workspace, actionId, signal);
    if (pending.status !== "approval_required" || !pending.approvalId || !pending.operationId) throw new Error("Pending validation approval required");
    const context = o.store.approvalReview?.(pending.operationId);
    let intent: import("@ai-harness/contracts").HumanIntentReceipt | undefined;
    if (normalizeApprovalPolicy(o.approvalPolicy).mode === "personal") {
      if (!context || !confirmation) throw new Error("Separate human sandbox confirmation required");
      const receipt = await confirmation.confirm({ project: o.project.id + " " + o.project.sourceRoot, context, actor: { issuer: actor.issuer, subject: actor.subject }, diff: JSON.stringify(action, null, 2),
        files: (await workspace.inspect(signal)).files.map(f => ({ path: f.path, operation: "validate" })), workspace: workspace.receipt.root, risk: "execute untrusted code in Podman" }, signal);
      if (!receipt) throw new Error("Sandbox approval cancelled");
      assertHumanIntent(receipt, context, actor); intent = receipt;
      await this.authorize(artifact, action);
      const fresh = await verifier.verify(credential);
      if (fresh.issuer !== actor.issuer || fresh.subject !== actor.subject || !fresh.roles.includes("harness:approver") ||
        (await workspace.inspect(signal)).digest !== context.snapshotDigest || canonicalProposalJson(o.store.approvalReview?.(pending.operationId)) !== canonicalProposalJson(context)) throw new Error("Sandbox review changed");
    }
    signal?.throwIfAborted();
    await new DurableApprovalService(o.store, verifier, o.approvalPolicy).decide(pending.approvalId, credential, true, undefined, intent);
  }
}
