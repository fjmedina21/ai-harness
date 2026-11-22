import type {
  ModelRequest,
  ModelResponse,
  ModelToolRequest,
  ModelToolTurn,
  ModelProviderAdapter,
  SessionToolCallingProviderAdapter,
  ProviderToolCallingSession,
  ToolCallingIdentity,
  ToolCallingSessionOptions,
} from "@ai-harness/contracts";
import { parseToolCallingContinuation } from "@ai-harness/contracts";

/** Deterministic offline provider used by the integrated read-only workflow. */
export class FixtureInspectionProvider
  implements ModelProviderAdapter, SessionToolCallingProviderAdapter
{
  readonly id = "fixture";
  private sequence = 0;

  constructor(private readonly readPath: string) {
    if (!readPath.trim() || readPath.length > 4096) {
      throw new Error("Invalid fixture read path");
    }
  }

  async complete(_request: ModelRequest): Promise<ModelResponse> {
    return {
      model: "fixture",
      text: "Fixture run completed without external model calls.",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  async completeWithTools(request: ModelToolRequest): Promise<ModelToolTurn> {
    const history = request.continuation?.history ?? [];
    if (history.some((entry) => entry.kind === "tool_results")) {
      return {
        kind: "message",
        text: "Offline fixture analysis completed after one authorized read-only file operation. No source files were changed; the Harness checkpoint records this run. No tests were executed.",
      };
    }

    if (!request.tools.some((tool) => tool.id === "file.read")) {
      return { kind: "message", text: "No read-only file tool was supplied." };
    }

    this.sequence += 1;
    return {
      kind: "tool_calls",
      calls: [{
        id: `fixture-read-${this.sequence}`,
        toolId: "file.read",
        arguments: { path: this.readPath },
      }],
    };
  }

  openSession(
    identity: ToolCallingIdentity,
    options: ToolCallingSessionOptions = {},
  ): ProviderToolCallingSession {
    const sessionIdentity = Object.freeze({ ...identity });
    const thisProvider = this;
    let closed = false;
    return {
      identity: sessionIdentity,
      close() { closed = true; },
      async completeWithTools(request) {
        if (closed || options.signal?.aborted || request.signal?.aborted)
          throw new Error("Fixture provider session closed");
        parseToolCallingContinuation(request.continuation, sessionIdentity);
        return thisProvider.completeWithTools(request);
      },
    };
  }
}
