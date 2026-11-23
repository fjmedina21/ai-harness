import { randomUUID } from "node:crypto";
import type { AgentRole, DurableOperation, DurableDispatchBinding, EngineeringBudget, EngineeringCheckpoint, EngineeringPolicy, EngineeringState, StructuredPatch, TelemetryBinding, ValidationEvidence, WorkspaceSnapshot } from "@ai-harness/contracts";
import { createEngineeringTaskPlan } from "@ai-harness/orchestrator";
import { EngineeringProviderError, assertEngineeringStateTransition, emitTelemetry, traceTelemetry } from "@ai-harness/contracts";
import { EngineeringPatchEngine, EngineeringWorkspace, EngineeringWorkspaceUncertain, createEngineeringTools, engineeringHash, engineeringLimit, openEngineeringSource, patchInvocation, type EngineeringView } from "@ai-harness/tools";

export interface EngineeringAgentInput {
  role: AgentRole;
  identity?: { executionId: string; workspaceId: string; taskId: string; turn: number };
  policy?: EngineeringPolicy;
  plan?: readonly string[];
  telemetry?: TelemetryBinding;
  request: string;
  snapshot: WorkspaceSnapshot;
  files: readonly { path: string; content: string }[];
  diff?: string;
  validationEvidence?: readonly ValidationEvidence[];
  requirements?: readonly string[];
  previousFailure?: { failedChecks: readonly string[]; snapshotDigest: string };
  allowance: { tokens: number; estimatedCostUsd: number };
  signal: AbortSignal;
}
/** Host adapter port, not a model-owned callback. No filesystem/store/approval handles. */
export interface EngineeringAgentPort {
  id: string;
  model?: string;
  close?(): void;
  mode: "fixture" | "host_model_adapter";
  maxTokensPerRequest: number;
  maxEstimatedCostUsdPerRequest: number;
  execute(input: EngineeringAgentInput): Promise<{ proposal?: unknown; summary: string; usage: { tokens: number; estimatedCostUsd: number | null }; reportedUsage?: import("@ai-harness/contracts").TokenUsage; cost?: import("@ai-harness/contracts").CostEstimate }>;
}
export interface FixtureValidationPort {
  kind: "fixture";
  validate(snapshot: WorkspaceSnapshot, workspaceId: string, signal: AbortSignal): Promise<ValidationEvidence>;
}
export interface EngineeringOptions {
  projectRoot: string;
  request: string;
  files: readonly string[];
  level: 1 | 2 | 3;
  policy: EngineeringPolicy;
  budget: EngineeringBudget;
  agent: EngineeringAgentPort;
  /** Explicit host adapter authorization, never read from repository files. */
  modelAdapterAuthorized?: true;
  allowUncertainCost?: true;
  workspace?: { directory: string; binding: DurableDispatchBinding; createAuthorized: true; ttlMs: number };
  validation?: FixtureValidationPort;
  /** Real execution deliberately blocked regardless of this request. */
  realValidationRequested?: boolean;
  signal?: AbortSignal;
  telemetry?: TelemetryBinding;
  checkpoint?: { save(checkpoint: EngineeringCheckpoint): Promise<void> };
  /** Only trusted host UI may return an already-issued transactional approval ID. */
  requestApproval?: (request: { approvalId: string; patch: StructuredPatch; diff: string; signal: AbortSignal }) => Promise<string | undefined>;
  humanReview?: (result: Readonly<EngineeringResult>, signal: AbortSignal) => Promise<boolean>;
  sensitive?: boolean;
}
export interface EngineeringResult {
  executionId: string;
  request: string;
  state: EngineeringState;
  levelRequested: number;
  levelAvailable: 1 | 2;
  provider: string;
  model?: string;
  analyzedFiles: readonly { path: string; hash: string }[];
  proposals: readonly StructuredPatch[];
  proposalValidation: "not_run" | "passed" | "failed";
  reviews: readonly { role: AgentRole; summary: string }[];
  providerFailure?: import("@ai-harness/contracts").EngineeringProviderFailure;
  reportedUsage: import("@ai-harness/contracts").TokenUsage;
  cost: import("@ai-harness/contracts").CostEstimate;
  workspace?: Readonly<import("@ai-harness/contracts").WorkspaceReceipt>;
  baseRevision: string;
  snapshotDigest: string;
  plan: readonly string[];
  requirements: readonly string[];
  participants: readonly AgentRole[];
  patches: readonly { digest: string; status: "proposed" | "applied"; paths: readonly string[] }[];
  filesCreated: readonly string[];
  filesModified: readonly string[];
  filesDeleted: readonly string[];
  diff: string;
  diffScope: "proposed" | "applied";
  validations: readonly ValidationEvidence[];
  repairAttempts: number;
  usageComplete: boolean;
  usage: { requests: number; tokens: number; estimatedCostUsd: number | null };
  pendingApprovals: readonly string[];
  events: readonly EngineeringState[];
  termination: "proposed" | "approval_required" | "review_pending" | "completed" | "budget" | "no_progress" | "regression" | "failed" | "cancelled" | "timeout" | "uncertain" | "sandbox_blocked";
  originalProject: "unchanged";
  integrated: false;
  reviewed: boolean;
  validationScope: "none" | "fixture";
  l3Gate: "blocked";
  risks: readonly string[];
}
const defaultRisks = ["Experimental private local filesystem boundary; same-UID hostile races are unsupported", "L3 unavailable: real Podman snapshot transfer and current isolation E2E are unverified", "Real engineering workflow interoperability requires separate live evidence; no integration or publication authority"];
function validateOptions(o: EngineeringOptions): void {
  if (![1, 2, 3].includes(o.level) || !o.request.trim() || Buffer.byteLength(o.request) > 8192 || !o.files.length) throw new Error("Invalid engineering request");
  engineeringLimit(o.budget.maxIterations, 8); engineeringLimit(o.budget.maxRequests, 32); engineeringLimit(o.budget.maxTokens, 100_000);
  engineeringLimit(o.budget.timeoutMs, 160_000); engineeringLimit(o.budget.maxFiles, 16); engineeringLimit(o.budget.maxBytes, 65536);
  if (!Number.isFinite(o.budget.maxEstimatedCostUsd) || o.budget.maxEstimatedCostUsd < 0 || o.budget.maxEstimatedCostUsd > 10 ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(o.agent.id) || !["fixture", "host_model_adapter"].includes(o.agent.mode) ||
      (o.agent.mode === "host_model_adapter" && (o.modelAdapterAuthorized !== true || o.allowUncertainCost !== true || o.level === 3)) ||
      !Number.isSafeInteger(o.agent.maxTokensPerRequest) || o.agent.maxTokensPerRequest < 1 || o.agent.maxTokensPerRequest > o.budget.maxTokens ||
      !Number.isFinite(o.agent.maxEstimatedCostUsdPerRequest) || o.agent.maxEstimatedCostUsdPerRequest < 0) throw new Error("Host adapter and finite budgets required");
  if (o.level > 1 && (!o.workspace || o.workspace.createAuthorized !== true || !o.checkpoint)) throw new Error("L2 requires authorized workspace, durable binding and checkpoints");
  if (o.level === 3 && !o.realValidationRequested && o.validation?.kind !== "fixture") throw new Error("No engineering validation runtime available");
}
class Stop extends Error { constructor(readonly reason: EngineeringResult["termination"]) { super(reason); } }
export async function runEngineeringWorkflow(raw: EngineeringOptions): Promise<EngineeringResult> {
  // Freeze authority-bearing data before yielding to any untrusted adapter.
  const o: EngineeringOptions = { ...raw, files: [...raw.files], policy: structuredClone(raw.policy), budget: { ...raw.budget },
    agent: { id: raw.agent.id, model: raw.agent.model, close: raw.agent.close?.bind(raw.agent), mode: raw.agent.mode, maxTokensPerRequest: raw.agent.maxTokensPerRequest,
      maxEstimatedCostUsdPerRequest: raw.agent.maxEstimatedCostUsdPerRequest, execute: raw.agent.execute.bind(raw.agent) },
    ...(raw.workspace ? { workspace: { ...raw.workspace, binding: { ...raw.workspace.binding, requester: { ...raw.workspace.binding.requester } } } } : {}) };
  validateOptions(o);
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), o.budget.timeoutMs);
  const signal = AbortSignal.any([deadline.signal, ...(o.signal ? [o.signal] : [])]);
  const executionId = randomUUID();
  const executionTelemetry = traceTelemetry(o.telemetry?.observer, executionId);
  let view: EngineeringView | undefined, engine: EngineeringPatchEngine | undefined;
  const result: EngineeringResult = { executionId, request: o.request, state: "Proposed", levelRequested: o.level, levelAvailable: o.level === 1 ? 1 : 2,
    provider: o.agent.id, model: o.agent.model, analyzedFiles: [], proposals: [], proposalValidation: "not_run", reviews: [], reportedUsage: { availability: "unavailable" }, cost: { status: "unknown", reason: "missing_usage" }, baseRevision: "", snapshotDigest: "", plan: [], requirements: [], participants: [], patches: [], filesCreated: [], filesModified: [], filesDeleted: [], diff: "", diffScope: "proposed", validations: [], repairAttempts: 0,
    usageComplete: true, usage: { requests: 0, tokens: 0, estimatedCostUsd: o.agent.mode === "host_model_adapter" ? null : 0 }, pendingApprovals: [], events: [], termination: "proposed", originalProject: "unchanged", integrated: false, reviewed: false,
    validationScope: o.validation ? "fixture" : "none", l3Gate: "blocked", risks: [...defaultRisks] };
  const deliver = () => {
    clearTimeout(deadlineTimer);
    try { o.agent.close?.(); } catch { /* Host lifecycle faults never authorize more calls. */ }
    emitTelemetry(executionTelemetry, "engineering.completion", { engineeringState: result.state, accepted: result.state === "Completed" });
    return result;
  };
  const boundedWait = async <T>(promise: Promise<T>): Promise<T> => {
    let listener: (() => void) | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { listener = () => reject(new Stop(o.signal?.aborted ? "cancelled" : "timeout")); signal.addEventListener("abort", listener, { once: true }); if (signal.aborted) listener(); })]); }
    finally { if (listener) signal.removeEventListener("abort", listener); }
  };
  const state = async (next: EngineeringState) => {
    assertEngineeringStateTransition(result.state, next);
    result.state = next; result.events = [...result.events, next];
    emitTelemetry(executionTelemetry, "engineering.state", { engineeringState: next, iteration: result.repairAttempts });
    if (o.checkpoint && view instanceof EngineeringWorkspace) {
      const saving = o.checkpoint.save({ executionId, workspaceId: view.receipt.workspaceId, state: next, snapshotDigest: result.snapshotDigest,
        iteration: result.repairAttempts, requests: result.usage.requests, tokens: result.usage.tokens, estimatedCostUsd: result.usage.estimatedCostUsd ?? 0 });
      if (["Failed", "Cancelled", "Uncertain"].includes(next)) {
        // Independent bounded finalization must not inherit an already-aborted run.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([saving, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Checkpoint finalization uncertain")), 1000); })]); }
        finally { clearTimeout(timer); }
      } else await boundedWait(saving);
    }
  };
  let knownEstimatedCost = 0, unknownEstimatedCost = false;
  let checkingProposal = false;
  const account = (usage: import("@ai-harness/contracts").TokenUsage, cost?: import("@ai-harness/contracts").CostEstimate, includeTotals = true) => {
    if (usage.availability !== "reported") return;
    const previous = result.reportedUsage;
    const combined: import("@ai-harness/contracts").TokenUsage = { availability: "reported" };
    for (const key of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"] as const) {
      const value = usage[key];
      if (value !== undefined && Number.isSafeInteger(value) && value >= 0) combined[key] = (previous[key] ?? 0) + value;
      else if (previous[key] !== undefined) combined[key] = previous[key];
    }
    result.reportedUsage = combined;
    if (includeTotals) {
      const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
      if (!Number.isSafeInteger(tokens) || !Number.isSafeInteger(result.usage.tokens + tokens)) { result.usageComplete = false; throw new Stop("budget"); }
      result.usage.tokens += tokens;
      if (cost?.status === "estimated") knownEstimatedCost += cost.amount; else unknownEstimatedCost = true;
      result.usage.estimatedCostUsd = unknownEstimatedCost ? null : knownEstimatedCost;
    }
    if (cost?.status === "estimated") result.cost = result.cost.status === "estimated"
      ? { ...cost, amount: result.cost.amount + cost.amount, rateVersions: [...new Set([...result.cost.rateVersions, ...cost.rateVersions])] } : cost;
    else if (cost) result.cost = cost;
  };
  const act = async (role: AgentRole, failure?: EngineeringAgentInput["previousFailure"]) => {
    signal.throwIfAborted();
    if (result.usage.requests >= o.budget.maxRequests || result.usage.tokens + o.agent.maxTokensPerRequest > o.budget.maxTokens ||
        (result.usage.estimatedCostUsd ?? 0) + o.agent.maxEstimatedCostUsdPerRequest > o.budget.maxEstimatedCostUsd) throw new Stop("budget");
    const snapshot = await view!.inspect(signal);
    const files: { path: string; content: string }[] = []; let bytes = 0;
    for (const f of snapshot.files) {
      const content = await view!.read(f.path, signal); bytes += Buffer.byteLength(content);
      if (bytes > 8192) throw new Stop("budget");
      if (engineeringHash(content) !== f.hash) throw new Stop("failed");
      files.push({ path: f.path, content });
    }
    result.usage.requests++; result.usageComplete = false;
    result.participants = [...new Set([...result.participants, role])];
    let output: Awaited<ReturnType<EngineeringAgentPort["execute"]>>;
    try { output = await boundedWait(o.agent.execute({ role, request: o.request, snapshot: structuredClone(snapshot), files, previousFailure: failure, diff: result.diff, validationEvidence: structuredClone(result.validations), requirements: [...result.requirements], plan: [...result.plan], policy: structuredClone(o.policy),
      identity: { executionId, workspaceId: view!.receipt.workspaceId, taskId: role, turn: result.usage.requests },
      telemetry: executionTelemetry,
      allowance: { tokens: o.agent.maxTokensPerRequest, estimatedCostUsd: o.agent.maxEstimatedCostUsdPerRequest }, signal })); }
    catch (error) {
      if (error instanceof EngineeringProviderError) {
        result.providerFailure = { ...error.failure };
        if (error.usage) {
          account(error.usage, error.cost);
          result.usageComplete = error.usage.availability === "reported" && Number.isSafeInteger(error.usage.inputTokens) && Number.isSafeInteger(error.usage.outputTokens);
        }
      }
      throw error;
    }
    signal.throwIfAborted();
    if (!output || typeof output.summary !== "string" || Buffer.byteLength(output.summary) > 2048 || !output.usage ||
        !Number.isSafeInteger(output.usage.tokens) || output.usage.tokens < 0 || output.usage.tokens > o.agent.maxTokensPerRequest ||
        (output.usage.estimatedCostUsd === null ? o.allowUncertainCost !== true : !Number.isFinite(output.usage.estimatedCostUsd) || output.usage.estimatedCostUsd < 0 || output.usage.estimatedCostUsd > o.agent.maxEstimatedCostUsdPerRequest)) throw new Stop("budget");
    result.usageComplete = true;
    result.usage.tokens += output.usage.tokens;
    if (output.usage.estimatedCostUsd === null) unknownEstimatedCost = true; else knownEstimatedCost += output.usage.estimatedCostUsd;
    result.usage.estimatedCostUsd = unknownEstimatedCost ? null : knownEstimatedCost;
    if (output.reportedUsage) account(output.reportedUsage, output.cost, false);
    if (["code-reviewer", "validator", "security-specialist"].includes(role)) result.reviews = [...result.reviews, { role, summary: output.summary }];
    return output;
  };
  let applying = false, validating = false;
  let validationOperation: DurableOperation | undefined;
  const original = new Map<string, string>();
  const finishDiff = async (proposed?: StructuredPatch) => {
    if (!view || result.state === "Uncertain") return;
    const current = await view.inspect();
    const changes = [];
    for (const relative of [...new Set([...original.keys(), ...current.files.map(f => f.path), ...(proposed?.changes.map(c => c.path) ?? [])])].sort()) {
      const before = original.get(relative), exists = current.files.some(f => f.path === relative), afterCurrent = exists ? await view.read(relative) : undefined;
      const proposedChange = proposed?.changes.find(c => c.path === relative);
      const after = proposedChange ? proposedChange.content ?? undefined : afterCurrent;
      if (before === after) continue;
      changes.push({ path: relative, operation: before === undefined ? "create" as const : after === undefined ? "delete" as const : "replace" as const,
        baseHash: before === undefined ? null : engineeringHash(before), content: after ?? null, resultHash: after === undefined ? null : engineeringHash(after) });
    }
    result.filesCreated = changes.filter(c => c.operation === "create").map(c => c.path);
    result.filesModified = changes.filter(c => c.operation === "replace").map(c => c.path);
    result.filesDeleted = changes.filter(c => c.operation === "delete").map(c => c.path);
    result.diff = ""; result.diffScope = proposed ? "proposed" : "applied";
    if (changes.length) {
      const initialView: EngineeringView = { receipt: view.receipt, inspect: async () => ({ digest: result.baseRevision, files: [...original].sort(([a], [b]) => a < b ? -1 : 1).map(([p, content]) => ({ path: p, bytes: Buffer.byteLength(content), hash: engineeringHash(content) })) }), read: async p => original.get(p)! };
      const diffEngine = new EngineeringPatchEngine(initialView, { ...o.policy, maxFiles: o.budget.maxFiles, maxBytes: 8192 });
      const patch = await diffEngine.propose({ baseRevision: result.baseRevision, changes }); result.diff = await diffEngine.diff(patch.digest);
    }
  };
  try {
    signal.throwIfAborted();
    if (o.realValidationRequested) { result.termination = "sandbox_blocked"; await state("Failed"); return deliver(); }
    view = o.level === 1 ? await openEngineeringSource(o.projectRoot, executionId, o.files) : await EngineeringWorkspace.create({ ...o.workspace!, sourceRoot: o.projectRoot, executionId, files: o.files,
      maxFiles: 256, maxBytes: 4 * 1024 * 1024, signal });
    if (view instanceof EngineeringWorkspace) result.workspace = view.receipt;
    result.baseRevision = (await view.inspect(signal)).digest; result.snapshotDigest = result.baseRevision;
    result.analyzedFiles = (await view.inspect(signal)).files.map(f => ({ path: f.path, hash: f.hash }));
    for (const f of (await view.inspect(signal)).files) original.set(f.path, await view.read(f.path, signal));
    engine = new EngineeringPatchEngine(view, o.policy); await state("Proposed");
    emitTelemetry(executionTelemetry, "engineering.workspace", { accepted: true });
    const tasks = createEngineeringTaskPlan(o.request, o.sensitive);
    const role = (id: string) => tasks.find(task => task.id === id)!.assignedRole;
    result.requirements = [(await act(role("requirements"))).summary];
    const plan = await act(role("plan")); result.plan = [plan.summary];
    if (o.sensitive) result.plan = [...result.plan, (await act(role("architecture"))).summary];
    const snapshots = new Set([result.baseRevision]), failures = new Set<string>(), changedPaths = new Set<string>();
    let changedBytes = 0; let previousChecks: readonly string[] = [], failure: EngineeringAgentInput["previousFailure"];
    for (let iteration = 0; iteration < o.budget.maxIterations; iteration++) {
      if (iteration) { result.repairAttempts++; await state("Repairing"); emitTelemetry(executionTelemetry, "engineering.repair", { iteration, accepted: true }); }
      const output = await act(role("implement"), failure);
      checkingProposal = true;
      const patch = await engine.propose(output.proposal, signal), diff = await engine.diff(patch.digest, signal);
      await state("Proposed");
      emitTelemetry(executionTelemetry, "engineering.patch", { accepted: true, patchDigest: patch.digest });
      emitTelemetry(executionTelemetry, "engineering.proposal_validation", { accepted: true, patchDigest: patch.digest });
      for (const change of patch.changes) { changedPaths.add(change.path); changedBytes += Buffer.byteLength(change.content ?? "") + ((await view.inspect(signal)).files.find(f => f.path === change.path)?.bytes ?? 0); }
      if (changedPaths.size > o.budget.maxFiles || changedBytes > o.budget.maxBytes) throw new Stop("budget");
      result.proposals = [...result.proposals, structuredClone(patch)]; result.proposalValidation = "passed"; checkingProposal = false;
      result.diff = diff; result.patches = [...result.patches, { digest: patch.digest, status: "proposed", paths: patch.changes.map(c => c.path) }];
      if (o.level === 1) {
        await act(role("review")); result.termination = "proposed";
        result.filesCreated = patch.changes.filter(c => c.operation === "create").map(c => c.path);
        result.filesModified = patch.changes.filter(c => c.operation === "replace").map(c => c.path);
        result.filesDeleted = patch.changes.filter(c => c.operation === "delete").map(c => c.path);
        return deliver();
      }
      if (o.agent.mode === "host_model_adapter") await act(role("review"));
      await finishDiff(patch);
      const tools = createEngineeringTools(engine, o.workspace!.binding), identity = { taskId: "engineering", requestId: "patch-" + iteration }, invocation = patchInvocation(patch);
      const waiting = await tools.dispatch(invocation, identity, undefined, signal);
      if (waiting.status !== "approval_required" || !waiting.approvalId) throw new Stop(waiting.operationState === "Uncertain" ? "uncertain" : "failed");
      result.pendingApprovals = [waiting.approvalId];
      emitTelemetry(executionTelemetry, "engineering.approval", { approvalRequired: true, accepted: false });
      const approved = o.requestApproval ? await boundedWait(o.requestApproval({ approvalId: waiting.approvalId, patch: structuredClone(patch), diff, signal })) : undefined;
      if (!approved) { result.termination = "approval_required"; await state("ReviewPending"); return deliver(); }
      if (approved !== waiting.approvalId || o.workspace!.binding.store.approval(approved)?.status !== "approved") throw new Stop("failed");
      await state("Authorized"); await state("Applying"); applying = true;
      const applied = await tools.dispatch(invocation, identity, approved, signal);
      if (applied.operationState === "Uncertain") throw new Stop("uncertain");
      applying = false;
      if (applied.status !== "executed") throw new Stop("failed");
      result.diffScope = "applied";
      result.pendingApprovals = []; result.patches = result.patches.map(p => p.digest === patch.digest ? { ...p, status: "applied" } : p);
      const snapshot = await view.inspect(signal); result.snapshotDigest = snapshot.digest;
      await state("Applied");
      if (snapshots.has(snapshot.digest)) throw new Stop("no_progress"); snapshots.add(snapshot.digest);
      if (o.level === 2) break;
      await state("Validating");
      const store = o.workspace!.binding.store;
      validationOperation = store.register({ executionId, taskId: "validation", requestId: "fixture-" + iteration,
        projectRoot: view.receipt.root, toolId: "validation.fixture", argumentDigest: engineeringHash(JSON.stringify([snapshot.digest, view.receipt.workspaceId])),
        permission: "files:read", risk: "low", safety: "read_only", requester: o.workspace!.binding.requester, requiresApproval: false }).operation;
      validationOperation = store.prepare(validationOperation.operationId, validationOperation.version, validationOperation.scopeDigest) ?? undefined;
      if (!validationOperation) throw new Stop("uncertain");
      validationOperation = store.start(validationOperation.operationId, validationOperation.version);
      validating = true;
      const evidence = await boundedWait(o.validation!.validate(structuredClone(snapshot), view.receipt.workspaceId, signal));
      if (!evidence || evidence.cleanup !== "confirmed") throw new Stop("uncertain");
      validateEvidence(evidence, snapshot, view.receipt.workspaceId);
      result.validations = [...result.validations, structuredClone(evidence)];
      emitTelemetry(executionTelemetry, "engineering.validation", { accepted: evidence.result === "passed" });
      if ((await view.inspect(signal)).digest !== snapshot.digest) throw new Stop("uncertain");
      validationOperation = store.finish(validationOperation.operationId, validationOperation.version, "Completed", engineeringHash(JSON.stringify(evidence)));
      validating = false;
      if (previousChecks.some(check => !evidence.passedChecks.includes(check))) throw new Stop("regression");
      previousChecks = [...evidence.passedChecks];
      if (evidence.result === "passed") break;
      await state("ValidationFailed");
      const signature = engineeringHash(JSON.stringify([evidence.logDigest, evidence.passedChecks]));
      if (failures.has(signature)) throw new Stop("no_progress"); failures.add(signature);
      failure = { failedChecks: [evidence.validationId], snapshotDigest: snapshot.digest };
      if (iteration + 1 === o.budget.maxIterations) throw new Stop("budget");
    }
    await finishDiff(); if (o.agent.mode !== "host_model_adapter") await act(role("review")); await act(role("validate")); if (o.sensitive) await act(role("security"));
    await state("ReviewPending"); result.termination = "review_pending";
    emitTelemetry(executionTelemetry, "engineering.review", { accepted: false });
    if (o.humanReview && await boundedWait(o.humanReview(structuredClone(result), signal))) { result.reviewed = true; await state("Completed"); result.termination = "completed"; }
  } catch (error) {
    if (checkingProposal) { result.proposalValidation = "failed"; emitTelemetry(executionTelemetry, "engineering.proposal_validation", { accepted: false, errorClass: "policy" }); }
    if (validationOperation?.state === "Running") {
      try { validationOperation = o.workspace!.binding.store.finish(validationOperation.operationId, validationOperation.version, "Uncertain"); }
      catch { try { o.workspace!.binding.store.retireSession(); } catch { /* Do not replay. */ } }
    }
    const why = error instanceof EngineeringWorkspaceUncertain ? "uncertain" : error instanceof EngineeringProviderError && error.failure.category === "timeout" ? "timeout" : error instanceof EngineeringProviderError && error.failure.category === "cancelled" ? "cancelled" : error instanceof Stop ? error.reason : signal.aborted ? o.signal?.aborted ? "cancelled" : "timeout" : "failed";
    if (error instanceof EngineeringProviderError) result.providerFailure = { ...error.failure };
    if (error instanceof Stop && error.reason === "budget") emitTelemetry(executionTelemetry, "engineering.budget", { accepted: false, errorClass: "limit" });
    result.termination = applying || validating || why === "uncertain" ? "uncertain" : why;
    try { await state(result.termination === "uncertain" ? "Uncertain" : result.termination === "cancelled" ? "Cancelled" : "Failed"); }
    catch { result.state = "Uncertain"; result.termination = "uncertain"; }
  }
  try { if (o.level > 1) await finishDiff(); } catch { result.state = "Uncertain"; result.termination = "uncertain"; }
  return deliver();
}
function validateEvidence(e: ValidationEvidence, snapshot: WorkspaceSnapshot, workspaceId: string): void {
  const label = (s: unknown) => typeof s === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(s);
  if (e.kind !== "fixture" || e.snapshotDigest !== snapshot.digest || e.workspaceId !== workspaceId ||
      !["passed", "failed"].includes(e.result) || !Number.isSafeInteger(e.exitCode) || (e.result === "passed" ? e.exitCode !== 0 : e.exitCode === 0) ||
      !label(e.profile) || !label(e.environment) || !label(e.validationId) || !Number.isSafeInteger(e.durationMs) || e.durationMs < 0 || e.durationMs > 120_000 ||
      !/^[a-f0-9]{64}$/.test(e.logDigest) || !Array.isArray(e.passedChecks) || e.passedChecks.length > 64 || e.passedChecks.some(c => !label(c)) ||
      !e.resources || !Number.isFinite(e.resources.cpu) || e.resources.cpu <= 0 || e.resources.cpu > 0.5 || !Number.isSafeInteger(e.resources.memoryBytes) || e.resources.memoryBytes < 1 || e.resources.memoryBytes > 268435456 ||
      !Number.isSafeInteger(e.resources.pids) || e.resources.pids < 1 || e.resources.pids > 64) throw new Stop("uncertain");
}
