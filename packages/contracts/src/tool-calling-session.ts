import type {
  ModelToolResult,
  ModelToolTurn,
  ToolCallingContinuation,
  ToolCallingHistoryEntry,
  ToolCallingIdentity,
  ToolCallingSessionOptions,
} from "./tool-calling.js";
import {
  parseModelToolTurn,
  validateJsonValue,
} from "./tool-calling-validation.js";

export const TOOL_SESSION_LIMITS = {
  maxHistoryBytes: 262_144,
  maxResultBytes: 16_384,
  maxTurns: 5,
  maxTotalCalls: 16,
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function onlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function identityOf(raw: unknown): Readonly<ToolCallingIdentity> {
  if (!record(raw) || !onlyKeys(raw, ["executionId", "taskId"])) {
    throw new Error("Invalid session identity");
  }
  for (const key of ["executionId", "taskId"] as const) {
    if (
      typeof raw[key] !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(raw[key])
    ) {
      throw new Error("Invalid session identity");
    }
  }
  return Object.freeze({
    executionId: raw.executionId as string,
    taskId: raw.taskId as string,
  });
}

/** Neutral, in-memory session state only. No tools, HTTP, native state or authority.
 * Results MUST be supplied by trusted host code after dispatch. Structural
 * validation cannot prove execution or authenticate a result's provenance.
 */
export class ToolCallingSession {
  readonly identity: Readonly<ToolCallingIdentity>;
  private history: ToolCallingHistoryEntry[] = [];
  private limits: Record<keyof typeof TOOL_SESSION_LIMITS, number>;
  private signal?: AbortSignal;
  private closed = false;

  constructor(
    identity: ToolCallingIdentity,
    options: ToolCallingSessionOptions = {},
  ) {
    this.identity = identityOf(identity);
    this.signal = options.signal;
    this.limits = { ...TOOL_SESSION_LIMITS };
    for (const [key, value] of Object.entries(options.limits ?? {})) {
      if (
        !Object.hasOwn(TOOL_SESSION_LIMITS, key) ||
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        value > TOOL_SESSION_LIMITS[key as keyof typeof TOOL_SESSION_LIMITS]
      ) {
        throw new Error("Invalid session limit");
      }
      this.limits[key as keyof typeof TOOL_SESSION_LIMITS] = value;
    }
  }

  /** Call immediately before starting any new provider/tool operation. */
  assertActive(identity: ToolCallingIdentity = this.identity): void {
    if (this.closed) throw new Error("Session closed");
    if (this.signal?.aborted)
      throw new Error(
        "Session cancelled; started operations are not rolled back",
      );
    const candidate = identityOf(identity);
    if (
      candidate.executionId !== this.identity.executionId ||
      candidate.taskId !== this.identity.taskId
    ) {
      throw new Error("Session identity mismatch");
    }
  }

  /** A provider turn is forbidden until every previous call has a result. */
  continuation(): ToolCallingContinuation {
    this.assertActive();
    const last = this.history.at(-1);
    if (last?.kind === "model") {
      throw new Error(
        last.turn.kind === "message"
          ? "Session completed"
          : "Missing tool results",
      );
    }
    if (
      last?.kind === "tool_results" &&
      last.results.some((r) => r.status !== "executed")
    ) {
      throw new Error("Non-executed results block continuation");
    }
    const turns = this.history.filter((entry) => entry.kind === "model").length;
    if (turns >= this.limits.maxTurns)
      throw new Error("Model turn limit exceeded");
    return this.snapshot();
  }

  recordTurn(identity: ToolCallingIdentity, raw: unknown): ModelToolTurn {
    this.assertActive(identity);
    this.continuation();
    const turn = parseModelToolTurn(raw);
    const previousCalls = this.history.flatMap((entry) =>
      entry.kind === "model" && entry.turn.kind === "tool_calls"
        ? entry.turn.calls
        : [],
    );
    if (turn.kind === "tool_calls") {
      const seen = new Set(previousCalls.map((call) => call.id));
      if (turn.calls.some((call) => seen.has(call.id)))
        throw new Error("Duplicate tool call ID across turns");
      if (previousCalls.length + turn.calls.length > this.limits.maxTotalCalls)
        throw new Error("Total tool call limit exceeded");
      // Reserve a turn to process results; do not invite execution on the last turn.
      if (
        this.history.filter((entry) => entry.kind === "model").length + 1 >=
        this.limits.maxTurns
      ) {
        throw new Error("No model turn remaining for tool results");
      }
    }
    this.append({ kind: "model", turn });
    return structuredClone(turn);
  }

  /** Whole-batch validation is atomic; partial or extra results are rejected. */
  recordResults(identity: ToolCallingIdentity, raw: unknown): void {
    this.assertActive(identity);
    const last = this.history.at(-1);
    if (last?.kind !== "model" || last.turn.kind !== "tool_calls")
      throw new Error("No pending tool calls");
    if (!Array.isArray(raw) || raw.length !== last.turn.calls.length)
      throw new Error("Missing or extra tool results");
    const pending = new Map(
      last.turn.calls.map((call) => [call.id, call.toolId]),
    );
    const results: ModelToolResult[] = [];
    for (const result of raw) {
      if (
        !record(result) ||
        !onlyKeys(result, ["callId", "toolId", "status", "data", "error"])
      ) {
        throw new Error("Invalid tool result");
      }
      if (
        typeof result.callId !== "string" ||
        !pending.has(result.callId) ||
        pending.get(result.callId) !== result.toolId
      )
        throw new Error("Foreign or duplicate tool result");
      pending.delete(result.callId);
      if (typeof result.status !== "string")
        throw new Error("Invalid result status");
      if (result.status === "executed") {
        if (!Object.hasOwn(result, "data") || Object.hasOwn(result, "error"))
          throw new Error("Invalid executed result");
      } else if (
        !["invalid", "denied", "approval_required", "failed"].includes(
          String(result.status),
        ) ||
        typeof result.error !== "string" ||
        !result.error.trim() ||
        Object.hasOwn(result, "data")
      ) {
        throw new Error("Invalid non-executed result");
      }
      validateJsonValue(result, 0);
      const serialized = JSON.stringify(result);
      if (Buffer.byteLength(serialized, "utf8") > this.limits.maxResultBytes)
        throw new Error("Tool result size limit exceeded");
      results.push(JSON.parse(serialized) as ModelToolResult);
    }
    this.append({ kind: "tool_results", results });
  }

  /** Inspection may include pending/blocked/final turns; not a continuation grant. */
  snapshot(): ToolCallingContinuation {
    this.assertActive();
    return {
      identity: { ...this.identity },
      history: structuredClone(this.history),
    };
  }

  close(): void {
    this.closed = true;
    this.history = [];
    this.signal = undefined;
  }

  private append(entry: ToolCallingHistoryEntry): void {
    const candidate = [...this.history, entry];
    if (
      Buffer.byteLength(JSON.stringify(candidate), "utf8") >
      this.limits.maxHistoryBytes
    ) {
      throw new Error("Session history size limit exceeded");
    }
    this.history = candidate;
  }
}

/** Validate complete neutral history before a subsequent request; never dispatches.
 * No native vendor fields or legacy result-only reconstruction are accepted.
 */
export function parseToolCallingContinuation(
  raw: unknown,
  expectedIdentity?: ToolCallingIdentity,
): ToolCallingContinuation {
  if (
    !record(raw) ||
    !onlyKeys(raw, ["identity", "history"]) ||
    !Array.isArray(raw.history)
  ) {
    throw new Error("Invalid continuation");
  }
  // Bound the entry count before walking untrusted input.
  if (raw.history.length > TOOL_SESSION_LIMITS.maxTurns * 2)
    throw new Error("History entry limit exceeded");
  const identity = identityOf(raw.identity);
  const session = new ToolCallingSession(identity);
  session.assertActive(expectedIdentity ?? identity);
  try {
    for (const entry of raw.history) {
      if (!record(entry)) throw new Error("Invalid history entry");
      if (entry.kind === "model" && onlyKeys(entry, ["kind", "turn"])) {
        session.recordTurn(identity, entry.turn);
      } else if (
        entry.kind === "tool_results" &&
        onlyKeys(entry, ["kind", "results"])
      ) {
        session.recordResults(identity, entry.results);
      } else {
        throw new Error("Invalid history entry");
      }
    }
    return session.continuation();
  } finally {
    session.close();
  }
}
