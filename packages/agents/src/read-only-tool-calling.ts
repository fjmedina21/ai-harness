import type {
  AgentRole,
  Permission,
  SessionToolCallingProviderAdapter,
} from "@ai-harness/contracts";
import {
  BUILTIN_TOOLS,
  ToolRegistry,
  ToolDispatcher,
  fileReadHandler,
  createGitStatusHandler,
  type GitStatusOptions,
} from "@ai-harness/tools";
import { ToolCallingAgent } from "./tool-calling-agent.js";

export interface ReadOnlyToolCallingOptions {
  requireAtomicFilesystem?: boolean;
  role: AgentRole;
  systemPrompt: string;
  provider: SessionToolCallingProviderAdapter;
  requireApprovalFor: readonly Permission[];
  /** Optional, explicitly selected absolute host executable. */
  git?: GitStatusOptions;
}

/** Explicit host opt-in. No privileged definitions or handlers are registered. */
export function createReadOnlyToolCallingAgent(
  options: ReadOnlyToolCallingOptions,
): ToolCallingAgent {
  const allowedToolIds = options.git
    ? ["file.read", "git.status"]
    : ["file.read"];
  const registry = new ToolRegistry();
  for (const definition of BUILTIN_TOOLS) {
    if (allowedToolIds.includes(definition.id)) registry.register(definition);
  }
  const dispatcher = new ToolDispatcher(registry);
  dispatcher.registerHandler("file.read", fileReadHandler);
  if (options.git)
    dispatcher.registerHandler(
      "git.status",
      createGitStatusHandler(options.git),
    );
  return new ToolCallingAgent({
    ...options,
    registry,
    dispatcher,
    allowedToolIds,
  });
}
