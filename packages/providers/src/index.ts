import { beginTelemetry, endTelemetry } from "@ai-harness/contracts";
import type {
  ModelProviderAdapter,
  ModelRequest,
  ModelResponse,
} from "@ai-harness/contracts";

import { postJson, boundedOption, PROVIDER_LIMITS, type TransportOptions } from "./transport.js";
import { observeProvider, normalizeTokenUsage, ProviderTransportError } from "./telemetry.js";
import { createProviderSession, oneShotToolTurn } from "./tool-session.js";
import type {
  ModelToolRequest,
  ModelToolTurn,
  ProviderToolCallingSession,
  ToolCallingIdentity,
  ToolCallingSessionOptions,
  SessionToolCallingProviderAdapter,
} from "@ai-harness/contracts";

type HttpFetch = typeof fetch;

export interface ProviderOptions extends TransportOptions {
  apiKey?: string;
  model: string;
  fetcher?: HttpFetch;
}

function requireCredential(
  value: string | undefined,
  variable: string,
): string {
  if (!value?.trim()) {
    throw new Error(`Missing credential: ${variable}`);
  }
  return value;
}

export class FixtureProvider implements ModelProviderAdapter {
  readonly id = "fixture";

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const span = beginTelemetry(request.telemetry, "provider.request", { provider: this.id, model: "fixture" });
    const result = {
      model: "fixture",
      text: `Fixture response for: ${request.prompt}`,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      },
    };
    endTelemetry(span, { status: "ok", usage: { availability: "reported", inputTokens: 0, outputTokens: 0 } });
    return result;
  }
}

export class OpenAIProvider
  implements ModelProviderAdapter, SessionToolCallingProviderAdapter
{
  readonly id = "openai";
  private readonly fetcher: HttpFetch;

  constructor(private readonly options: ProviderOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  openSession(
    identity: ToolCallingIdentity,
    options: ToolCallingSessionOptions & { maxNativeStateBytes?: number } = {},
  ): ProviderToolCallingSession {
    return createProviderSession(this.id, this.options, identity, options);
  }

  completeWithTools(request: ModelToolRequest): Promise<ModelToolTurn> {
    return oneShotToolTurn(this.id, this.options, request);
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    return observeProvider(request.telemetry, this.id, this.options.model, request.signal, async (telemetry, reportUsage) => {
      const apiKey = requireCredential(
        this.options.apiKey ?? process.env.OPENAI_API_KEY,
        "OPENAI_API_KEY",
      );

      const data = (await postJson(
        "https://api.openai.com/v1/responses",
        {
          authorization: `Bearer ${apiKey}`,
        },
        {
          model: this.options.model,
          instructions: request.system,
          input: request.prompt,
          max_output_tokens: boundedOption(this.options.maxOutputTokens, PROVIDER_LIMITS.maxOutputTokens),
          store: false,
        },
        this.fetcher,
        this.options,
        request.signal,
        telemetry ? { binding: telemetry, provider: this.id, model: this.options.model } : undefined,
      )) as {
        status?: string;
        output_text?: string;
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
        };
      };

      reportUsage(data);

      if (data.status && data.status !== "completed") {
        throw new ProviderTransportError("OpenAI returned an incomplete response", "invalid_response", undefined, undefined, normalizeTokenUsage("openai", data));
      }

      const text =
        data.output_text ??
        data.output
          ?.flatMap((item) => item.content ?? [])
          .filter((item) => item.type === "output_text")
          .map((item) => item.text ?? "")
          .join("\n") ??
        "";

      if (!text.trim()) {
        throw new ProviderTransportError("OpenAI returned no text content", "invalid_response", undefined, undefined, normalizeTokenUsage("openai", data));
      }

      return {
        model: this.options.model,
        text,
        tokenUsage: normalizeTokenUsage("openai", data),
        usage: {
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
        },
      };
    });
  }
}

export class AnthropicProvider
  implements ModelProviderAdapter, SessionToolCallingProviderAdapter
{
  readonly id = "anthropic";
  private readonly fetcher: HttpFetch;

  constructor(private readonly options: ProviderOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  openSession(
    identity: ToolCallingIdentity,
    options: ToolCallingSessionOptions & { maxNativeStateBytes?: number } = {},
  ): ProviderToolCallingSession {
    return createProviderSession(this.id, this.options, identity, options);
  }

  completeWithTools(request: ModelToolRequest): Promise<ModelToolTurn> {
    return oneShotToolTurn(this.id, this.options, request);
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    return observeProvider(request.telemetry, this.id, this.options.model, request.signal, async (telemetry, reportUsage) => {
      const apiKey = requireCredential(
        this.options.apiKey ?? process.env.ANTHROPIC_API_KEY,
        "ANTHROPIC_API_KEY",
      );

      const data = (await postJson(
        "https://api.anthropic.com/v1/messages",
        {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        {
          model: this.options.model,
          max_tokens: 2048,
          system: request.system,
          messages: [
            {
              role: "user",
              content: request.prompt,
            },
          ],
        },
        this.fetcher,
        this.options,
        request.signal,
        telemetry ? { binding: telemetry, provider: this.id, model: this.options.model } : undefined,
      )) as {
        content?: Array<{
          type: string;
          text?: string;
        }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
        };
      };

      reportUsage(data);

      const text = (data.content ?? [])
        .filter((item) => item.type === "text")
        .map((item) => item.text ?? "")
        .join("\n");

      if (!text.trim()) {
        throw new Error("Anthropic returned no text content");
      }

      return {
        model: this.options.model,
        text,
        usage: {
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
        },
      };
    });
  }
}

export { PROVIDER_LIMITS, PROVIDER_TIMEOUT_CEILING_MS } from "./transport.js";
export type { TransportOptions } from "./transport.js";

export { ProviderTransportError } from "./telemetry.js";
