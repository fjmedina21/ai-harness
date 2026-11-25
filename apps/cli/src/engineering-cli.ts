import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { ContinuationCoordinator, runAcceptedPodmanValidation, ENGINEERING_TOOL_IDS, FixtureEngineeringAgent, createOpenAIEngineeringAgent, runEngineeringWorkflow, type EngineeringAgentPort } from "@ai-harness/application";
import { EngineeringCheckpointStore, ProposalArtifactStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { canonicalProposalJson, EngineeringResumeError, type DurableOperationStore, type EngineeringResumeStore, type EngineeringBudget, type EngineeringPolicy } from "@ai-harness/contracts";
import { ApprovalBroker, GitHubAuthError } from "@ai-harness/security";
import { loadGitHubHost, projectAuthorizationDigest, type GitHubHost } from "./github-host.js";
import { createInteractiveApprovalPort } from "./human-approval.js";
import { readPrivateCostRates } from "./rates.js";
const valued = ["--workflow", "--path", "--request", "--provider", "--autonomy", "--files", "--fixture-file", "--fixture-content", "--workspace-dir", "--journal", "--checkpoint-dir", "--max-iterations", "--timeout-ms",
  "--request-timeout-ms", "--role-timeout-ms", "--finalization-timeout-ms", "--model", "--allowed-paths", "--operations", "--max-provider-requests", "--max-output-tokens", "--max-total-tokens", "--max-agent-turns", "--max-context-bytes", "--max-context-tokens", "--rates", "--max-cost-usd"];
const flags = ["--json", "--authorize-workspace", "--confirm-provider-call", "--allow-uncertain-cost", "--sensitive"];
class CliError extends Error { constructor(readonly code: string, message: string) { super(message); } }
function fail(code: string, message: string): never { throw new CliError(code, message); }
function integer(raw: string | undefined, fallback: number | undefined, maximum: number): number {
  if (raw === undefined && fallback === undefined) fail("missing_budget", "Real providers require explicit request and output-token budgets");
  if (raw !== undefined && !/^[0-9]+$/.test(raw)) fail("invalid_budget", "Budgets must be finite positive integers");
  const value = raw === undefined ? fallback! : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail("invalid_budget", "Budget exceeds the supported bounded range");
  return value;
}
export async function engineeringCommand(args: string[], cwd: string, output: (text: string) => void, signal?: AbortSignal, loadHost: () => Promise<GitHubHost> = loadGitHubHost): Promise<number> {
  let store: DurableOperationStore | undefined, agent: EngineeringAgentPort | undefined;
  let authorizationDigest: string | undefined;
  let approvalPolicy: import("@ai-harness/contracts").ApprovalPolicy | undefined;
  const json = args.includes("--json");
  try {
    const options = new Map<string, string>();
    for (let i = 0; i < args.length; i++) {
      const key = args[i]!;
      if (options.has(key) || ![...valued, ...flags].includes(key)) fail("invalid_arguments", "Invalid or duplicate engineering option");
      if (flags.includes(key)) options.set(key, "true");
      else { const value = args[++i]; if (!value || value.startsWith("--")) fail("invalid_arguments", "Missing engineering option value"); options.set(key, value); }
    }
    const provider = options.get("--provider") ?? "fixture";
    if (!["fixture", "openai"].includes(provider)) fail("provider_deferred", "Engineering supports fixture and OpenAI; Anthropic engineering is deferred");
    const autonomy = options.get("--autonomy");
    if (!["propose", "isolated"].includes(autonomy ?? "")) fail("autonomy_disabled", "Choose propose or isolated; real L3 validation remains blocked");
    const projectRoot = await realpath(path.resolve(cwd, options.get("--path") ?? cwd));
    const request = options.get("--request"), files = options.get("--files")?.split(",");
    if (!request?.trim() || Buffer.byteLength(request) > 8192 || !files?.length || files.length > 16) fail("invalid_scope", "A bounded request and explicit file allowlist (at most 16 files) are required");
    const level = autonomy === "propose" ? 1 : 2;
    const timeoutMs = integer(options.get("--timeout-ms"), provider === "openai" ? 120_000 : 60_000, 900_000);
    const roleTimeoutMs = integer(options.get("--role-timeout-ms"), Math.min(timeoutMs, 120_000), 300_000);
    const finalizationTimeoutMs = integer(options.get("--finalization-timeout-ms"), 1000, 5000);
    const iterations = integer(options.get("--max-iterations"), 3, 8);
    let policy: EngineeringPolicy, budget: EngineeringBudget;
    if (provider === "fixture") {
      const target = options.get("--fixture-file"), content = options.get("--fixture-content");
      if (!target || content === undefined) fail("fixture_arguments", "Fixture requires fixture-file and fixture-content");
      for (const key of ["--request-timeout-ms", "--model", "--confirm-provider-call", "--allow-uncertain-cost", "--max-provider-requests", "--max-output-tokens", "--max-total-tokens", "--max-agent-turns", "--max-context-bytes", "--max-context-tokens", "--rates", "--max-cost-usd", "--allowed-paths", "--operations"])
        if (options.has(key)) fail("fixture_arguments", "Real-provider options cannot be used with fixture mode");
      agent = new FixtureEngineeringAgent(target, content);
      policy = { version: "cli-fixture-v1", allowedPaths: [target], allowedOperations: ["create", "replace"], maxFiles: 1, maxBytes: 8192 };
      budget = { maxIterations: iterations, maxRequests: 16, maxTokens: 16, maxEstimatedCostUsd: 0, timeoutMs, maxFiles: 4, maxBytes: 8192 };
    } else {
      if (options.has("--fixture-file") || options.has("--fixture-content")) fail("invalid_arguments", "OpenAI uses natural-language requests and does not accept fixture replacements");
      const model = options.get("--model");
      if (!model) fail("missing_model", "OpenAI requires a host-selected model");
      if (!options.has("--confirm-provider-call")) fail("confirmation_required", "Add confirm-provider-call before a potentially billable request");
      if (!options.has("--allow-uncertain-cost")) fail("cost_policy_required", "Add allow-uncertain-cost: finite tokens and estimates cannot guarantee an exact bill");
      const maxRequests = integer(options.get("--max-provider-requests"), undefined, 32);
      const maxOutputTokens = integer(options.get("--max-output-tokens"), undefined, 4096);
      const maxTurns = integer(options.get("--max-agent-turns"), maxRequests, 32);
      const maxContextBytes = integer(options.get("--max-context-bytes"), 16384, 32768);
      const maxContextTokens = integer(options.get("--max-context-tokens"), 8192, 32768);
      const maxTokens = integer(options.get("--max-total-tokens"), Math.min(100_000, maxRequests * (maxContextTokens + maxOutputTokens)), 100_000);
      const allowedPaths = options.get("--allowed-paths")?.split(",") ?? files;
      const allowedOperations = options.get("--operations")?.split(",") ?? ["create", "replace"];
      if (!allowedPaths.length || allowedPaths.length > 16 || allowedOperations.some(op => !["create", "replace", "delete"].includes(op))) fail("invalid_scope", "Invalid host path or operation scope");
      const rates = options.has("--rates") ? await readPrivateCostRates(path.resolve(cwd, options.get("--rates")!)) : undefined;
      if (options.has("--rates") !== options.has("--max-cost-usd")) fail("cost_policy_required", "Use rates and max-cost-usd together; missing tariffs leave monetary cost unknown");
      const maxCost = Number(options.get("--max-cost-usd") ?? 0);
      if (!Number.isFinite(maxCost) || maxCost < 0 || maxCost > 10) fail("invalid_budget", "Estimated USD ceiling must be finite and between zero and ten");
      if (!process.env.OPENAI_API_KEY?.trim()) fail("missing_credential", "Set OPENAI_API_KEY in the host environment; repository .env files are never loaded automatically");
      const requestTimeoutMs = integer(options.get("--request-timeout-ms"), Math.min(timeoutMs, 30_000), 300_000);
      agent = createOpenAIEngineeringAgent({ model, maxRequests, maxOutputTokens, maxContextBytes, maxContextTokens, allowUncertainCost: true,
        paidCallConfirmed: true, timeoutMs: requestTimeoutMs, ...(rates ? { rates } : {}) });
      policy = { version: "cli-openai-v1", allowedPaths, allowedOperations: allowedOperations as EngineeringPolicy["allowedOperations"], maxFiles: 16, maxBytes: 8192 };
      budget = { maxIterations: iterations, maxRequests: Math.min(maxRequests, maxTurns), maxTokens, maxEstimatedCostUsd: maxCost, timeoutMs, maxFiles: 16, maxBytes: 8192 };
    }
    let proposalArtifacts: ProposalArtifactStore | undefined;
    let workspace: Parameters<typeof runEngineeringWorkflow>[0]["workspace"], checkpoint: EngineeringCheckpointStore | undefined;
    if (level === 1 && ["--workspace-dir", "--journal", "--checkpoint-dir", "--authorize-workspace"].some(key => options.has(key))) fail("invalid_scope", "Propose mode creates no workspace, journal or checkpoints");
    if (level === 2) {
      if (!options.has("--authorize-workspace")) fail("workspace_authorization", "Isolated mode requires authorize-workspace and private external evidence directories");
      const external = async (flag: string, file = false) => {
        const selected = options.get(flag); if (!selected) fail("workspace_arguments", "Missing private external evidence directory");
        const resolved = path.resolve(cwd, selected), directory = await realpath(file ? path.dirname(resolved) : resolved);
        if (directory === projectRoot || directory.startsWith(projectRoot + path.sep) || projectRoot.startsWith(directory + path.sep)) fail("invalid_scope", "Evidence directories must stay outside the original project");
        return file ? path.join(directory, path.basename(resolved)) : directory;
      };
      const directory = await external("--workspace-dir"), journal = await external("--journal", true), checkpoints = await external("--checkpoint-dir");
      const host = await loadHost();
      const configured = host.configuration.workspaces.find(w => w.sourceRoot === projectRoot && w.workspaceDirectory === directory && w.journalFile === journal && w.checkpointDirectory === checkpoints);
      if (!configured || !files.every(f => configured.policy.allowedPaths.includes(f)) || !policy.allowedPaths.every(f => configured.policy.allowedPaths.includes(f)) ||
        (provider !== "fixture" && !policy.allowedOperations.every(op => configured.policy.allowedOperations.includes(op))) || !ENGINEERING_TOOL_IDS.every(id => configured.allowedToolIds.includes(id))) fail("forbidden_scope", "Project files, operations and tools require explicit trusted host authorization");
      if ((options.has("--allowed-paths") && canonicalProposalJson(policy.allowedPaths) !== canonicalProposalJson(configured.policy.allowedPaths)) ||
        (options.has("--operations") && canonicalProposalJson(policy.allowedOperations) !== canonicalProposalJson(configured.policy.allowedOperations))) fail("forbidden_scope", "Explicit path/operation scope must match the registered host policy; register a narrower policy instead of silently widening the request");
      for (const key of ["maxIterations", "maxRequests", "maxTokens", "maxEstimatedCostUsd", "timeoutMs", "maxFiles", "maxBytes"] as const)
        if (budget[key] > configured.limits[key]) fail("forbidden_scope", "Requested budget exceeds registered project limits");
      policy = structuredClone(configured.policy);
      const identity = await host.authentication.authorize("harness:requester", { sourceRoot: projectRoot, workspaceDirectory: directory }, signal);
      approvalPolicy = configured.approval ?? host.configuration.approval;
      authorizationDigest = projectAuthorizationDigest(configured, approvalPolicy);
      store = await openSqliteOperationJournal(journal, { approvalPolicy });
      proposalArtifacts = new ProposalArtifactStore(path.dirname(journal));
      workspace = { directory, binding: { store, requester: { issuer: identity.issuer, subject: identity.subject }, safetyByTool: {} }, createAuthorized: true, ttlMs: 3_600_000 };
      checkpoint = new EngineeringCheckpointStore(checkpoints);
    }
    const result = await runEngineeringWorkflow({ projectRoot, request, files, level, budget, policy, agent, workspace, checkpoint, proposalArtifacts, signal, approvalPolicy, projectAuthorizationDigest: authorizationDigest, timing: { roleTimeoutMs, finalizationTimeoutMs },
      ...(provider === "openai" ? { modelAdapterAuthorized: true, allowUncertainCost: true } : {}), sensitive: options.has("--sensitive") });
    if (json) output(JSON.stringify(result, null, 2));
    else {
      const safe = (text: string) => stripVTControlCharacters(text).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "");
      output(`Execution: ${result.executionId}\nProvider: ${result.provider}\nModel: ${result.model ?? "fixture"}\nAutonomy: ${autonomy}\nWorkspace: ${result.workspace?.root ?? "none; source read-only"}`);
      output(`Permissions: ${level === 1 ? "read selected files; propose only" : "private copy; explicit " + (approvalPolicy?.mode ?? "personal") + " durable approval required"}\nBudget: ${JSON.stringify(budget)}\nTiming: ${JSON.stringify(result.timing)}`);
      output(`Plan: ${safe(result.plan.join("\n"))}\nStates: ${result.events.join(" -> ")}\nStatus: ${result.state} (${result.termination})\nPatch validation: ${result.proposalValidation}`);
      output(`Diff:\nScope: ${result.diffScope}\n${safe(result.diff)}\nValidations executed: ${result.validations.length}; L3 gate: blocked`);
      output(`Requests: ${result.usage.requests}; known tokens: ${result.usage.tokens}; usage complete: ${result.usageComplete}\nEstimated cost: ${result.cost.status === "estimated" ? result.cost.amount + " " + result.cost.currency : "unknown"}`);
      if (result.providerFailure) output(`Provider failure: ${JSON.stringify(result.providerFailure)}`);
      for (const id of result.pendingApprovals) output(`Pending durable approval: ${id}; use engineering diff/approve under the trusted host approval policy`);
      for (const risk of result.risks) output(`Risk: ${risk}`);
      output("Original project unchanged; no integration performed. Proposed code has not been executed or tested.");
    }
    return ["proposed", "completed", "review_pending"].includes(result.termination) ? 0 : result.termination === "approval_required" ? 2 : result.termination === "cancelled" ? 130 : result.termination === "timeout" ? 124 : 1;
  } catch (error) {
    const detail = error instanceof CliError ? { code: error.code, message: error.message } : error instanceof GitHubAuthError ? { code: error.code, message:
      error.code === "github_unavailable" ? "GitHub verification unavailable; proposal generation remains blocked" : "GitHub authentication and scoped requester authorization required" } : { code: "engineering_rejected", message: "Engineering workflow rejected; verify explicit scope, private paths and budgets. Real L3 remains disabled." };
    output(json ? JSON.stringify({ state: "Failed", error: detail }) : "Error: " + detail.message); return 1;
  } finally { try { agent?.close?.(); store?.close(); } catch { /* No reuse after lifecycle faults. */ } }
}

/** Only fixed host profiles locate journals; credentials and policy never enter argv. */
export async function engineeringLifecycleCommand(args: string[], output: (text: string) => void, signal?: AbortSignal, loadHost: () => Promise<GitHubHost> = loadGitHubHost, humanApproval = createInteractiveApprovalPort): Promise<number> {
  const stores: EngineeringResumeStore[] = [];
  try {
    const [command, ...options] = args;
    const allowed = ["status", "diff", "approve", "reject", "continue", "revoke", "validate"];
    const parsed = new Map<string, string>();
    for (let i = 0; i < options.length; i++) {
      const key = options[i]!;
      if (parsed.has(key) || !["--id", "--json", ...(command === "validate" ? ["--profile", "--action"] : [])].includes(key)) throw new GitHubAuthError("invalid_arguments");
      if (key === "--json") parsed.set(key, "true");
      else { const value = options[++i]; if (!value || value.startsWith("--")) throw new GitHubAuthError("invalid_arguments"); parsed.set(key, value); }
    }
    const executionId = parsed.get("--id");
    if (!allowed.includes(command ?? "") || !/^[A-Za-z0-9-]{1,80}$/.test(executionId ?? "") || command === "validate" && (!/^[A-Za-z0-9-]{1,64}$/.test(parsed.get("--profile") ?? "") || !/^[A-Za-z0-9-]{1,64}$/.test(parsed.get("--action") ?? ""))) throw new GitHubAuthError("invalid_arguments");
    const host = await loadHost();
    const identity = await host.authentication.identity(signal);
    const role = ["approve", "reject", "revoke"].includes(command!) ? "harness:approver" : ["continue", "validate"].includes(command!) ? "harness:operator" : "harness:reader";
    let selected: { store: EngineeringResumeStore; operationId: string; workspace: GitHubHost["configuration"]["workspaces"][number] } | undefined;
    for (const workspace of host.configuration.workspaces) {
      // Project capabilities are host authorization, separate from the OAuth session.
      if (!host.authentication.roles(identity, { sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, executionId }).includes(role)) continue;
      try { await lstat(workspace.journalFile); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") continue; throw e; }
      const store = await openSqliteOperationJournal(workspace.journalFile, { approvalPolicy: workspace.approval ?? host.configuration.approval }); stores.push(store);
      const operations = store.list(executionId!, undefined, 1000);
      if (operations.length === 1000) throw new EngineeringResumeError("reconciliation_required");
      for (const op of operations) if (store.proposal(op.operationId)) {
        if (selected || op.toolId !== "patch.apply") throw new EngineeringResumeError("reconciliation_required");
        selected = { store, operationId: op.operationId, workspace };
      }
    }
    if (!selected) throw new EngineeringResumeError("forbidden_scope");
    const { store, operationId, workspace } = selected;
    const ref = store.proposal(operationId)!;
    const session = host.authentication.resumeVerifier({ sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, executionId: executionId!, workspaceId: ref.workspaceId }, signal);
    // Authenticate resource/action before reading the private proposal body.
    const approvalPolicy = workspace.approval ?? host.configuration.approval;
    const broker = new ApprovalBroker(store, session.verifier, Date.now, approvalPolicy);
    await broker.authenticate(operationId, command === "validate" ? "continue" : command as import("@ai-harness/contracts").ResumeAction, session.credential);
    const artifacts = new ProposalArtifactStore(path.dirname(workspace.journalFile), false);
    const artifact = artifacts.get(ref.artifactDigest);
    if (artifact.requester.issuer !== "github.com" || artifact.requester.subject !== host.configuration.auth.ownerAccountId ||
      canonicalProposalJson(artifact.policy) !== canonicalProposalJson(workspace.policy) || !workspace.allowedToolIds.includes(command === "validate" ? "sandbox.validate" : command === "continue" ? "patch.apply" : "diff.inspect") || artifact.receipt.sourceRoot !== workspace.sourceRoot ||
      path.dirname(path.dirname(artifact.receipt.root)) !== workspace.workspaceDirectory || artifact.receipt.workspaceId !== ref.workspaceId || artifact.executionId !== executionId) throw new EngineeringResumeError("forbidden_scope");
    if (artifact.projectAuthorizationDigest !== projectAuthorizationDigest(workspace, approvalPolicy)) throw new EngineeringResumeError("policy_changed");
    const coordinator = new ContinuationCoordinator({ store, artifacts, policy: workspace.policy, verifier: session.verifier, approvalPolicy });
    let result: unknown;
    if (command === "status") result = await coordinator.status(operationId, session.credential);
    else if (command === "diff") result = { diff: stripVTControlCharacters(await coordinator.diff(operationId, session.credential)).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "") };
    else if (command === "approve" || command === "reject") {
      const native = humanApproval();
      const confirmation: import("@ai-harness/contracts").HumanApprovalPort = { async confirm(review, cancellation) {
        const receipt = await native.confirm(review, cancellation);
        if (!receipt) return null;
        const fresh = await loadHost();
        if (canonicalProposalJson(fresh.configuration) !== canonicalProposalJson(host.configuration)) throw new EngineeringResumeError("policy_changed");
        const approver = await fresh.authentication.authorize("harness:approver", { sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, executionId: executionId!, workspaceId: ref.workspaceId }, cancellation);
        if (approver.issuer !== review.actor.issuer || approver.subject !== review.actor.subject) throw new EngineeringResumeError("authentication_required");
        return receipt;
      } };
      await coordinator.decide(operationId, session.credential, command === "approve", command === "approve" ? confirmation : undefined, signal); result = { decision: command === "approve" ? "approved" : "rejected" };
    }
    else if (command === "revoke") { await broker.revoke(operationId, session.credential); result = { decision: "revoked" }; }
    else if (command === "validate") {
      if (parsed.get("--profile") !== "local-podman") throw new GitHubAuthError("validation_acceptance_pending");
      const credential = "host-validation-ephemeral-handle";
      const authorize = async () => {
        const current = await loadHost(), registered = current.configuration.workspaces.find(w => w.id === workspace.id);
        if (!registered || projectAuthorizationDigest(registered, current.configuration.approval) !== artifact.projectAuthorizationDigest || !registered.allowedToolIds.includes("sandbox.validate")) throw new EngineeringResumeError("policy_changed");
        const actor = await current.authentication.authorize("harness:operator", { sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, executionId: artifact.executionId, workspaceId: artifact.workspaceId }, signal);
        return { issuer: actor.issuer, subject: actor.subject };
      };
      try {
        result = await runAcceptedPodmanValidation({ project: { id: workspace.id, sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, policy: workspace.policy, actions: workspace.validationActions, authorizationDigest: artifact.projectAuthorizationDigest },
          artifact, artifacts, store, journalDirectory: path.dirname(workspace.journalFile), approvalPolicy, authorize, credential, confirmation: humanApproval(),
          approvalVerifier: { verify: async handle => { if (handle !== credential) throw new GitHubAuthError("authentication_required"); await authorize(); const actor = await host.authentication.authorize("harness:approver", { sourceRoot: workspace.sourceRoot, workspaceDirectory: workspace.workspaceDirectory, executionId: artifact.executionId, workspaceId: artifact.workspaceId }, signal); return { ...actor, roles: ["harness:approver"] }; } },
        }, parsed.get("--action")!, signal);
      } catch (error) {
        if (error instanceof EngineeringResumeError || error instanceof GitHubAuthError) throw error;
        throw new GitHubAuthError("validation_acceptance_pending");
      }
    }
    else result = await coordinator.continue(operationId, session.credential, 60000, signal);
    output(JSON.stringify({ executionId, ...result as object })); return command === "validate" && (result as { validation?: { classification?: string } }).validation?.classification !== "passed" ? 2 : 0;
  } catch (e) {
    output(JSON.stringify({ error: { code: e instanceof GitHubAuthError || e instanceof EngineeringResumeError ? e.code : "reconciliation_required", message:
      e instanceof GitHubAuthError && e.code === "github_unavailable" || e instanceof EngineeringResumeError && e.code === "authentication_unavailable"
        ? "GitHub verification unavailable; protected operation remains blocked"
        : "Lifecycle rejected; verify GitHub session, resource policy, durable proposal and acceptance gates" } })); return 1;
  } finally { for (const store of stores) try { store.close(); } catch { /* No automatic replay after uncertain close. */ } }
}
