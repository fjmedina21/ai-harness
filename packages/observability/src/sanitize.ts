import { AGENT_ROLES, OPERATION_STATES } from "@ai-harness/contracts";
import type { ProviderHttpErrorCategory, TelemetryAttributes, TelemetryErrorClass, TokenUsage } from "@ai-harness/contracts";

export const SPANS = ["execution", "task", "agent", "model.turn", "provider.request", "provider.http", "tool.dispatch", "tool.handler"] as const;
export const EVENTS = ["task.blocked", "agent.tools_requested", "agent.tools_rejected", "agent.limit", "tool.validation", "tool.policy", "tool.authorization"] as const;
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
