import { createHash, randomUUID } from "node:crypto";
import {
  parseModelToolTurn,
  parseToolCallingContinuation,
  ToolCallingSession,
} from "@ai-harness/contracts";
import type {
  ModelToolRequest,
  ModelToolTurn,
  ModelToolSpec,
  ProviderToolCallingSession,
  ToolCallingIdentity,
  ToolCallingSessionOptions,
} from "@ai-harness/contracts";
import type { ProviderOptions } from "./index.js";
import { boundedOption, postJson, PROVIDER_LIMITS } from "./transport.js";

type Vendor = "openai" | "anthropic";
const MAX_NATIVE_BYTES = 262_144;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid native response object");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Invalid native response string");
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid native response array");
  return value;
}
function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/** Host specs get wire-safe names; no lossy dot/underscore substitutions. */
function toolNames(tools: readonly ModelToolSpec[]) {
  if (tools.length > 32) throw new Error("Too many provider tools");
  const names = new Map<string, string>();
  const ids = new Set<string>();
  const definitions = tools.map((tool) => {
    if (!/^[a-z][a-z0-9._-]{0,127}$/.test(tool.id) || ids.has(tool.id))
      throw new Error("Invalid or duplicate tool ID");
    ids.add(tool.id);
    const name = `tool_${createHash("sha256").update(tool.id).digest("hex").slice(0, 32)}`;
    if (names.has(name)) throw new Error("Provider tool name collision");
    names.set(name, tool.id);
    return { tool, name };
  });
  return { names, definitions };
}

function normalize(
  vendor: Vendor,
  raw: unknown,
  names: Map<string, string>,
): { turn: ModelToolTurn; native: unknown[] } {
  const data = object(raw);
  const calls: unknown[] = [];
  const texts: string[] = [];
  const native = list(vendor === "openai" ? data.output : data.content);
  if (vendor === "openai" && data.status !== "completed")
    throw new Error("Incomplete OpenAI response");
  if (vendor === "anthropic" && data.role !== "assistant")
    throw new Error("Invalid Anthropic response role");
  for (const rawItem of native) {
    const item = object(rawItem);
    if (
      (vendor === "openai" && item.type === "function_call") ||
      (vendor === "anthropic" && item.type === "tool_use")
    ) {
      if (
        vendor === "openai" &&
        item.status !== undefined &&
        item.status !== "completed"
      )
        throw new Error("Incomplete function call");
      if (item.toolset_name !== undefined)
        throw new Error("Unsupported native toolset");
      const toolId = names.get(string(item.name));
      if (!toolId) throw new Error("Unknown native tool name");
      calls.push({
        id: string(vendor === "openai" ? item.call_id : item.id),
        toolId,
        arguments:
          vendor === "openai" ? JSON.parse(string(item.arguments)) : item.input,
      });
    } else if (vendor === "openai" && item.type === "message") {
      if (
        item.role !== "assistant" ||
        (item.status !== undefined && item.status !== "completed")
      )
        throw new Error("Invalid native message");
      for (const part of list(item.content)) {
        const content = object(part);
        if (content.type !== "output_text")
          throw new Error("Unsupported or refused native message");
        texts.push(string(content.text));
      }
    } else if (vendor === "anthropic" && item.type === "text") {
      texts.push(string(item.text));
    } else if (vendor === "openai" && item.type === "reasoning") {
      // Retain the native reasoning item, including encrypted_content, for replay.
      // It is opaque data, never instructions or authorization.
      if (!string(item.encrypted_content).trim())
        throw new Error("Missing replayable reasoning content");
      list(item.summary);
    } else {
      // No server tools, remote execution, thinking modes or unknown blocks.
      throw new Error("Unsupported native response item");
    }
  }
  if (
    vendor === "anthropic" &&
    data.stop_reason !== (calls.length ? "tool_use" : "end_turn")
  ) {
    throw new Error("Incomplete or unsupported Anthropic stop reason");
  }
  const text = texts.join("\n");
  if (!calls.length && !text.trim()) throw new Error("Empty native response");
  return {
    turn: parseModelToolTurn(
      calls.length
        ? { kind: "tool_calls", calls, ...(text ? { text } : {}) }
        : { kind: "message", text },
    ),
    native,
  };
}

/** Native state is private to one session. No global conversation cache. */
export function createProviderSession(
  vendor: Vendor,
  options: ProviderOptions,
  identity: ToolCallingIdentity,
  sessionOptions: ToolCallingSessionOptions & {
    maxNativeStateBytes?: number;
  } = {},
): ProviderToolCallingSession {
  // Snapshot trusted host configuration, never consult repository/model settings.
  options = { ...options };
  sessionOptions = { ...sessionOptions, limits: { ...sessionOptions.limits } };
  const neutral = new ToolCallingSession(identity, sessionOptions);
  const maxNative = boundedOption(
    sessionOptions.maxNativeStateBytes,
    MAX_NATIVE_BYTES,
  );
  const outputTokens = boundedOption(
    options.maxOutputTokens,
    PROVIDER_LIMITS.maxOutputTokens,
  );
  const closeController = new AbortController();
  let native: unknown[] = [];
  let configuration: string | undefined;
  let busy = false;
  let closed = false;
  const close = () => {
    closed = true;
    closeController.abort();
    native = [];
    configuration = undefined;
    neutral.close();
  };
  return {
    identity: neutral.identity,
    close,
    async completeWithTools(request) {
      // A concurrent rejected request must not close the request already running.
      if (busy) throw new Error("Session request already in flight");
      busy = true;
      try {
        neutral.assertActive();
        if (closed || request.signal?.aborted)
          throw new Error("Session cancelled or closed");
        if (request.toolResults !== undefined)
          throw new Error("Use neutral continuation, not legacy toolResults");
        const continuation = parseToolCallingContinuation(
          request.continuation,
          neutral.identity,
        );
        const own = neutral.snapshot().history;
        const supplied = continuation.history;
        const pending = own.at(-1);
        const prefixLength = own.length;
        if (
          JSON.stringify(supplied.slice(0, prefixLength)) !==
            JSON.stringify(own) ||
          supplied.length !== prefixLength + (pending ? 1 : 0)
        ) {
          throw new Error("Continuation does not match this session");
        }
        const fingerprint = JSON.stringify({
          system: request.system,
          prompt: request.prompt,
          tools: request.tools,
        });
        if (bytes(fingerprint) > maxNative)
          throw new Error("Session configuration size limit exceeded");
        if (configuration !== undefined && configuration !== fingerprint)
          throw new Error("Session configuration changed");
        configuration = fingerprint;
        const { names, definitions } = toolNames(request.tools);
        let input = [...native];
        if (pending) {
          const batch = supplied.at(-1);
          if (batch?.kind !== "tool_results")
            throw new Error("Missing native tool results");
          neutral.recordResults(neutral.identity, batch.results);
          const results = batch.results.map((result) =>
            vendor === "openai"
              ? {
                  type: "function_call_output",
                  call_id: result.callId,
                  output: JSON.stringify(result.data),
                }
              : {
                  type: "tool_result",
                  tool_use_id: result.callId,
                  content: JSON.stringify(result.data),
                },
          );
          input.push(
            ...(vendor === "openai"
              ? results
              : [{ role: "user", content: results }]),
          );
        } else {
          input = [{ role: "user", content: request.prompt }];
        }
        if (bytes(input) + bytes(configuration) > maxNative)
          throw new Error("Native session size limit exceeded");
        const signal = AbortSignal.any([
          closeController.signal,
          ...(sessionOptions.signal ? [sessionOptions.signal] : []),
          ...(request.signal ? [request.signal] : []),
        ]);
        if (signal.aborted) throw new Error("Session cancelled");
        const key =
          options.apiKey ??
          process.env[
            vendor === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"
          ];
        if (!key?.trim()) throw new Error("Missing provider credential");
        const body =
          vendor === "openai"
            ? {
                model: options.model,
                instructions: request.system,
                input,
                store: false,
                include: ["reasoning.encrypted_content"],
                max_output_tokens: outputTokens,
                tools: definitions.map(({ tool, name }) => ({
                  type: "function",
                  name,
                  description: tool.description,
                  parameters: tool.inputSchema,
                  strict: false,
                })),
              }
            : {
                model: options.model,
                system: request.system,
                messages: input,
                max_tokens: outputTokens,
                tools: definitions.map(({ tool, name }) => ({
                  name,
                  description: tool.description,
                  input_schema: tool.inputSchema,
                })),
              };
        const raw = await postJson(
          vendor === "openai"
            ? "https://api.openai.com/v1/responses"
            : "https://api.anthropic.com/v1/messages",
          vendor === "openai"
            ? { authorization: `Bearer ${key}` }
            : { "x-api-key": key, "anthropic-version": "2023-06-01" },
          body,
          options.fetcher ?? fetch,
          options,
          signal,
        );
        neutral.assertActive();
        if (signal.aborted) throw new Error("Session cancelled");
        const parsed = normalize(vendor, raw, names);
        const next = [
          ...input,
          ...(vendor === "openai"
            ? parsed.native
            : [{ role: "assistant", content: parsed.native }]),
        ];
        if (bytes(next) + bytes(configuration) > maxNative)
          throw new Error("Native session size limit exceeded");
        neutral.recordTurn(neutral.identity, parsed.turn);
        native = next;
        return parsed.turn;
      } catch {
        close();
        // No provider text, tool data or secrets are exposed through diagnostics.
        throw new Error("Invalid, cancelled or failed tool-calling session");
      } finally {
        busy = false;
      }
    },
  };
}

/** Single initial turn only. Multi-turn callers must explicitly own a session. */
export async function oneShotToolTurn(
  vendor: Vendor,
  options: ProviderOptions,
  request: ModelToolRequest,
): Promise<ModelToolTurn> {
  if (
    request.toolResults !== undefined &&
    (request.continuation !== undefined || request.toolResults.length > 0)
  ) {
    throw new Error("Tool results require an explicit session");
  }
  const identity = request.continuation?.identity ?? {
    executionId: "one-shot",
    taskId: randomUUID(),
  };
  const session = createProviderSession(vendor, options, identity, {
    signal: request.signal,
  });
  try {
    return await session.completeWithTools({
      ...request,
      toolResults: undefined,
      continuation: request.continuation ?? { identity, history: [] },
    });
  } finally {
    session.close();
  }
}
