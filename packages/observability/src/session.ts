import { randomUUID } from "node:crypto";
import type { SpanOutcome, TelemetryAttributes, TelemetryBinding, TelemetryDiagnostics, TelemetryEvent, TelemetryEventName, TelemetryObserver, TelemetrySink, TelemetrySpan, TelemetrySpanName, TraceContext } from "@ai-harness/contracts";
import { attributes, EVENTS, label, SPANS, STATUSES, usage } from "./sanitize.js";

export interface TelemetrySessionOptions {
  sink: TelemetrySink;
  maxEvents?: number;
  maxQueueEvents?: number;
  maxQueueBytes?: number;
  maxActiveSpans?: number;
  maxTraces?: number;
  sinkTimeoutMs?: number;
  /** Trusted deterministic host clocks for tests; monotonic clock measures durations. */
  now?: () => Date;
  monotonicNow?: () => number;
}
function limit(value: number | undefined, fallback: number, max: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error("Invalid telemetry limit");
  return n;
}
/** Per-host session, bounded best-effort capture. No timers or I/O until records arrive. */
export class TelemetrySession implements TelemetryObserver {
  readonly sessionId = randomUUID();
  private readonly bindings = new WeakSet<TelemetryBinding>();
  private readonly traces = new Map<string, TelemetryBinding>();
  private readonly queue: {event: Readonly<TelemetryEvent>; bytes: number}[] = [];
  private readonly config;
  private readonly counts: TelemetryDiagnostics = { accepted: 0, delivered: 0, dropped: 0, invalid: 0, sinkErrors: 0, sinkTimeouts: 0, queuedEvents: 0, queuedBytes: 0, activeSpans: 0, disabled: false };
  private sequence = 0;
  private draining?: Promise<void>;
  private closed = false;

  constructor(private readonly options: TelemetrySessionOptions) {
    this.config = {
      maxEvents: limit(options.maxEvents, 10_000, 100_000),
      maxQueueEvents: limit(options.maxQueueEvents, 512, 4096),
      maxQueueBytes: limit(options.maxQueueBytes, 1_048_576, 8_388_608),
      maxActiveSpans: limit(options.maxActiveSpans, 256, 1024),
      maxTraces: limit(options.maxTraces, 128, 1024),
      sinkTimeoutMs: limit(options.sinkTimeoutMs, 250, 1000),
    };
  }
  trace(executionId: string): TelemetryBinding {
    const id = label(executionId);
    if (!id || this.closed) throw new Error("Invalid telemetry trace");
    const found = this.traces.get(id);
    if (found) return found;
    if (this.traces.size >= this.config.maxTraces) { this.counts.dropped++; throw new Error("Telemetry trace limit"); }
    const binding = this.binding({ traceId: randomUUID(), executionId: id });
    this.traces.set(id, binding);
    return binding;
  }
  private binding(context: TraceContext): TelemetryBinding {
    const binding = Object.freeze({observer: this, context: Object.freeze({...context})});
    this.bindings.add(binding);
    return binding;
  }
  startSpan(parent: TelemetryBinding, name: TelemetrySpanName, raw: TelemetryAttributes = {}): TelemetrySpan {
    if (!this.bindings.has(parent) || !SPANS.includes(name) || this.closed) throw new Error("Invalid telemetry span");
    if (this.counts.activeSpans >= this.config.maxActiveSpans) { this.counts.dropped++; throw new Error("Telemetry span limit"); }
    const attrs = attributes(raw);
    const binding = this.binding({
      ...parent.context,
      taskId: attrs.taskId ?? parent.context.taskId,
      agentRole: attrs.agentRole ?? parent.context.agentRole,
      parentSpanId: parent.context.spanId,
      spanId: randomUUID(),
    });
    const started = (this.options.monotonicNow ?? performance.now.bind(performance))();
    if (!Number.isFinite(started)) throw new Error("Invalid telemetry clock");
    this.counts.activeSpans++;
    this.capture(binding, "span.start", name, attrs);
    let ended = false;
    return Object.freeze({
      binding,
      end: (outcome: SpanOutcome) => {
        if (ended) return;
        ended = true;
        this.counts.activeSpans--;
        try {
          const durationMs = Math.max(0, (this.options.monotonicNow ?? performance.now.bind(performance))() - started);
          if (!STATUSES.includes(outcome.status) || !Number.isFinite(durationMs)) throw new Error("Invalid telemetry outcome");
          this.capture(binding, "span.end", name, {...attrs, ...attributes(outcome)}, {
            status: outcome.status, durationMs,
            ...(name === "provider.request" ? {usage: usage(outcome.usage)} : {}),
          });
        } catch { this.counts.invalid++; this.counts.dropped++; }
      },
    });
  }
  event(binding: TelemetryBinding, name: TelemetryEventName, raw: TelemetryAttributes = {}): void {
    if (!this.bindings.has(binding) || !EVENTS.includes(name)) { this.counts.invalid++; this.counts.dropped++; return; }
    try { this.capture(binding, "event", name, attributes(raw)); } catch { this.counts.invalid++; this.counts.dropped++; }
  }
  private capture(binding: TelemetryBinding, type: TelemetryEvent["type"], name: TelemetryEvent["name"], attrs: TelemetryAttributes, extra: Partial<TelemetryEvent> = {}): void {
    if (this.closed || this.counts.disabled || this.sequence >= this.config.maxEvents) { this.counts.dropped++; return; }
    const event: Readonly<TelemetryEvent> = Object.freeze({
      schemaVersion: 1, sessionId: this.sessionId, sequence: ++this.sequence,
      timestamp: (this.options.now ?? (() => new Date()))().toISOString(),
      context: binding.context, type, name, attributes: Object.freeze({...attrs}), ...extra,
      ...(extra.usage ? {usage: Object.freeze({...extra.usage})} : {}),
    });
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (bytes > 2048 || this.queue.length >= this.config.maxQueueEvents || this.counts.queuedBytes + bytes > this.config.maxQueueBytes) { this.counts.dropped++; return; }
    this.counts.accepted++;
    this.queue.push({event, bytes});
    this.counts.queuedEvents++;
    this.counts.queuedBytes += bytes;
    if (!this.draining) {
      this.draining = Promise.resolve().then(() => this.drain()).finally(() => { this.draining = undefined; });
    }
  }
  private async drain(): Promise<void> {
    while (this.queue.length && !this.counts.disabled) {
      const item = this.queue.shift()!;
      this.counts.queuedEvents--; this.counts.queuedBytes -= item.bytes;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => this.options.sink.write(item.event)).then(() => "delivered" as const),
          new Promise<"timeout">((resolve) => {timer = setTimeout(() => resolve("timeout"), this.config.sinkTimeoutMs);}),
        ]);
        if (result === "timeout") {
          this.counts.sinkTimeouts++; this.counts.dropped++; this.counts.disabled = true;
        } else this.counts.delivered++;
      } catch {
        this.counts.sinkErrors++; this.counts.dropped++; this.counts.disabled = true;
      } finally { if (timer) clearTimeout(timer); }
    }
    if (this.counts.disabled) {
      this.counts.dropped += this.queue.length;
      this.queue.length = 0; this.counts.queuedEvents = 0; this.counts.queuedBytes = 0;
    }
  }
  diagnostics(): Readonly<TelemetryDiagnostics> { return Object.freeze({...this.counts}); }
  async flush(): Promise<Readonly<TelemetryDiagnostics>> { await this.draining; return this.diagnostics(); }
  async close(): Promise<Readonly<TelemetryDiagnostics>> {
    this.closed = true;
    this.traces.clear();
    return this.flush();
  }
}
