/** Diagnostic metadata only. None of these identifiers or callbacks grant authority. */
export type TelemetryStatus = "ok" | "error" | "cancelled" | "timeout" | "denied" | "blocked" | "uncertain";
export type TelemetryErrorClass = "cancelled" | "timeout" | "invalid_response" | "limit" | "policy" | "approval" | "storage" | "tool" | "dependency" | "runtime" | "http" | "invalid_input";
export type TelemetrySpanName = "execution" | "task" | "agent" | "model.turn" | "provider.request" | "provider.http" | "tool.dispatch" | "tool.handler";
export type TelemetryEventName = "task.blocked" | "agent.tools_requested" | "agent.tools_rejected" | "agent.limit" | "tool.validation" | "tool.policy" | "tool.authorization";
export interface TraceContext {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  executionId: string;
  taskId?: string;
  agentRole?: import("./index.js").AgentRole;
}
export interface TokenUsage {
  availability: "reported" | "unavailable";
  /** Total input, including any cache read/write subset. */
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Subset of output, never added to outputTokens. */
  reasoningTokens?: number;
}
export interface TelemetryAttributes {
  taskId?: string;
  agentRole?: import("./index.js").AgentRole;
  provider?: string;
  model?: string;
  toolId?: string;
  operationId?: string;
  operationState?: import("./durable.js").OperationState;
  dependencyCount?: number;
  toolCalls?: number;
  accepted?: boolean;
  approvalRequired?: boolean;
  errorClass?: TelemetryErrorClass;
}
export interface SpanOutcome extends TelemetryAttributes {
  status: TelemetryStatus;
  usage?: TokenUsage;
}
export interface TelemetryEvent {
  schemaVersion: 1;
  sessionId: string;
  sequence: number;
  timestamp: string;
  context: Readonly<TraceContext>;
  type: "span.start" | "span.end" | "event";
  name: TelemetrySpanName | TelemetryEventName;
  attributes: Readonly<TelemetryAttributes>;
  status?: TelemetryStatus;
  durationMs?: number;
  usage?: Readonly<TokenUsage>;
}
export interface SpanRecord {
  context: Readonly<TraceContext>;
  name: TelemetrySpanName;
  status?: TelemetryStatus;
  durationMs?: number;
  incomplete: boolean;
}
export interface ExecutionTrace {
  executionId: string;
  spans: readonly SpanRecord[];
  incomplete: boolean;
  duplicateEvents: number;
  orphanEvents: number;
}
export interface TelemetrySpan {
  readonly binding: TelemetryBinding;
  end(outcome: SpanOutcome): void;
}
export interface TelemetryObserver {
  trace(executionId: string): TelemetryBinding;
  startSpan(binding: TelemetryBinding, name: TelemetrySpanName, attributes?: TelemetryAttributes): TelemetrySpan;
  event(binding: TelemetryBinding, name: TelemetryEventName, attributes?: TelemetryAttributes): void;
}
export interface TelemetryBinding {
  readonly observer: TelemetryObserver;
  readonly context: Readonly<TraceContext>;
}
export interface TelemetrySink {
  write(event: Readonly<TelemetryEvent>): void | Promise<void>;
}
export interface TelemetryDiagnostics {
  accepted: number;
  delivered: number;
  dropped: number;
  invalid: number;
  sinkErrors: number;
  sinkTimeouts: number;
  queuedEvents: number;
  queuedBytes: number;
  activeSpans: number;
  disabled: boolean;
}
export interface CostRate {
  provider: string;
  model: string;
  currency: string;
  version: string;
  effectiveDate: string;
  /** Amount per million tokens. Cache rates required if nonzero usage is reported. */
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}
export type CostEstimate =
  | { status: "unknown"; reason: "missing_usage" | "missing_rate" | "incomplete_usage" | "mixed_currency"; knownAmount?: number; currency?: string }
  | { status: "estimated"; amount: number; currency: string; rateVersions: readonly string[] };
export interface MetricGroup {
  key: string;
  durationMs: number;
  modelCalls: number;
  modelTurns: number;
  toolCalls: number;
  denials: number;
  errors: number;
  cancellations: number;
  timeouts: number;
  uncertain: number;
  tokens: TokenUsage & { reportedRequests: number; unreportedRequests: number; incompleteRequests: number };
  cost: CostEstimate;
}
export interface ExecutionMetrics extends MetricGroup {
  executionId: string;
  complete: boolean;
  reviewRequired: boolean;
  byTask: readonly MetricGroup[];
  byAgent: readonly MetricGroup[];
  byProvider: readonly MetricGroup[];
  modelLatencyMs: readonly number[];
  httpLatencyMs: readonly number[];
  toolLatencyMs: readonly number[];
}

/** Observer faults cannot change runtime authorization/results. Custom host code is trusted. */
export function beginTelemetry(binding: TelemetryBinding | undefined, name: TelemetrySpanName, attributes?: TelemetryAttributes): TelemetrySpan | undefined {
  try { return binding?.observer.startSpan(binding, name, attributes); } catch { return undefined; }
}
export function emitTelemetry(binding: TelemetryBinding | undefined, name: TelemetryEventName, attributes?: TelemetryAttributes): void {
  try { binding?.observer.event(binding, name, attributes); } catch { /* diagnostic only */ }
}
export function endTelemetry(span: TelemetrySpan | undefined, outcome: SpanOutcome): void {
  try { span?.end(outcome); } catch { /* diagnostic only */ }
}
export function traceTelemetry(observer: TelemetryObserver | undefined, executionId: string): TelemetryBinding | undefined {
  try { return observer?.trace(executionId); } catch { return undefined; }
}
