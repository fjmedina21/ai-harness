/** TEST ONLY: mocked GitHub and Podman; actual private SQLite/FS in separate processes. */
import path from "node:path";
import { ProposalArtifactStore, FileValidationEvidenceStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { GitHubAuthentication, GitHubOAuthClient, HumanApprovalAuthority, type GitHubAuthPolicy } from "@ai-harness/security";
import { EngineeringWorkspace } from "../engineering-workspace.js";
import { ValidationCoordinator } from "../validation-coordinator.js";
import { SandboxValidationRegistry, PodmanSnapshotValidationRuntime } from "../snapshot-validation-runtime.js";
import { action, ValidationPodmanFixture } from "./phase9-validation-fixture.js";
import { PODMAN_OPTIONS } from "./podman-fixture.js";
const [base, mode, scenario = "valid"] = process.argv.slice(2);
if (!base || !mode) throw new Error("Missing fixture parameters");
const store = await openSqliteOperationJournal(path.join(base, "state", "ops.sqlite"));
let podmanCalls = 0, githubCalls = 0;
try {
  const patch = store.list("validation-fixture").find(o => o.toolId === "patch.apply")!, ref = store.proposal(patch.operationId)!;
  const artifact = new ProposalArtifactStore(path.join(base, "state"), false).get(ref.artifactDigest);
  const workspace = await EngineeringWorkspace.reopen(artifact.receipt, artifact.rootIdentity, store);
  const registry = new SandboxValidationRegistry(); registry.register(action);
  const actorId = scenario === "second-owner" ? "2002" : "1001", now = Date.now();
  const policy: GitHubAuthPolicy = { version: 1, ownerAccountId: "1001", clientId: "Iv1.validation-fixture", authorizationEndpoint: "https://github.com/login/oauth/authorize", tokenEndpoint: "https://github.com/login/oauth/access_token", callback: { host: "127.0.0.1", port: 53687, path: "/oauth/github/callback", timeoutMs: 1000 }, requestedPermissions: [], sessionMaxAgeMs: 3600000 };
  const authentication = new GitHubAuthentication(new GitHubOAuthClient(policy, (async input => {
    githubCalls++; return String(input).includes("applications/") ? Response.json({ app: { client_id: policy.clientId }, user: { id: Number(actorId) } }) : Response.json({ id: Number(actorId), login: "synthetic", type: "User" });
  }) as typeof fetch), { read: async name => name === "client-secret" ? "synthetic-not-real" : JSON.stringify({ version: 1, clientId: policy.clientId, accountId: actorId, login: "synthetic", accessToken: "ghu_synthetic_validation_only", createdAt: now - 1000, expiresAt: now + 3600000, tokenExpiresAt: now + 3600000 }), writeSession: async () => {}, clearSession: async () => {}, exclusive: async f => f() }, Date.now,
    [{ sourceRoot: artifact.receipt.sourceRoot, workspaceDirectory: path.join(base, "workspaces"), capabilities: ["harness:reader", "harness:operator", "harness:approver"] }]);
  const resource = { sourceRoot: artifact.receipt.sourceRoot, workspaceDirectory: path.join(base, "workspaces"), executionId: artifact.executionId, workspaceId: artifact.workspaceId };
  const project = { id: "fixture", sourceRoot: resource.sourceRoot, workspaceDirectory: resource.workspaceDirectory, policy: artifact.policy, actions: scenario === "profile" ? [] : [action] };
  if (scenario === "policy") project.policy = { ...project.policy, version: "altered" };
  const runner = new ValidationPodmanFixture();
  if (scenario === "timeout") runner.responseKind = "timeout";
  if (scenario === "output-limit") { runner.responseKind = "output_limit"; runner.actionExitCode = null; }
  const runtime = new PodmanSnapshotValidationRuntime(PODMAN_OPTIONS, runner, { verify: async () => {} });
  const coordinator = new ValidationCoordinator({ project, store, registry, evidence: new FileValidationEvidenceStore(path.join(base, "evidence")),
    authorize: async () => { const identity = await authentication.authorize("harness:operator", resource); return { issuer: identity.issuer, subject: identity.subject }; },
    approvalVerifier: () => ({ verify: async handle => { if (handle !== "fixture-handle") throw new Error(); const actor = await authentication.authorize("harness:approver", resource); return { ...actor, roles: ["harness:approver"] }; } }),
    runtime: { execute: async (...args) => { podmanCalls++; if (mode === "crash") { process.send?.({ paused: true }); await new Promise(() => {}); } return runtime.execute(...args); } } });
  let result: unknown;
  if (mode === "approve") {
    await coordinator.approve(artifact, workspace, "test", "fixture-handle", new HumanApprovalAuthority({ method: "reviewed-external-v1", verify: async () => scenario !== "cancelled" })); result = { approved: true };
  } else if (mode === "inspect") {
    // Recover the canonical validation ID from the durable evidence filename, without replay.
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(path.join(base, "evidence"))).filter(f => /^[a-f0-9]{64}\.json$/.test(f));
    if (files.length !== 1) throw new Error("Exact evidence required");
    result = await coordinator.inspectEvidence(artifact, workspace, "test", files[0]!.slice(0, -5));
  } else {
    const op = store.list(artifact.executionId).find(o => o.toolId === "sandbox.validate");
    result = mode === "prepare" ? await coordinator.prepare(artifact, workspace, "test") : await coordinator.execute(artifact, workspace, "test", op!.approvalId!);
  }
  process.send?.({ ok: true, result, podmanCalls, githubCalls, pid: process.pid });
} catch (error) { process.send?.({ ok: false, error: error instanceof Error ? error.message : "fixture-error", podmanCalls, githubCalls, pid: process.pid }); }
finally { store.close(); process.disconnect?.(); }
