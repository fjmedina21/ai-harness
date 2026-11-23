import {
  beginTelemetry,
  endTelemetry,
  type ProviderHttpErrorCategory,
  type TelemetryBinding,
} from "@ai-harness/contracts";
import { ProviderTransportError, providerFailure } from "./telemetry.js";

export interface TransportOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRequestBytes?: number;
  maxOutputTokens?: number;
}

export const PROVIDER_LIMITS = {
  timeoutMs: 30_000,
  maxResponseBytes: 1_048_576,
  maxRequestBytes: 1_048_576,
  maxOutputTokens: 4096,
} as const;

export const PROVIDER_TIMEOUT_CEILING_MS = 600_000;

const MAX_PROVIDER_ERROR_BODY_BYTES = 4096;

function providerHttpErrorCategory(code: unknown, type: unknown): ProviderHttpErrorCategory {
  const categories: Record<string, ProviderHttpErrorCategory> = {
    rate_limit_exceeded: "rate_limit",
    rate_limit_error: "rate_limit",
    slow_down: "rate_limit",
    insufficient_quota: "quota_or_billing",
    billing_hard_limit_reached: "quota_or_billing",
    organization_spend_limit_exceeded: "quota_or_billing",
    project_spend_limit_exceeded: "quota_or_billing",
    organization_usage_limit_exceeded: "quota_or_billing",
    usage_limit_exceeded: "quota_or_billing",
    invalid_api_key: "authentication",
    invalid_authentication: "authentication",
    authentication_error: "authentication",
    permission_denied: "permission",
    insufficient_permissions: "permission",
    model_not_found: "model_access",
    model_access_denied: "model_access",
    invalid_request_error: "invalid_request",
    invalid_request: "invalid_request",
  };
  for (const value of [code, type]) {
    if (typeof value === "string") {
      const key = value.toLowerCase();
      if (Object.hasOwn(categories, key)) return categories[key]!;
    }
  }
  return "unknown";
}

/** Reads only a tiny bounded error envelope and maps known codes to fixed labels. */
async function readProviderHttpErrorCategory(
  response: Response,
  aborted: Promise<never>,
): Promise<ProviderHttpErrorCategory> {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_PROVIDER_ERROR_BODY_BYTES)
  ) return "unknown";
  if (!response.body) return "unknown";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) {
        complete = true;
        break;
      }
      total += chunk.value.byteLength;
      if (total > MAX_PROVIDER_ERROR_BODY_BYTES) return "unknown";
      chunks.push(chunk.value);
    }
    const body: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
    if (typeof body !== "object" || body === null || Array.isArray(body)) return "unknown";
    const error = (body as Record<string, unknown>).error;
    if (typeof error !== "object" || error === null || Array.isArray(error)) return "unknown";
    const fields = error as Record<string, unknown>;
    return providerHttpErrorCategory(fields.code, fields.type);
  } catch {
    return "unknown";
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
  }
}

export function boundedOption(
  value: number | undefined,
  ceiling: number,
): number {
  if (value === undefined) return ceiling;
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
    throw new Error("Invalid provider limit");
  }
  return value;
}

/** No redirects, retries or upstream body/error disclosure. Deadline covers body reads. */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetcher: typeof fetch,
  options: TransportOptions = {},
  signal?: AbortSignal,
  observation?: { binding: TelemetryBinding; provider: string; model: string },
): Promise<unknown> {
  const timeoutMs = boundedOption(options.timeoutMs ?? PROVIDER_LIMITS.timeoutMs, PROVIDER_TIMEOUT_CEILING_MS);
  const maxResponseBytes = boundedOption(
    options.maxResponseBytes,
    PROVIDER_LIMITS.maxResponseBytes,
  );
  const maxRequestBytes = boundedOption(
    options.maxRequestBytes,
    PROVIDER_LIMITS.maxRequestBytes,
  );
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > maxRequestBytes)
    throw new ProviderTransportError("Provider request size limit exceeded", "limit");
  const deadline = new AbortController();
  const combined = AbortSignal.any([
    deadline.signal,
    ...(signal ? [signal] : []),
  ]);
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () =>
    rejectAbort(new Error("Provider request cancelled or timed out"));
  combined.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const span = beginTelemetry(observation?.binding, "provider.http", observation ? { provider: observation.provider, model: observation.model } : undefined);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  try {
    if (combined.aborted)
      throw new Error("Provider request cancelled or timed out");
    const fetching = fetcher(url, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", ...headers },
      body: serialized,
      signal: combined,
    });
    // A custom fetcher may ignore abort and resolve late; release its response.
    void fetching.then(
      (late) => {
        if (combined.aborted && late.body)
          void late.body.cancel().catch(() => {});
      },
      () => {},
    );
    response = await Promise.race([fetching, aborted]);
    if (combined.aborted)
      throw new Error("Provider request cancelled or timed out");
    if (!response.ok) {
      const category = await readProviderHttpErrorCategory(response, aborted);
      if (combined.aborted)
        throw new Error("Provider request cancelled or timed out");
      throw new ProviderTransportError(`Provider request failed with HTTP ${response.status}`, "http", response.status, category);
    }
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > maxResponseBytes)
    ) {
      throw new ProviderTransportError("Provider response size limit exceeded", "limit");
    }
    if (!response.body) throw new Error("Missing provider response body");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (combined.aborted)
        throw new Error("Provider request cancelled or timed out");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxResponseBytes)
        throw new ProviderTransportError("Provider response size limit exceeded", "limit");
      chunks.push(chunk.value);
    }
    const result: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
    endTelemetry(span, { status: "ok" });
    return result;
  } catch (error) {
    const classified = combined.aborted
      ? new ProviderTransportError("Provider request cancelled or timed out", signal?.aborted ? "cancelled" : "timeout")
      : error instanceof ProviderTransportError ? error
      : new ProviderTransportError("Invalid or failed provider response", "invalid_response");
    endTelemetry(span, providerFailure(classified, signal));
    if (combined.aborted) throw classified;
    if (
      error instanceof Error &&
      /^Provider (request (size limit exceeded|failed with HTTP \d+)|response size limit exceeded)$/.test(
        error.message,
      )
    ) {
      throw error;
    }
    throw classified;
  } finally {
    clearTimeout(timer);
    combined.removeEventListener("abort", onAbort);
    // Do not wait indefinitely for an uncooperative injected stream.
    if (reader) void reader.cancel().catch(() => {});
    else if (response?.body) void response.body.cancel().catch(() => {});
  }
}
