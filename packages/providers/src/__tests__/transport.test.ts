import assert from "node:assert/strict";
import test from "node:test";
import { postJson, PROVIDER_LIMITS } from "../transport.js";

const url = "https://provider.invalid/test";
const send = (fetcher: typeof fetch, options = {}, signal?: AbortSignal) =>
  postJson(url, {}, { test: true }, fetcher, options, signal);

test("transport sets POST, JSON, redirect denial and a deadline signal", async () => {
  const result = await send(async (target, init) => {
    assert.equal(target, url);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(
      init?.headers && (init.headers as Record<string, string>)["content-type"],
      "application/json",
    );
    assert.ok(init?.signal);
    return Response.json({ ok: true });
  });
  assert.deepEqual(result, { ok: true });
});

test("transport rejects large requests before calling fetch", async () => {
  let calls = 0;
  await assert.rejects(
    send(
      async () => {
        calls++;
        return Response.json({});
      },
      { maxRequestBytes: 1 },
    ),
    /request size/,
  );
  assert.equal(calls, 0);
});

test("transport cancels a body with an oversized declared length", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    send(
      async () =>
        new Response(stream, { headers: { "content-length": "1000" } }),
      { maxResponseBytes: 10 },
    ),
    /response size/,
  );
  assert.equal(cancelled, true);
});

test("transport counts actual streamed bytes despite absent or false length", async () => {
  for (const headers of [
    {} as Record<string, string>,
    { "content-length": "1" },
  ]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('"😀😀😀"'));
      },
      cancel() {
        cancelled = true;
      },
    });
    await assert.rejects(
      send(async () => new Response(stream, { headers }), {
        maxResponseBytes: 10,
      }),
      /response size/,
    );
    assert.equal(cancelled, true);
  }
});

test("transport sanitizes malformed JSON, invalid UTF8 and network errors", async () => {
  for (const fetcher of [
    async () => new Response("Sensitive upstream malformed JSON"),
    async () => new Response(new Uint8Array([255])),
    async () => {
      throw new Error("secret provider diagnostic");
    },
  ]) {
    await assert.rejects(send(fetcher), (error: Error) => {
      assert.equal(error.message, "Invalid or failed provider response");
      return true;
    });
  }
});

test("HTTP errors disclose only status and never retry", async () => {
  for (const status of [401, 429, 500]) {
    let calls = 0;
    await assert.rejects(
      send(async () => {
        calls++;
        return new Response("secret upstream body", { status });
      }),
      new RegExp(`HTTP ${status}$`),
    );
    assert.equal(calls, 1);
  }
});

test("HTTP error envelopes map known codes to fixed safe categories", async () => {
  const cases = [
    { code: "insufficient_quota", type: "invalid_request_error", category: "quota_or_billing" },
    { code: "rate_limit_exceeded", type: "rate_limit_error", category: "rate_limit" },
    { code: "invalid_api_key", type: "authentication_error", category: "authentication" },
    { code: "private-upstream-code", type: "private-upstream-type", category: "unknown" },
  ] as const;
  for (const item of cases) {
    await assert.rejects(
      send(async () => Response.json({ error: {
        code: item.code,
        type: item.type,
        message: "PRIVATE upstream text must never be retained",
      } }, { status: 429 })),
      (error: unknown) => {
        assert.equal((error as Error).message, "Provider request failed with HTTP 429");
        assert.equal((error as { httpStatus?: number }).httpStatus, 429);
        assert.equal((error as { httpErrorCategory?: string }).httpErrorCategory, item.category);
        assert.doesNotMatch(JSON.stringify(error), /PRIVATE|private-upstream/);
        return true;
      },
    );
  }
});

test("oversized provider error envelopes are not parsed", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(5000));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(
    send(async () => new Response(body, { status: 429, headers: { "content-length": "5000" } })),
    (error: unknown) => {
      assert.equal((error as { httpErrorCategory?: string }).httpErrorCategory, "unknown");
      return true;
    },
  );
  assert.equal(cancelled, true);
});

test("pre-abort prevents fetch and in-flight abort settles uncooperative fetch", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    send(
      async () => {
        calls++;
        return Response.json({});
      },
      {},
      controller.signal,
    ),
    /cancelled/,
  );
  assert.equal(calls, 0);
  const inFlight = new AbortController();
  const result = send(
    async () => {
      inFlight.abort();
      return new Promise<Response>(() => {});
    },
    {},
    inFlight.signal,
  );
  await assert.rejects(result, /cancelled/);
});

test("deadline covers fetch and stalled stream reads", async () => {
  await assert.rejects(
    send(async () => new Promise<Response>(() => {}), { timeoutMs: 10 }),
    /timed out/,
  );
  let cancelled = false;
  await assert.rejects(
    send(
      async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        ),
      { timeoutMs: 10 },
    ),
    /timed out/,
  );
  assert.equal(cancelled, true);
});

test("all transport budgets reject invalid and above-ceiling options", async () => {
  for (const [key, ceiling] of Object.entries(PROVIDER_LIMITS).filter(
    ([key]) => key !== "maxOutputTokens",
  )) {
    for (const value of [0, -1, 0.5, Infinity, ceiling + 1]) {
      await assert.rejects(
        send(async () => Response.json({}), { [key]: value }),
        /Invalid provider limit/,
      );
    }
  }
});

test("transport releases a response from a fetcher that resolves after cancellation", async () => {
  const controller = new AbortController();
  let resolveFetch!: (response: Response) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const request = send(
    async () => {
      started();
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    },
    {},
    controller.signal,
  );
  await ready;
  controller.abort();
  await assert.rejects(request, /cancelled/);
  let cancelled = false;
  resolveFetch(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});
