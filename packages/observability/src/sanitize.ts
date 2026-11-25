import { AGENT_ROLES, OPERATION_STATES, ENGINEERING_STATES, RESUME_TELEMETRY_EVENTS } from "@ai-harness/contracts";
import type { ProviderHttpErrorCategory, TelemetryAttributes, TelemetryErrorClass, TokenUsage } from "@ai-harness/contracts";

export const SPANS = ["engineering.phase","execution", "task", "agent", "model.turn", "provider.request", "provider.http", "tool.dispatch", "tool.handler"] as const;
export const EVENTS = ["engineering.resume", "engineering.context", "engineering.budget", "engineering.proposal_validation", "engineering.state", "engineering.workspace", "engineering.patch", "engineering.approval", "engineering.validation", "engineering.repair", "engineering.review", "engineering.completion", "task.blocked", "agent.tools_requested", "agent.tools_rejected", "agent.limit", "tool.validation", "tool.policy", "tool.authorization"] as const;
export const STATUSES = ["ok", "error", "cancelled", "timeout", "denied", "blocked", "uncertain"] as const;
export const ERRORS: readonly TelemetryErrorClass[] = ["cancelled", "timeout", "invalid_response", "limit", "policy", "approval", "storage", "tool", "dependency", "runtime", "http", "invalid_input"];
export const PROVIDER_HTTP_ERROR_CATEGORIES: readonly ProviderHttpErrorCategory[] = ["rate_limit", "quota_or_billing", "authentication", "permission", "model_access", "invalid_request", "unknown"];

export function label(raw: unknown): string | undefined {
  return typeof raw === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/.test(raw) ? raw : undefined;
}
export function boundedInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
export function attributes(raw: TelemetryAttributes = {}): TelemetryAttributes {
  const out: TelemetryAttributes = {};
  if (RESUME_TELEMETRY_EVENTS.includes(raw.resumeEvent!)) out.resumeEvent = raw.resumeEvent;
  if (["role", "context.read", "context.serialize", "request.serialize", "transport.parse", "response.parse", "patch.validate", "checkpoint.persist", "report.prepare"].includes(raw.phase!)) out.phase = raw.phase;
  if (boundedInteger(raw.requestIndex, 32) && raw.requestIndex > 0) out.requestIndex = raw.requestIndex;
  if (boundedInteger(raw.remainingMs, 900_000)) out.remainingMs = raw.remainingMs;
  if (boundedInteger(raw.contextBytes, 65_536)) out.contextBytes = raw.contextBytes;
  if (["workflow", "absolute", "role", "request", "persistence"].includes(raw.timeoutScope!)) out.timeoutScope = raw.timeoutScope;
  if (["proposed", "approval_required", "review_pending", "completed", "budget", "no_progress", "regression", "failed", "cancelled", "timeout", "uncertain", "sandbox_blocked"].includes(raw.termination!)) out.termination = raw.termination;
  if (typeof raw.patchDigest === "string" && /^[a-f0-9]{64}$/.test(raw.patchDigest)) out.patchDigest = raw.patchDigest;
  if (ENGINEERING_STATES.includes(raw.engineeringState!)) out.engineeringState = raw.engineeringState;
  if (boundedInteger(raw.iteration, 8)) out.iteration = raw.iteration;
  for (const key of ["taskId", "provider", "model", "toolId", "operationId"] as const) {
    const value = label(raw[key]);
    if (value !== undefined) out[key] = value;
  }
  if (AGENT_ROLES.includes(raw.agentRole!)) out.agentRole = raw.agentRole;
  if (OPERATION_STATES.includes(raw.operationState!)) out.operationState = raw.operationState;
  for (const key of ["dependencyCount", "toolCalls"] as const)
    if (boundedInteger(raw[key], 10_000)) out[key] = raw[key];
  for (const key of ["accepted", "approvalRequired"] as const)
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  if (ERRORS.includes(raw.errorClass!)) out.errorClass = raw.errorClass;
  if (boundedInteger(raw.providerHttpStatus, 599) && raw.providerHttpStatus >= 100) out.providerHttpStatus = raw.providerHttpStatus;
  if (PROVIDER_HTTP_ERROR_CATEGORIES.includes(raw.providerHttpErrorCategory!)) out.providerHttpErrorCategory = raw.providerHttpErrorCategory;
  return out;
}
export function usage(raw?: TokenUsage): TokenUsage {
  if (!raw || raw.availability !== "reported") return { availability: "unavailable" };
  const out: TokenUsage = { availability: "reported" };
  for (const key of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"] as const)
    if (boundedInteger(raw[key])) out[key] = raw[key];
  if (out.inputTokens !== undefined && (out.cacheReadTokens ?? 0) + (out.cacheWriteTokens ?? 0) > out.inputTokens)
    return { availability: "unavailable" };
  if (out.outputTokens !== undefined && (out.reasoningTokens ?? 0) > out.outputTokens)
    return { availability: "unavailable" };
  return out;
}
