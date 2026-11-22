import assert from "node:assert/strict";
import test from "node:test";

import { AnthropicProvider, FixtureProvider, OpenAIProvider } from "../index.js";

const request = {
  system: "You are a software engineer",
  prompt: "Explain dependency injection",
  correlationId: "test-001",
};

test("fixture provider works without credentials", async () => {
  const provider = new FixtureProvider();
  const result = await provider.complete(request);

  assert.equal(result.model, "fixture");
  assert.match(result.text, /dependency injection/);
  assert.equal(result.usage?.estimatedCostUsd, 0);
});

test("OpenAI adapter processes mocked responses", async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      store: boolean;
    };

    assert.equal(body.store, false);

    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Dependency injection reduces coupling.",
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 8 },
    });
  };

  const provider = new OpenAIProvider({
    model: "test-model",
    apiKey: "test-only",
    fetcher,
  });

  const result = await provider.complete(request);

  assert.match(result.text, /reduces coupling/);
  assert.equal(result.usage?.inputTokens, 10);
});

test("Anthropic adapter processes mocked responses", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({
      content: [
        {
          type: "text",
          text: "Dependencies are supplied externally.",
        },
      ],
      usage: { input_tokens: 12, output_tokens: 7 },
    });

  const provider = new AnthropicProvider({
    model: "test-model",
    apiKey: "test-only",
    fetcher,
  });

  const result = await provider.complete(request);

  assert.match(result.text, /supplied externally/);
  assert.equal(result.usage?.outputTokens, 7);
});

test("OpenAI adapter rejects failed HTTP responses", async () => {
  const provider = new OpenAIProvider({
    model: "test-model",
    apiKey: "test-only",
    fetcher: async () =>
      new Response("Sensitive upstream error", { status: 401 }),
  });

  await assert.rejects(provider.complete(request), /HTTP 401/);
});
