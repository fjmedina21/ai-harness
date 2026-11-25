import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalProposalJson, EngineeringResumeError, type EngineeringResumeStore, type ProposalArtifact, type HumanApprovalPort, type ApprovalPolicy, type ApproverIdentityVerifier, type HostIdentity, type ValidationRunEvidence } from "@ai-harness/contracts";
import { FilePodmanAcceptanceStore, FileValidationEvidenceStore, ProposalArtifactStore } from "@ai-harness/checkpointing";
import { ValidationCoordinator, EngineeringWorkspace, SandboxValidationRegistry, PodmanSnapshotValidationRuntime, NodeProcessRunner, captureValidationSnapshot, expectedApprovedSnapshot, engineeringHash, openEngineeringSource, validateRuntimeOptions, type AuthorizedValidationProject, type PodmanExecutionOptions } from "@ai-harness/tools";
import { assertApprovalDecision } from "@ai-harness/security";

export interface LocalPodmanAcceptance {
  schemaVersion: 1;
  profile: "local-podman";
  ownerAccountId: string;
  projectAuthorizationDigest: string;
  acceptedAt: string;
  expiresAt: string;
  runtimeCodeDigest: string;
  runtime: PodmanExecutionOptions;
  /** Signed bounded host observation; not external attestation. */
  isolationEvidence: Record<string, unknown>;
  evidenceDirectory: string;
  artifactDigest: string;
  validationIds: { test: string; output: string; timeout: string; cancel: string };
}
/** Digest of the actual security/runtime programs, not documentation or a model-supplied SHA. */
export async function podmanRuntimeCodeDigest(): Promise<string> {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const files = ["tools/validation-coordinator", "tools/snapshot-validation-runtime", "tools/validation-receiver", "tools/validation-snapshot", "tools/container-runtime", "tools/container-executor", "tools/container-profile", "tools/container-operations", "tools/runtime-backend", "tools/podman-profile", "tools/process-runner", "tools/dispatcher", "tools/durable-dispatch", "tools/engineering-workspace", "tools/engineering-patches", "security/durable-approval", "security/approval-policy", "security/github-auth", "security/engineering-approval-broker", "checkpointing/sqlite-journal", "checkpointing/validation-evidence-store", "contracts/approval-policy", "application/podman-validation", "checkpointing/podman-acceptance-store"];
  const h = createHash("sha256"); for (const file of files) { const [pkg, name] = file.split("/"); h.update(file + "\0").update(await readFile(path.join(root, "packages", pkg!, "dist", name + ".js"))); } for (const file of ["engineering-cli", "github-host", "human-approval"]) h.update(file + "\0").update(await readFile(path.join(root, "apps/cli/dist", file + ".js"))); return h.digest("hex");
}
function check(value: unknown): asserts value { if (!value) throw new Error("validation_acceptance_pending"); }
export interface AcceptedValidationOptions {
  project: AuthorizedValidationProject;
  artifact: ProposalArtifact;
  artifacts: ProposalArtifactStore;
  journalDirectory: string;
  store: EngineeringResumeStore;
  approvalPolicy?: ApprovalPolicy;
  authorize(): Promise<HostIdentity>;
  approvalVerifier: ApproverIdentityVerifier;
  credential: string;
  confirmation: HumanApprovalPort;
}
function coordinator(o: AcceptedValidationOptions, a: LocalPodmanAcceptance, artifact: ProposalArtifact) {
  const registry = new SandboxValidationRegistry(); o.project.actions.forEach(p => registry.register(p));
  return new ValidationCoordinator({ project: o.project, store: o.store, evidence: new FileValidationEvidenceStore(a.evidenceDirectory), registry,
    approvalPolicy: o.approvalPolicy, authorize: async () => { const actor = await o.authorize(); check(actor.subject === a.ownerAccountId && actor.issuer === artifact.requester.issuer); return actor; },
    approvalVerifier: () => o.approvalVerifier, runtime: new PodmanSnapshotValidationRuntime(a.runtime, new NodeProcessRunner(), { verify: async (manifest, profile) => {
      check(a.runtimeCodeDigest === await podmanRuntimeCodeDigest() && Date.parse(a.expiresAt) > Date.now() && manifest.policyDigest === artifact.policyDigest && profile.image === a.runtime.image && o.project.actions.some(p => canonicalProposalJson(p) === canonicalProposalJson(profile)));
      const current = await new FilePodmanAcceptanceStore(o.journalDirectory).get();
      check(current && canonicalProposalJson(current) === canonicalProposalJson(a));
      await o.authorize();
    } }) });
}
/** Every read revalidates signed host policy plus durable real native approval and result evidence.
 * The trusted host publishing this record must also observe actual isolation probes; this is not external attestation. */
export async function verifyLocalPodmanAcceptance(raw: unknown, o: AcceptedValidationOptions): Promise<LocalPodmanAcceptance> {
  const a = raw as LocalPodmanAcceptance, now = Date.now();
  check(a && Object.keys(a).sort().join() === ["schemaVersion", "profile", "ownerAccountId", "projectAuthorizationDigest", "acceptedAt", "expiresAt", "runtimeCodeDigest", "runtime", "isolationEvidence", "evidenceDirectory", "artifactDigest", "validationIds"].sort().join() &&
    a.schemaVersion === 1 && a.profile === "local-podman" && a.ownerAccountId === o.artifact.requester.subject && a.projectAuthorizationDigest === o.project.authorizationDigest &&
    /^[a-f0-9]{64}$/.test(a.projectAuthorizationDigest) && a.runtimeCodeDigest === await podmanRuntimeCodeDigest() && Number.isFinite(Date.parse(a.acceptedAt)) && Date.parse(a.acceptedAt) <= now &&
    Date.parse(a.expiresAt) > now && Date.parse(a.expiresAt) <= Date.parse(a.acceptedAt) + 86400000 && Object.keys(a.validationIds ?? {}).sort().join() === "cancel,output,test,timeout" &&
    Object.values(a.validationIds).every(id => /^[a-f0-9]{64}$/.test(id)) && new Set(Object.values(a.validationIds)).size === 4 && path.dirname(a.evidenceDirectory) === path.dirname(o.journalDirectory));
  validateRuntimeOptions(a.runtime);
  const isolation = a.isolationEvidence;
  check(isolation && isolation.status === "passed" && isolation.image === a.runtime.image && isolation.cleanup === "confirmed" && isolation.cancellation === "confirmed" && isolation.cancellationRunning === true && isolation.timeout === "confirmed" &&
    typeof isolation.timestamp === "string" && Date.parse(isolation.timestamp) <= Date.parse(a.acceptedAt) && Date.parse(isolation.timestamp) >= Date.parse(a.acceptedAt) - 3600000 &&
    canonicalProposalJson(isolation.probes) === canonicalProposalJson({ uid: 65534, capabilities: "none", seccomp: 2, noNewPrivileges: true, rootReadonly: true, tmpfsBytes: 16777216, network: "denied", memoryBytes: 268435456, swapBytes: 0, pids: 64, cpu: 0.5 }));
  const actor = await o.authorize(); check(actor.issuer === "github.com" && actor.subject === a.ownerAccountId);
  const artifact = o.artifacts.get(a.artifactDigest), ref = o.store.proposal(artifact.operationId), patch = o.store.get(artifact.operationId);
  check(artifact.requester.subject === a.ownerAccountId && artifact.projectAuthorizationDigest === a.projectAuthorizationDigest && ref?.artifactDigest === artifact.artifactDigest && patch?.state === "Completed");
  const patchGrant = patch.approvalId && o.store.approval(patch.approvalId); check(patchGrant && patchGrant.status === "consumed" && patchGrant.decision?.intent?.method === "macos-local-auth-and-tty-v1");
  assertApprovalDecision(patchGrant, o.store.approvalReview?.(patch.operationId), o.approvalPolicy);
  const workspace = await EngineeringWorkspace.reopen(artifact.receipt, artifact.rootIdentity, o.store), c = coordinator(o, a, artifact);
  for (const actionId of ["test", "output", "timeout", "cancel"] as const) {
    const value = await c.inspectEvidence(artifact, workspace, actionId, a.validationIds[actionId]), operation = o.store.get(value.operationId);
    const grant = operation?.approvalId && o.store.approval(operation.approvalId);
    check(value.cleanup === "confirmed" && value.classification === ({ test: "passed", output: "failed", timeout: "timeout", cancel: "cancelled" } as const)[actionId] &&
      grant && grant.status === "consumed" && grant.decision?.intent?.method === "macos-local-auth-and-tty-v1" &&
      (actionId !== "output" || value.diagnostics.includes("action.output_limit")) && (actionId !== "timeout" || value.timedOut) && (actionId !== "cancel" || value.cancelled) &&
      (actionId === "cancel" ? operation?.state === "Uncertain" : operation?.state === "Completed"));
  }
  const source = await openEngineeringSource(artifact.receipt.sourceRoot, artifact.executionId, artifact.baseSnapshot.files.map(f => f.path)); check((await source.inspect()).digest === artifact.sourceRevision);
  return structuredClone(a);
}
export async function runAcceptedPodmanValidation(o: AcceptedValidationOptions, actionId: string, signal?: AbortSignal): Promise<{ profile: "local-podman"; operationState: string; validation: ValidationRunEvidence }> {
  const raw = await new FilePodmanAcceptanceStore(o.journalDirectory).get(); check(raw);
  const acceptance = await verifyLocalPodmanAcceptance(raw, o);
  const workspace = await EngineeringWorkspace.reopen(o.artifact.receipt, o.artifact.rootIdentity, o.store), c = coordinator(o, acceptance, o.artifact);
  const action = o.project.actions.find(p => p.id === actionId); check(action && action.image === acceptance.runtime.image);
  const existing = o.store.list(o.artifact.executionId, undefined, 1000).find(op => op.toolId === "sandbox.validate" && op.taskId === "sandbox-validation" && op.requestId === actionId);
  if (existing && ["Completed", "Uncertain"].includes(existing.state)) {
    const snapshot = await captureValidationSnapshot(workspace, expectedApprovedSnapshot(o.artifact), { sourceRevision: o.artifact.sourceRevision, policyVersion: o.artifact.policy.version, policyDigest: o.artifact.policyDigest, allowedPaths: o.artifact.policy.allowedPaths });
    const args = { artifact_digest: o.artifact.artifactDigest, transfer_digest: snapshot.manifest.transferDigest, action_digest: engineeringHash(JSON.stringify(action)), workspace_id: o.artifact.workspaceId };
    const validationId = engineeringHash(JSON.stringify([o.artifact.executionId, o.artifact.workspaceId, args]));
    return { profile: "local-podman", operationState: existing.state, validation: await c.inspectEvidence(o.artifact, workspace, actionId, validationId) };
  }
  const pending = await c.prepare(o.artifact, workspace, actionId, signal); check(pending.status === "approval_required" && pending.operationId && pending.approvalId);
  if (o.store.get(pending.operationId)?.state === "PendingApproval") await c.approve(o.artifact, workspace, actionId, o.credential, o.confirmation, signal);
  const result = await c.execute(o.artifact, workspace, actionId, pending.approvalId, signal);
  if (result.operationState === "Uncertain") throw new EngineeringResumeError("reconciliation_required");
  check(result.status === "executed" && result.operationState === "Completed"); return { profile: "local-podman", operationState: result.operationState, validation: result.data as ValidationRunEvidence };
}
