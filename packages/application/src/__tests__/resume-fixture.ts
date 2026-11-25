/** Deterministic independent identity + HTTP fixtures. NEVER imported by product code. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { canonicalProposalJson, type EngineeringPolicy, type EngineeringResumeStore, type ProposalReference, type ResumeAction, type ResumeIdentityVerifier, type ResumeIdentityChallenge } from "@ai-harness/contracts";
import { EngineeringCheckpointStore, ProposalArtifactStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { createOpenAIEngineeringAgent } from "../engineering-provider.js";
import { runEngineeringWorkflow } from "../engineering.js";

export const policy: EngineeringPolicy = { version: "resume-fixture-v1", allowedPaths: ["value.ts", "second.ts"], allowedOperations: ["replace"], maxFiles: 2, maxBytes: 8192 };
const key = "ONLY DETERMINISTIC TEST FIXTURE KEY - NOT PRODUCTION";
export function credential(ref: ProposalReference, action: ResumeAction, overrides: Record<string, unknown> = {}): string {
  const binding: ResumeIdentityChallenge = { action, executionId: ref.executionId, workspaceId: ref.workspaceId, artifactDigest: ref.artifactDigest, challenge: ref.challenge };
  const data = { issuer: "fixture", subject: action === "continue" ? "operator" : "human", roles: ["harness:approver", "harness:reader", "harness:operator"],
    audience: "fixture-harness", expiresAt: Date.now() + 60_000, binding, ...overrides };
  const text = Buffer.from(JSON.stringify(data)).toString("base64url");
  return text + "." + createHmac("sha256", key).update(text).digest("hex");
}
export const verifier: ResumeIdentityVerifier = { async verify(token, challenge) {
  const [text, signature] = token.split(".");
  if (!text || !signature || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(createHmac("sha256", key).update(text).digest(), Buffer.from(signature, "hex"))) throw new Error("PRIVATE fixture forged");
  const actor = JSON.parse(Buffer.from(text, "base64url").toString());
  if (actor.audience !== "fixture-harness" || actor.issuer !== "fixture" || actor.expiresAt <= Date.now() || canonicalProposalJson(actor.binding) !== canonicalProposalJson(challenge)) throw new Error("PRIVATE fixture unauthorized");
  return actor;
} };
export async function openFixture(base: string, options: Parameters<typeof openSqliteOperationJournal>[1] = {}) {
  const store = await openSqliteOperationJournal(path.join(base, "state", "ops.sqlite"), { approvalTtlMs: 300_000, ...options });
  const artifacts = new ProposalArtifactStore(path.join(base, "state"));
  return { store, artifacts };
}
export async function generate(base: string, supplied?: EngineeringResumeStore, twoFiles = false, host: { approvalPolicy?: import("@ai-harness/contracts").ApprovalPolicy; requester?: import("@ai-harness/contracts").HostIdentity } = {}) {
  const opened = supplied ? undefined : await openFixture(base);
  const store = supplied ?? opened!.store, artifacts = opened?.artifacts ?? new ProposalArtifactStore(path.join(base, "state"));
  let calls = 0;
  const agent = createOpenAIEngineeringAgent({ model: "fixture-model", maxRequests: 8, maxOutputTokens: 512, maxContextBytes: 16384, maxContextTokens: 8192,
    allowUncertainCost: true, paidCallConfirmed: true, providerOptions: { apiKey: "fixture-not-real", fetcher: async (_url, init) => {
      calls++;
      const input = JSON.parse(JSON.parse(String(init?.body)).input);
      const proposal = { baseRevision: input.snapshot.digest, changes: input.snapshot.files.map((f: { path: string; hash: string }) => ({ path: f.path, operation: "replace", baseHash: f.hash, content: "export const value = 2;\n", resultHash: null })) };
      const output = { summary: "Fixture advisory only", ...(input.role === "backend-developer" ? { proposal } : {}) };
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }], usage: { input_tokens: 100, output_tokens: 20 } });
    } } });
  const result = await runEngineeringWorkflow({ projectRoot: path.join(base, "source"), request: "Replace selected constants", files: twoFiles ? ["value.ts", "second.ts"] : ["value.ts"], level: 2,
    policy, budget: { maxIterations: 1, maxRequests: 8, maxTokens: 80000, maxEstimatedCostUsd: 0, timeoutMs: 5000, maxFiles: 2, maxBytes: 8192 },
    agent, modelAdapterAuthorized: true, allowUncertainCost: true, approvalPolicy: host.approvalPolicy, proposalArtifacts: artifacts, checkpoint: new EngineeringCheckpointStore(path.join(base, "state")),
    workspace: { directory: path.join(base, "workspaces"), createAuthorized: true, ttlMs: 300_000, binding: { store, requester: host.requester ?? { issuer: "fixture", subject: "requester" }, safetyByTool: {} } } });
  const op = store.list(result.executionId).find(op => op.toolId === "patch.apply");
  opened?.store.close();
  return { result, operationId: op?.operationId, calls };
}
export async function directories(base: string) {
  for (const dir of ["source", "state", "workspaces"]) await mkdir(path.join(base, dir), { mode: 0o700 });
}
