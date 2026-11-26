import path from "node:path";
import { lstat } from "node:fs/promises";
import { RepairCoordinator, createAcceptedRepairValidationPort, createOpenAIEngineeringAgent, FixtureEngineeringAgent, type EngineeringAgentPort } from "@ai-harness/application";
import { openSqliteOperationJournal, ProposalArtifactStore } from "@ai-harness/checkpointing";
import { canonicalProposalJson, EngineeringResumeError, type EngineeringResumeStore, type RepairPolicy, type RepairSession } from "@ai-harness/contracts";
import { GitHubAuthError } from "@ai-harness/security";
import { loadGitHubHost, projectAuthorizationDigest, type GitHubHost } from "./github-host.js";
import { createInteractiveApprovalPort } from "./human-approval.js";
import { readPrivateCostRates } from "./rates.js";

const values = ["--id", "--max-iterations", "--validation-id", "--request", "--profile", "--action", "--provider", "--model", "--max-provider-requests", "--max-output-tokens", "--max-total-tokens", "--max-context-bytes", "--max-context-tokens", "--timeout-ms", "--request-timeout-ms", "--rates", "--max-cost-usd", "--fixture-file", "--fixture-content"];
const flags = ["--json", "--confirm-provider-call", "--allow-uncertain-cost"];
function report(session: RepairSession) {
  const p = session.policy, c = session.consumed, r = session.reserved;
  const remaining = (maximum: number, consumed: number, reserved: number) => Math.max(0, maximum - consumed - reserved);
  return { session, budgetRemaining: {
    iterations: remaining(p.maxIterations, c.iterations, r.iterations), providerRequests: remaining(p.maxProviderRequests, c.providerRequests, r.providerRequests),
    inputTokens: remaining(p.maxInputTokens, c.inputTokens, r.inputTokens), outputTokens: remaining(p.maxOutputTokens, c.outputTokens, r.outputTokens),
    validations: remaining(p.maxValidations, c.validations, r.validations), files: remaining(p.maxFiles, c.files, r.files), patchBytes: remaining(p.maxPatchBytes, c.patchBytes, r.patchBytes),
    estimatedCostUsd: c.estimatedCostUsd === null || r.estimatedCostUsd === null ? null : remaining(p.maxEstimatedCostUsd, c.estimatedCostUsd, r.estimatedCostUsd),
    globalMs: Math.max(0, Date.parse(session.deadlineAt) - Date.now()),
  }, lastResult: { validationId: session.lastValidation.validationId, action: session.actionId, classification: session.lastValidation.classification, diagnostics: session.lastNormalized?.diagnostics ?? session.lastValidation.diagnostics },
    terminalClassification: ["Completed", "Cancelled", "BudgetExhausted", "NoProgress", "Blocked", "Failed", "ReconciliationRequired"].includes(session.state) ? session.state : null,
    originalSourceModified: false, integrated: false };
}
function integer(raw: string | undefined, fallback: number, maximum: number): number {
  if (raw !== undefined && !/^[0-9]+$/.test(raw)) throw new GitHubAuthError("invalid_arguments");
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > maximum) throw new GitHubAuthError("invalid_arguments");
  return n;
}
/** Owner/project authorization precedes private state inspection. No approval or runtime execution occurs here. */
export async function repairCommand(args: string[], output: (text: string) => void, signal?: AbortSignal,
  loadHost: () => Promise<GitHubHost> = loadGitHubHost, validationFactory: typeof createAcceptedRepairValidationPort = createAcceptedRepairValidationPort): Promise<number> {
  const stores: EngineeringResumeStore[] = [];
  let agent: EngineeringAgentPort | undefined;
  try {
    const [command, ...argv] = args;
    if (!["repair", "repair-status", "repair-history"].includes(command ?? "")) throw new GitHubAuthError("invalid_arguments");
    const options = new Map<string, string>();
    for (let i = 0; i < argv.length; i++) {
      const key = argv[i]!;
      if (options.has(key) || ![...values, ...flags].includes(key) || command !== "repair" && !["--id", "--json"].includes(key)) throw new GitHubAuthError("invalid_arguments");
      if (flags.includes(key)) options.set(key, "true");
      else { const value = argv[++i]; if (!value || value.startsWith("--")) throw new GitHubAuthError("invalid_arguments"); options.set(key, value); }
    }
    const executionId = options.get("--id");
    if (!/^[A-Za-z0-9-]{1,80}$/.test(executionId ?? "")) throw new GitHubAuthError("invalid_arguments");
    const host = await loadHost(), identity = await host.authentication.identity(signal);
    if (identity.issuer !== "github.com" || identity.subject !== host.configuration.auth.ownerAccountId) throw new EngineeringResumeError("forbidden_scope");
    const role = command === "repair" ? "harness:operator" : "harness:reader";
    let selected: { store: EngineeringResumeStore; workspace: GitHubHost["configuration"]["workspaces"][number]; operationId: string; session: RepairSession | null } | undefined;
    for (const workspace of host.configuration.workspaces) {
      if (!host.authentication.roles(identity, { sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, executionId }).includes(role)) continue;
      try { await lstat(workspace.journalFile); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      const store = await openSqliteOperationJournal(workspace.journalFile, { approvalPolicy: workspace.approval ?? host.configuration.approval }); stores.push(store);
      const operations = store.list(executionId!, undefined, 1000);
      if (operations.length === 1000) throw new EngineeringResumeError("reconciliation_required");
      const session = store.repair?.get(executionId!) ?? null;
      if (session && (session.executionId !== executionId || session.ownerId !== identity.subject || session.projectId !== workspace.id)) throw new EngineeringResumeError("forbidden_scope");
      const proposals = operations.filter(op => store.proposal(op.operationId));
      if (!proposals.length) continue;
      const operation = session ? proposals.find(op => op.operationId === session.currentOperationId) : proposals.length === 1 ? proposals[0] : undefined;
      if (selected || !operation || operation.toolId !== "patch.apply" || operation.requester.issuer !== identity.issuer || operation.requester.subject !== identity.subject) throw new EngineeringResumeError("reconciliation_required");
      selected = { store, workspace, operationId: operation.operationId, session };
    }
    if (!selected) throw new EngineeringResumeError("forbidden_scope");
    const { store, workspace, operationId, session } = selected;
    if (!store.repair) throw new EngineeringResumeError("reconciliation_required");
    const approvalPolicy = workspace.approval ?? host.configuration.approval;
    const authorizationDigest = projectAuthorizationDigest(workspace, approvalPolicy);
    const authorize = async () => {
      const current = await loadHost(), registered = current.configuration.workspaces.find(w => w.id === workspace.id);
      if (!registered || projectAuthorizationDigest(registered, current.configuration.approval) !== authorizationDigest) throw new EngineeringResumeError("policy_changed");
      const actor = await current.authentication.authorize(role, { sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, executionId }, signal);
      if (actor.issuer !== "github.com" || actor.subject !== identity.subject || actor.subject !== current.configuration.auth.ownerAccountId) throw new EngineeringResumeError("forbidden_scope");
      return { issuer: actor.issuer, subject: actor.subject };
    };
    await authorize();
    const artifacts = new ProposalArtifactStore(path.dirname(workspace.journalFile), false);
    const artifact = artifacts.get(store.proposal(operationId)!.artifactDigest);
    if (artifact.projectAuthorizationDigest !== authorizationDigest || artifact.requester.subject !== identity.subject || artifact.requester.issuer !== identity.issuer || artifact.executionId !== executionId ||
      artifact.receipt.sourceRoot !== workspace.sourceRoot || path.dirname(path.dirname(artifact.receipt.root)) !== workspace.workspaceDirectory || canonicalProposalJson(artifact.policy) !== canonicalProposalJson(workspace.policy)) throw new EngineeringResumeError("forbidden_scope");
    if (!workspace.allowedToolIds.includes("diff.inspect") || command === "repair" && !["patch.apply", "sandbox.validate"].every(id => workspace.allowedToolIds.includes(id))) throw new EngineeringResumeError("forbidden_scope");
    if (command !== "repair") {
      if (!session) throw new EngineeringResumeError("artifact_missing");
      const coordinator = new RepairCoordinator({ store, artifacts, policy: workspace.policy, repairPolicy: session.policy, projectId: workspace.id, ownerId: identity.subject, projectAuthorizationDigest: authorizationDigest, authorize });
      output(JSON.stringify({ executionId, ...(command === "repair-status" ? report(await coordinator.status(executionId!)) : { history: await coordinator.history(executionId!) }), originalSourceModified: false, integrated: false }));
      return 0;
    }
    if (options.get("--profile") !== undefined && options.get("--profile") !== "local-podman") throw new GitHubAuthError("validation_acceptance_pending");
    if (!session && (!options.get("--request") || !options.get("--validation-id") || !options.get("--action") || options.get("--profile") !== "local-podman")) throw new GitHubAuthError("invalid_arguments");
    if (session && ["--request", "--validation-id", "--profile", "--action"].some(key => options.has(key) && options.get(key) !== ({ "--request": session.originalObjective, "--validation-id": session.lastValidation.validationId, "--profile": session.profileId, "--action": session.actionId } as Record<string, string>)[key])) throw new EngineeringResumeError("policy_changed");
    const iterations = integer(options.get("--max-iterations"), session?.policy.maxIterations ?? Math.min(3, workspace.limits.maxIterations), Math.min(8, workspace.limits.maxIterations));
    if (session && iterations !== session.policy.maxIterations) throw new EngineeringResumeError("policy_changed");
    const provider = options.get("--provider"), model = options.get("--model");
    if (provider !== undefined && !["openai", "fixture"].includes(provider)) throw new GitHubAuthError("invalid_arguments");
    const maxRequests = integer(options.get("--max-provider-requests"), session?.policy.maxProviderRequests ?? Math.min(8, workspace.limits.maxRequests), Math.min(32, workspace.limits.maxRequests));
    const maxTokens = integer(options.get("--max-total-tokens"), session ? session.policy.maxInputTokens + session.policy.maxOutputTokens : workspace.limits.maxTokens, workspace.limits.maxTokens);
    const timeoutMs = integer(options.get("--timeout-ms"), session?.policy.maxGlobalMs ?? Math.min(120000, workspace.limits.timeoutMs), Math.min(900000, workspace.limits.timeoutMs));
    const requestMs = integer(options.get("--request-timeout-ms"), session?.policy.maxProviderMs ?? Math.min(30000, timeoutMs), Math.min(300000, timeoutMs));
    const rawCost = options.get("--max-cost-usd"), maxCost = rawCost === undefined ? session?.policy.maxEstimatedCostUsd ?? workspace.limits.maxEstimatedCostUsd : Number(rawCost);
    if (!Number.isFinite(maxCost) || maxCost < 0 || maxCost > workspace.limits.maxEstimatedCostUsd) throw new GitHubAuthError("invalid_arguments");
    const repairPolicy: RepairPolicy = session?.policy ?? { version: 1, enabled: true, maxIterations: iterations, maxProviderRequests: maxRequests,
      maxInputTokens: Math.max(1, Math.floor(maxTokens / 2)), maxOutputTokens: Math.max(1, maxTokens - Math.floor(maxTokens / 2)), maxGlobalMs: timeoutMs, maxProviderMs: requestMs,
      maxValidationMs: Math.min(10000, timeoutMs), maxValidations: iterations, maxFiles: workspace.limits.maxFiles, maxPatchBytes: workspace.limits.maxBytes,
      maxEstimatedCostUsd: maxCost, allowUnknownCost: options.has("--allow-uncertain-cost"), requireHumanApprovalForEachPatch: true, requireSeparateSandboxApproval: true, stopOnUncertainState: true, stopOnNoProgress: true };
    if (session && (maxRequests !== repairPolicy.maxProviderRequests || maxTokens !== repairPolicy.maxInputTokens + repairPolicy.maxOutputTokens || timeoutMs !== repairPolicy.maxGlobalMs || requestMs !== repairPolicy.maxProviderMs || maxCost !== repairPolicy.maxEstimatedCostUsd || options.has("--allow-uncertain-cost") && !repairPolicy.allowUnknownCost)) throw new EngineeringResumeError("policy_changed");
    if (repairPolicy.maxInputTokens + repairPolicy.maxOutputTokens > workspace.limits.maxTokens) throw new GitHubAuthError("invalid_arguments");
    const credential = "host-repair-validation-handle";
    const validation = await validationFactory({ project: { id: workspace.id, sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, policy: workspace.policy, actions: workspace.validationActions, authorizationDigest },
      artifact, artifacts, journalDirectory: path.dirname(workspace.journalFile), store, approvalPolicy, authorize, credential, confirmation: createInteractiveApprovalPort(), approvalVerifier: { async verify(handle: string) {
        if (handle !== credential) throw new EngineeringResumeError("authentication_required"); await authorize();
        const actor = await host.authentication.authorize("harness:approver", { sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, executionId }, signal);
        return { ...actor, roles: ["harness:approver"] };
      } } }, session?.actionId ?? options.get("--action")!).catch(error => {
      if (error instanceof EngineeringResumeError || error instanceof GitHubAuthError) throw error;
      throw new GitHubAuthError("validation_acceptance_pending");
    });
    // Constructing the port rechecks exact signed Gate C acceptance before any provider creation.
    if (provider === "openai") {
      if (!model || !options.has("--confirm-provider-call") || !options.has("--allow-uncertain-cost") || !options.has("--max-provider-requests") || !options.has("--max-output-tokens")) throw new GitHubAuthError("invalid_arguments");
      if (options.has("--fixture-file") || options.has("--fixture-content")) throw new GitHubAuthError("invalid_arguments");
      const maxOutputTokens = integer(options.get("--max-output-tokens"), 512, Math.min(4096, repairPolicy.maxOutputTokens));
      const maxContextTokens = integer(options.get("--max-context-tokens"), Math.min(8192, repairPolicy.maxInputTokens), Math.min(32768, repairPolicy.maxInputTokens));
      const rates = options.has("--rates") ? await readPrivateCostRates(path.resolve(options.get("--rates")!)) : undefined;
      if (options.has("--rates") !== options.has("--max-cost-usd")) throw new GitHubAuthError("invalid_arguments");
      agent = createOpenAIEngineeringAgent({ model, maxRequests, maxOutputTokens, maxContextTokens, maxContextBytes: integer(options.get("--max-context-bytes"), 16384, 32768), allowUncertainCost: true, paidCallConfirmed: true, timeoutMs: requestMs, ...(rates ? { rates } : {}) });
    } else if (provider === "fixture") {
      if (!options.has("--fixture-file") || !options.has("--fixture-content") || ["--model", "--confirm-provider-call", "--allow-uncertain-cost", "--max-output-tokens", "--max-context-tokens", "--max-context-bytes", "--rates"].some(key => options.has(key))) throw new GitHubAuthError("invalid_arguments");
      agent = new FixtureEngineeringAgent(options.get("--fixture-file")!, options.get("--fixture-content")!);
    } else if (["--model", "--confirm-provider-call", "--fixture-file", "--fixture-content"].some(key => options.has(key))) throw new GitHubAuthError("invalid_arguments");
    const coordinator = new RepairCoordinator({ store, artifacts, policy: workspace.policy, repairPolicy, projectId: workspace.id, ownerId: identity.subject, projectAuthorizationDigest: authorizationDigest, authorize, validation, ...(agent ? { agent, ...(provider === "openai" ? { modelAdapterAuthorized: true as const } : {}) } : {}) });
    const started = session ?? await coordinator.start({ operationId, validationId: options.get("--validation-id")!, objective: options.get("--request")!, profileId: validation.profileId, profileDigest: validation.profileDigest, actionId: validation.actionId });
    const result = agent || session ? await coordinator.advance(started.sessionId, signal) : started;
    output(JSON.stringify({ executionId, ...report(result) }));
    return result.state === "Completed" ? 0 : ["Cancelled", "BudgetExhausted", "NoProgress", "Blocked", "Failed", "ReconciliationRequired"].includes(result.state) ? 1 : 2;
  } catch (error) {
    output(JSON.stringify({ error: { code: error instanceof GitHubAuthError || error instanceof EngineeringResumeError ? error.code : "reconciliation_required", message: "Repair rejected; verify owner, project, immutable policy, accepted validation evidence and explicit provider consent" } }));
    return 1;
  } finally { try { agent?.close?.(); } finally { for (const store of stores) try { store.close(); } catch { /* Interrupted state remains non-replayable. */ } } }
}
