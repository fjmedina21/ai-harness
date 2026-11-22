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
): Promise<unknown> {
  const timeoutMs = boundedOption(options.timeoutMs, PROVIDER_LIMITS.timeoutMs);
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
    throw new Error("Provider request size limit exceeded");
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
    if (!response.ok)
      throw new Error(`Provider request failed with HTTP ${response.status}`);
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > maxResponseBytes)
    ) {
      throw new Error("Provider response size limit exceeded");
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
        throw new Error("Provider response size limit exceeded");
      chunks.push(chunk.value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch (error) {
    if (combined.aborted)
      throw new Error("Provider request cancelled or timed out");
    if (
      error instanceof Error &&
      /^Provider (request (size limit exceeded|failed with HTTP \d+)|response size limit exceeded)$/.test(
        error.message,
      )
    ) {
      throw error;
    }
    throw new Error("Invalid or failed provider response");
  } finally {
    clearTimeout(timer);
    combined.removeEventListener("abort", onAbort);
    // Do not wait indefinitely for an uncooperative injected stream.
    if (reader) void reader.cancel().catch(() => {});
    else if (response?.body) void response.body.cancel().catch(() => {});
  }
}
