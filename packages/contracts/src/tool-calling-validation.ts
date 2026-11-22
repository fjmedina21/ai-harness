import type { ModelToolCall, ModelToolTurn } from "./tool-calling.js";

export const TOOL_CALL_LIMITS = {
  maxCallsPerTurn: 8,
  maxArgumentsBytes: 16_384,
  maxTextLength: 32_000,
  maxDepth: 8,
} as const;

const CALL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TOOL_ID_PATTERN = /^[a-z][a-z0-9._-]*$/;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validateJsonValue(value: unknown, depth: number): void {
  if (depth > TOOL_CALL_LIMITS.maxDepth) {
    throw new Error("Tool arguments exceed maximum depth");
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite tool argument");
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) {
        throw new Error("Sparse arrays are not supported");
      }

      validateJsonValue(value[index], depth + 1);
    }
    return;
  }

  if (!isRecord(value)) {
    throw new Error("Unsupported tool argument type");
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error("Forbidden tool argument property");
    }

    validateJsonValue(child, depth + 1);
  }
}

function parseCall(value: unknown): ModelToolCall {
  if (!isRecord(value)) {
    throw new Error("Invalid tool call");
  }

  if (!hasOnlyKeys(value, ["id", "toolId", "arguments"])) {
    throw new Error("Unexpected tool call property");
  }

  if (typeof value.id !== "string" || !CALL_ID_PATTERN.test(value.id)) {
    throw new Error("Invalid tool call ID");
  }

  if (
    typeof value.toolId !== "string" ||
    value.toolId.length > 128 ||
    !TOOL_ID_PATTERN.test(value.toolId)
  ) {
    throw new Error("Invalid tool ID");
  }

  if (!isRecord(value.arguments)) {
    throw new Error("Tool arguments must be an object");
  }

  validateJsonValue(value.arguments, 0);

  const serialized = JSON.stringify(value.arguments);

  if (
    Buffer.byteLength(serialized, "utf8") > TOOL_CALL_LIMITS.maxArgumentsBytes
  ) {
    throw new Error("Tool arguments exceed size limit");
  }

  // Return an independent JSON value, not the provider's
  // original mutable object.
  return {
    id: value.id,
    toolId: value.toolId,
    arguments: JSON.parse(serialized) as Record<string, unknown>,
  };
}

/**
 * Boundary parser for untrusted provider responses.
 *
 * Parsing is NOT authorization and never dispatches tools.
 */
export function parseModelToolTurn(raw: unknown): ModelToolTurn {
  if (!isRecord(raw)) {
    throw new Error("Invalid model turn");
  }

  if (raw.kind === "message") {
    if (
      !hasOnlyKeys(raw, ["kind", "text"]) ||
      typeof raw.text !== "string" ||
      raw.text.length > TOOL_CALL_LIMITS.maxTextLength
    ) {
      throw new Error("Invalid model message");
    }

    return {
      kind: "message",
      text: raw.text,
    };
  }

  if (raw.kind !== "tool_calls") {
    throw new Error("Unsupported model turn kind");
  }

  if (!hasOnlyKeys(raw, ["kind", "calls", "text"])) {
    throw new Error("Unexpected model turn property");
  }

  if (
    !Array.isArray(raw.calls) ||
    raw.calls.length === 0 ||
    raw.calls.length > TOOL_CALL_LIMITS.maxCallsPerTurn
  ) {
    throw new Error("Invalid tool call count");
  }

  if (
    raw.text !== undefined &&
    (typeof raw.text !== "string" ||
      raw.text.length > TOOL_CALL_LIMITS.maxTextLength)
  ) {
    throw new Error("Invalid tool call message");
  }

  const calls = raw.calls.map(parseCall);
  const ids = calls.map((call) => call.id);

  if (new Set(ids).size !== ids.length) {
    throw new Error("Duplicate tool call IDs");
  }

  return {
    kind: "tool_calls",
    calls,
    ...(typeof raw.text === "string" ? { text: raw.text } : {}),
  };
}
