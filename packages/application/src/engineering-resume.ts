import { lstat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { emitTelemetry, canonicalProposalJson, normalizeApprovalPolicy, EngineeringResumeError, type ContinuationLease, type EngineeringPolicy, type EngineeringResumeStore, type ProposalArtifact, type ResumeIdentityVerifier } from "@ai-harness/contracts";
import { ProposalArtifactStore, sealProposalArtifact } from "@ai-harness/checkpointing";
import { ApprovalBroker, digestDurableValue, assertApprovalDecision } from "@ai-harness/security";
import { EngineeringPatchEngine, EngineeringWorkspace, engineeringHash, openEngineeringSource, patchInvocation, createEngineeringTools, expectedApprovedSnapshot } from "@ai-harness/tools";

export async function persistEngineeringProposal(store: EngineeringResumeStore, artifacts: ProposalArtifactStore,
  input: Omit<ProposalArtifact, "schemaVersion" | "artifactDigest" | "rootIdentity" | "createdAt" | "expiresAt" | "policyEncoding">, approvalPolicy?: import("@ai-harness/contracts").ApprovalPolicy): Promise<ProposalArtifact> {
  try {
    const op = store.get(input.operationId), grant = op?.approvalId && store.approval(op.approvalId);
    if (!op || op.state !== "PendingApproval" || !grant || grant.status !== "pending") throw new EngineeringResumeError("approval_mismatch");
    const root = await lstat(input.receipt.root, { bigint: true });
    const artifact = sealProposalArtifact({ ...input, policyEncoding: JSON.stringify(input.policy), schemaVersion: 1, rootIdentity: { dev: root.dev.toString(), ino: root.ino.toString() },
      createdAt: new Date().toISOString(), expiresAt: new Date(Math.min(input.receipt.expiresAt, Date.parse(grant.expiresAt))).toISOString() });
    artifacts.put(artifact); // fsync + MAC/digest verification precede the SQLite reference commit.
    store.bindProposal({ operationId: op.operationId, executionId: artifact.executionId, workspaceId: artifact.workspaceId,
      artifactDigest: artifact.artifactDigest, expiresAt: artifact.expiresAt, challenge: randomBytes(32).toString("hex") }, {
        policy: normalizeApprovalPolicy(approvalPolicy), workspaceId: artifact.workspaceId, artifactDigest: artifact.artifactDigest, patchDigest: artifact.patchDigest, snapshotDigest: artifact.baseSnapshot.digest, contentDigest: artifact.diffDigest,
      });
    // A failed/unknown commit acknowledgment is never published as ApprovalPending.
    if (store.proposal(op.operationId)?.artifactDigest !== artifact.artifactDigest) throw new EngineeringResumeError("storage_uncertain");
    return artifact;
  } catch {
    // Unknown FS/SQLite acknowledgment never leaves this owner able to use an unbound operation.
    store.retireSession(); throw new EngineeringResumeError("storage_uncertain");
  }
}

/** Apply-only recovery. No provider/model/session port exists in this composition. */
export class EngineeringRecoveryService {
  constructor(private readonly store: EngineeringResumeStore, private readonly artifacts: ProposalArtifactStore,
    private readonly currentPolicy: EngineeringPolicy) { this.currentPolicy = structuredClone(currentPolicy); }
  artifact(operationId: string): ProposalArtifact {
    const ref = this.store.proposal(operationId), op = this.store.get(operationId);
    if (!ref || !op) throw new EngineeringResumeError("artifact_missing");
    const a = this.artifacts.get(ref.artifactDigest);
    if (a.operationId !== operationId || a.executionId !== ref.executionId || a.workspaceId !== ref.workspaceId || a.expiresAt !== ref.expiresAt ||
      canonicalProposalJson(a.requester) !== canonicalProposalJson(op.requester) || a.receipt.root !== op.projectRoot ||
      op.argumentDigest !== digestDurableValue(patchInvocation(a.patch).arguments)) throw new EngineeringResumeError("artifact_invalid");
    if (Date.parse(a.expiresAt) <= Date.now()) throw new EngineeringResumeError("approval_expired");
    if (canonicalProposalJson(this.currentPolicy) !== canonicalProposalJson(a.policy)) throw new EngineeringResumeError("policy_changed");
    const review = this.store.approvalReview?.(operationId);
    if (review && (review.patchDigest !== a.patchDigest || review.snapshotDigest !== a.baseSnapshot.digest || review.contentDigest !== a.diffDigest || review.artifactDigest !== a.artifactDigest || review.workspaceId !== a.workspaceId)) throw new EngineeringResumeError("artifact_invalid");
    return a;
  }
  /** Verify a complete authenticated, consumed predecessor chain; never infer a missing link. */
  verifyRepairChain(a: ProposalArtifact): import("@ai-harness/contracts").WorkspaceSnapshot {
    if (!a.repairContext) return a.baseSnapshot;
    const original = a.repairContext.originalSnapshot, seen = new Set<string>([a.operationId]);
    let current = a;
    for (let depth = 0; depth < 17; depth++) {
      const context = current.repairContext;
      if (!context) {
        if (current.baseSnapshot.digest !== original.digest || canonicalProposalJson(current.baseSnapshot) !== canonicalProposalJson(original)) throw new EngineeringResumeError("artifact_invalid");
        return original;
      }
      if (context.sessionId !== a.executionId || context.profileDigest !== a.repairContext!.profileDigest || context.repairPolicyDigest !== a.repairContext!.repairPolicyDigest) throw new EngineeringResumeError("policy_changed");
      if (seen.has(context.parentOperationId)) throw new EngineeringResumeError("artifact_invalid");
      seen.add(context.parentOperationId);
      const ref = this.store.proposal(context.parentOperationId), op = this.store.get(context.parentOperationId);
      if (!ref || !op || op.state !== "Completed") throw new EngineeringResumeError("reconciliation_required");
      const parent = this.artifacts.get(ref.artifactDigest), grant = op.approvalId && this.store.approval(op.approvalId);
      if (!grant || grant.status !== "consumed") throw new EngineeringResumeError("approval_mismatch");
      assertApprovalDecision(grant, this.store.approvalReview?.(op.operationId));
      const expected = expectedApprovedSnapshot(parent);
      if (parent.operationId !== op.operationId || ref.executionId !== a.executionId || parent.executionId !== a.executionId || parent.workspaceId !== a.workspaceId ||
        canonicalProposalJson(parent.requester) !== canonicalProposalJson(a.requester) || canonicalProposalJson(parent.receipt) !== canonicalProposalJson(a.receipt) ||
        parent.sourceRevision !== a.sourceRevision || parent.projectAuthorizationDigest !== a.projectAuthorizationDigest || canonicalProposalJson(parent.policy) !== canonicalProposalJson(a.policy) ||
        canonicalProposalJson(expected) !== canonicalProposalJson(current.baseSnapshot) ||
        op.argumentDigest !== digestDurableValue(patchInvocation(parent.patch).arguments) || op.resultDigest !== digestDurableValue({ snapshotDigest: expected.digest, patchDigest: parent.patchDigest })) throw new EngineeringResumeError("artifact_invalid");
      current = parent;
    }
    throw new EngineeringResumeError("reconciliation_required");
  }
  async reconcile(operationId: string, signal?: AbortSignal, assertFence?: () => void): Promise<{ artifact: ProposalArtifact; workspace: EngineeringWorkspace; engine: EngineeringPatchEngine; diff: string }> {
    signal?.throwIfAborted();
    const a = this.artifact(operationId), op = this.store.get(operationId)!;
    const operations = this.store.list(a.executionId, undefined, 1000);
    if (!["PendingApproval", "Approved"].includes(op.state) || operations.length === 1000 || operations.some(x => x.operationId !== operationId && x.state !== "Completed")) throw new EngineeringResumeError("reconciliation_required");
    let workspace: EngineeringWorkspace;
    try { workspace = await EngineeringWorkspace.reopen(a.receipt, a.rootIdentity, this.store); }
    catch { throw new EngineeringResumeError("reconciliation_required"); }
    // Only the originally host-selected source scope is re-read; never scan an arbitrary repository.
    try {
      const original = this.verifyRepairChain(a);
      const source = await openEngineeringSource(a.receipt.sourceRoot, a.executionId, original.files.map(f => f.path));
      if ((await source.inspect(signal)).digest !== a.sourceRevision || (await workspace.inspect(signal)).digest !== a.baseSnapshot.digest) throw new Error();
    } catch { throw new EngineeringResumeError("snapshot_changed"); }
    const engine = new EngineeringPatchEngine(workspace, JSON.parse(a.policyEncoding) as EngineeringPolicy, assertFence);
    if (engine.policyDigest !== a.policyDigest) throw new EngineeringResumeError("policy_changed");
    try {
      await engine.restore(a.patch, signal);
      const diff = await engine.diff(a.patchDigest, signal);
      if (engineeringHash(diff) !== a.diffDigest) throw new Error();
      return { artifact: a, workspace, engine, diff };
    } catch { throw new EngineeringResumeError("artifact_invalid"); }
  }
}
export class ExecutionLeaseManager {
  constructor(private readonly store: EngineeringResumeStore) {}
  acquire(operationId: string, ttlMs: number, actor: import("@ai-harness/contracts").HostIdentity): ContinuationLease {
    try { const op = this.store.get(operationId); if (!op) throw new Error(); return this.store.acquireLease(operationId, op.version, ttlMs, actor); }
    catch { throw new EngineeringResumeError("lease_conflict"); }
  }
  assert(lease: ContinuationLease): void {
    try { this.store.assertLease(lease); } catch { throw new EngineeringResumeError("lease_conflict"); }
  }
}
export interface ContinuationOptions {
  /** Trusted host repair lifecycle fence, rechecked before every filesystem effect. */
  assertContinuation?(): void;
  /** Already opened/validated host journal, never project configuration. */
  store: EngineeringResumeStore;
  artifacts: ProposalArtifactStore;
  policy: EngineeringPolicy;
  verifier?: ResumeIdentityVerifier;
  approvalPolicy?: import("@ai-harness/contracts").ApprovalPolicy;
  telemetry?: import("@ai-harness/contracts").TelemetryBinding;
}
export class ContinuationCoordinator {
  private readonly broker: ApprovalBroker;
  private readonly recovery: EngineeringRecoveryService;
  private readonly leases: ExecutionLeaseManager;
  constructor(private readonly options: ContinuationOptions) {
    this.options = { ...options, policy: structuredClone(options.policy), approvalPolicy: normalizeApprovalPolicy(options.approvalPolicy) };
    this.broker = new ApprovalBroker(options.store, options.verifier, Date.now, options.approvalPolicy);
    this.recovery = new EngineeringRecoveryService(options.store, options.artifacts, options.policy);
    this.leases = new ExecutionLeaseManager(options.store);
  }
  private event(operationId: string, resumeEvent: NonNullable<import("@ai-harness/contracts").TelemetryAttributes["resumeEvent"]>): void {
    emitTelemetry(this.options.telemetry, "engineering.resume", { operationId, resumeEvent });
  }
  status(operationId: string, credential: string) { return this.broker.status(operationId, credential); }
  async diff(operationId: string, credential: string): Promise<string> {
    await this.broker.authenticate(operationId, "diff", credential);
    return this.recovery.artifact(operationId).diff;
  }
  async decide(operationId: string, credential: string, approved: boolean, confirmation?: import("@ai-harness/contracts").HumanApprovalPort, signal?: AbortSignal): Promise<void> {
    await this.broker.decide(operationId, credential, approved, async () => {
      if (approved) await this.recovery.reconcile(operationId);
      else this.recovery.artifact(operationId);
    }, confirmation ? async (actor, context) => {
      const artifact = this.recovery.artifact(operationId);
      return confirmation.confirm({ context, actor: { issuer: actor.issuer, subject: actor.subject }, diff: artifact.diff,
        files: artifact.patch.changes.map(c => ({ path: c.path, operation: c.operation })), workspace: artifact.receipt.root, risk: this.options.store.get(operationId)!.risk + ": code modification in isolated workspace" }, signal);
    } : undefined);
    this.event(operationId, approved ? "approval.granted" : "approval.rejected");
  }
  async continue(operationId: string, credential: string, timeoutMs: number, cancellation?: AbortSignal): Promise<{
    state: "ReviewPending"; operationState: "Completed"; snapshotDigest: string; patchDigest: string; diff: string; integrated: false; validationScope: "inventory_only";
  }> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new EngineeringResumeError("timeout");
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = AbortSignal.any([timeout.signal, ...(cancellation ? [cancellation] : [])]);
    const started = performance.now();
    try {
      let abortListener: (() => void) | undefined;
      const actor = await Promise.race([
        this.broker.authenticate(operationId, "continue", credential),
        new Promise<never>((_, reject) => {
          abortListener = () => reject(new EngineeringResumeError(cancellation?.aborted ? "cancelled" : "timeout"));
          signal.addEventListener("abort", abortListener, { once: true });
          if (signal.aborted) abortListener();
        }),
      ]).finally(() => { if (abortListener) signal.removeEventListener("abort", abortListener); });
      const checkDeadline = () => {
        this.options.assertContinuation?.();
        if (cancellation?.aborted) throw new EngineeringResumeError("cancelled");
        if (signal.aborted || performance.now() - started >= timeoutMs) throw new EngineeringResumeError("timeout");
        if (Date.now() >= actor.expiresAt) throw new EngineeringResumeError("authentication_required");
      };
      checkDeadline();
      this.event(operationId, "reconciliation.started");
      try { await this.recovery.reconcile(operationId, signal); }
      catch (e) {
        this.event(operationId, e instanceof EngineeringResumeError && e.code === "approval_expired" ? "approval.expired" : "reconciliation.failed"); throw e;
      }
      const op = this.options.store.get(operationId)!, grant = op.approvalId && this.options.store.approval(op.approvalId);
      if (!grant || grant.status !== "approved") throw new EngineeringResumeError("approval_mismatch");
      try { assertApprovalDecision(grant, this.options.store.approvalReview?.(operationId), this.options.approvalPolicy); }
      catch { throw new EngineeringResumeError("approval_mismatch"); }
      checkDeadline();
      let lease: ContinuationLease;
      try { lease = this.leases.acquire(operationId, timeoutMs, { issuer: actor.issuer, subject: actor.subject }); }
      catch (e) { this.event(operationId, "lease.conflict"); throw e; }
      this.event(operationId, "lease.acquired");
      const fence = () => { checkDeadline(); this.leases.assert(lease); };
      const reconciled = await this.recovery.reconcile(operationId, signal, fence); fence();
      const tools = createEngineeringTools(reconciled.engine, { store: this.options.store, requester: op.requester, safetyByTool: { "patch.apply": "side_effecting" } });
      // Existing dispatcher atomically consumes approval + records Prepared, then Running. A crash blocks replay.
      this.event(operationId, "continuation.started");
      const result = await tools.dispatch(patchInvocation(reconciled.artifact.patch), { taskId: op.taskId, requestId: op.requestId }, op.approvalId, signal);
      if (result.status !== "executed" || result.operationState !== "Completed") {
        this.event(operationId, ["Prepared", "Running", "Uncertain"].includes(result.operationState ?? "") ? "operation.uncertain" : "reconciliation.failed");
        throw new EngineeringResumeError("reconciliation_required");
      }
      this.event(operationId, "continuation.completed");
      // Engine verified the complete expected resulting inventory before dispatcher committed Completed.
      const data = result.data as { snapshotDigest: string; patchDigest: string };
      return { state: "ReviewPending", operationState: "Completed", ...data, diff: reconciled.diff, integrated: false, validationScope: "inventory_only" };
    } catch (e) {
      if (e instanceof EngineeringResumeError) throw e;
      throw new EngineeringResumeError("storage_uncertain");
    } finally { clearTimeout(timer); }
  }
}
