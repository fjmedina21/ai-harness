import {
  beginTelemetry,
  endTelemetry,
  type TelemetryBinding,
  type TelemetryErrorClass,
  type ProviderHttpErrorCategory,
  type TelemetryStatus,
  type TokenUsage,
} from "@ai-harness/contracts";

/** Safe fixed classification, never an upstream error message or payload. */
export class ProviderTransportError extends Error {
  constructor(
    message: string,
    readonly classification: TelemetryErrorClass,
    readonly httpStatus?: number,
    readonly httpErrorCategory?: ProviderHttpErrorCategory,
  ) {
    super(message);
    this.name = "ProviderTransportError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
function count(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? value as number
    : undefined;
}

/** Adapter-only translation; missing/malformed counts remain unknown, never zero. */
export function normalizeTokenUsage(vendor: "openai" | "anthropic", raw: unknown): TokenUsage {
  const usage = record(record(raw)?.usage);
  if (!usage) return { availability: "unavailable" };
  let input = count(usage.input_tokens);
  const output = count(usage.output_tokens);
  const details = record(usage.input_tokens_details);
  const cached = count(vendor === "openai" ? details?.cached_tokens : usage.cache_read_input_tokens);
  const written = count(vendor === "openai" ? details?.cache_write_tokens : usage.cache_creation_input_tokens);
  const reasoning = vendor === "openai" ? count(record(usage.output_tokens_details)?.reasoning_tokens) : undefined;
  if (vendor === "anthropic" && input !== undefined) {
    // Missing cache fields in the legacy uncached shape mean no cache component was reported.
    // Malformed explicitly supplied fields prevent reconstruction of the total.
    if ((usage.cache_read_input_tokens !== undefined && cached === undefined) ||
        (usage.cache_creation_input_tokens !== undefined && written === undefined)) {
      input = undefined;
    } else {
      const total = input + (cached ?? 0) + (written ?? 0);
      input = Number.isSafeInteger(total) ? total : undefined;
    }
  }
  const result: TokenUsage = {
    availability: "reported",
    ...(input !== undefined ? { inputTokens: input } : {}),
    ...(output !== undefined ? { outputTokens: output } : {}),
    ...(cached !== undefined ? { cacheReadTokens: cached } : {}),
    ...(written !== undefined ? { cacheWriteTokens: written } : {}),
    ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
  };
  // Contradictory subset counts cannot support a trustworthy total/cost estimate.
  if (vendor === "openai" && (
      (details?.cached_tokens !== undefined && cached === undefined) ||
      (details?.cache_write_tokens !== undefined && written === undefined) ||
      (input !== undefined && (cached ?? 0) + (written ?? 0) > input)
    )) delete result.inputTokens;
  if (reasoning !== undefined && output !== undefined && reasoning > output) delete result.outputTokens;
  return Object.keys(result).length > 1 ? result : { availability: "unavailable" };
}

export function providerFailure(error: unknown, signal?: AbortSignal): {
  status: TelemetryStatus;
  errorClass: TelemetryErrorClass;
  providerHttpStatus?: number;
  providerHttpErrorCategory?: ProviderHttpErrorCategory;
} {
  const errorClass = signal?.aborted ? "cancelled" :
    error instanceof ProviderTransportError ? error.classification : "invalid_response";
  const diagnostics = error instanceof ProviderTransportError ? {
    ...(error.httpStatus !== undefined ? { providerHttpStatus: error.httpStatus } : {}),
    ...(error.httpErrorCategory ? { providerHttpErrorCategory: error.httpErrorCategory } : {}),
  } : {};
  return {
    status: errorClass === "cancelled" ? "cancelled" : errorClass === "timeout" ? "timeout" : "error",
    errorClass,
    ...diagnostics,
  };
}

/** Diagnostic callbacks cannot alter provider results or grant any authority. */
export async function observeProvider<T>(
  binding: TelemetryBinding | undefined,
  provider: "openai" | "anthropic",
  model: string,
  signal: AbortSignal | undefined,
  run: (binding: TelemetryBinding | undefined, reportUsage: (raw: unknown) => void) => Promise<T>,
): Promise<T> {
  const span = beginTelemetry(binding, "provider.request", { provider, model });
  let usage: TokenUsage = { availability: "unavailable" };
  try {
    const result = await run(span?.binding, (raw) => {
      // No raw response object crosses the telemetry port.
      if (span) usage = normalizeTokenUsage(provider, raw);
    });
    endTelemetry(span, { status: "ok", usage });
    return result;
  } catch (error) {
    endTelemetry(span, { ...providerFailure(error, signal), usage });
    throw error;
  }
}
